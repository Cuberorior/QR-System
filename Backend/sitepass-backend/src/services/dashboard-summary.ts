import { prisma } from "../config/prisma";
import { Prisma } from "../../generated/prisma/client";
import { expireOpenAttendance } from "./attendance-auto-exit";

/** Reporting follows the UTC calendar used by attendance and visitor reports. */
export function dashboardDays(now: Date) {
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() + index - 6);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end, date: start.toISOString().slice(0, 10) };
  });
}

export function currentWeekRange(now: Date) {
  const weekStart = new Date(now);
  weekStart.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return { gte: weekStart, lt: weekEnd };
}

export async function dashboardSummary(siteIds: string[], availableSiteIds = siteIds, now = new Date()) {
  await expireOpenAttendance(now, { siteId: { in: siteIds } });
  const days = dashboardDays(now);
  const today = days[6];
  const currentWeek = currentWeekRange(now);
  const scope = { siteId: { in: siteIds } };
  const todayRange = { gte: today.start, lt: today.end };
  // A single consistent snapshot; bounded database counts, never full history downloads.
  return prisma.$transaction(async (tx) => {
    const sites = await tx.constructionSite.findMany({ where: { id: { in: availableSiteIds } }, select: { id: true, name: true, siteCode: true, isActive: true }, orderBy: { name: "asc" } });
    const site = siteIds.length === 1 ? sites.find((item) => item.id === siteIds[0]) || null : null;
    const checkedInEmployees = await tx.attendanceRecord.count({ where: { ...scope, status: "OPEN" } });
    const checkedInVisitors = await tx.visitorVisit.count({ where: { ...scope, visitStatus: "CHECKED_IN" } });
    const completedVisits = await tx.visitorVisit.count({ where: { ...scope, visitStatus: "CHECKED_OUT", exitTime: todayRange } });
    const awaitingEntry = await tx.visitorVisit.count({ where: { ...scope, visitStatus: "REGISTERED", revokedAt: null, credentialExpiresAt: { gt: now } } });
    type DailyCount = { date: string; total: bigint };
    // Group in MySQL: only seven aggregate rows per series cross the wire.
    const entries = siteIds.length ? await tx.$queryRaw<DailyCount[]>(Prisma.sql`
      SELECT DATE_FORMAT(entryTime, '%Y-%m-%d') AS date, COUNT(*) AS total
      FROM AttendanceRecord WHERE siteId IN (${Prisma.join(siteIds)})
        AND entryTime >= ${days[0].start} AND entryTime < ${today.end}
      GROUP BY date`) : [];
    const exits = siteIds.length ? await tx.$queryRaw<DailyCount[]>(Prisma.sql`
      SELECT DATE_FORMAT(exitTime, '%Y-%m-%d') AS date, COUNT(*) AS total
      FROM AttendanceRecord WHERE siteId IN (${Prisma.join(siteIds)})
        AND exitTime >= ${days[0].start} AND exitTime < ${today.end}
      GROUP BY date`) : [];
    const entriesByDate = new Map(entries.map(row => [row.date, Number(row.total)]));
    const exitsByDate = new Map(exits.map(row => [row.date, Number(row.total)]));
    const accessOverview = days.map(day => ({ date: day.date, entries: entriesByDate.get(day.date) ?? 0, exits: exitsByDate.get(day.date) ?? 0 }));
    // Retain legacy response fields for existing API consumers, without displaying approval metrics.
    const totalEmployees = await tx.employee.count({ where: scope });
    const activeEmployees = await tx.employee.count({ where: { ...scope, isActive: true } });
    const pendingVisitorApprovals = await tx.visitorVisit.count({ where: { ...scope, approvalStatus: "PENDING" } });
    const todayVisitorEntries = await tx.visitorVisit.count({ where: { ...scope, entryTime: todayRange } });
    const todayVisitorExits = await tx.visitorVisit.count({ where: { ...scope, exitTime: todayRange } });
    const recentAttendance = await tx.attendanceRecord.findMany({
      where: { ...scope, entryTime: currentWeek }, orderBy: [{ entryTime: "desc" }, { id: "desc" }], take: 6,
      select: { id: true, entryTime: true, exitTime: true, status: true, employee: { select: { fullName: true, employeeCode: true } } },
    });
    const recentVisitors = await tx.visitorVisit.findMany({
      where: { ...scope, updatedAt: currentWeek }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 6,
      select: { id: true, purpose: true, entryTime: true, exitTime: true, visitStatus: true, revokedAt: true, credentialExpiresAt: true, visitor: { select: { fullName: true, visitorCode: true } } },
    });
    return {
      success: true, site, sites, timezone: "UTC", generatedAt: now.toISOString(),
      stats: { totalSites: sites.length, activeSites: sites.filter((item) => item.isActive).length, totalEmployees, activeEmployees, pendingVisitorApprovals, todayVisitorEntries, todayVisitorExits, checkedInEmployees, todayEntries: accessOverview[6].entries, todayExits: accessOverview[6].exits, checkedInVisitors },
      accessOverview,
      // Disjoint session sets: currently open (including overnight) and closed today.
      attendanceStatus: { checkedIn: checkedInEmployees, checkedOut: accessOverview[6].exits },
      visitorStatus: { checkedIn: checkedInVisitors, completed: completedVisits, awaitingEntry },
      recentAttendance: recentAttendance.map(({ employee, ...record }) => ({ ...record, employeeName: employee.fullName, employeeCode: employee.employeeCode, siteCode: site?.siteCode })),
      recentVisitors: recentVisitors.map(({ visitor, revokedAt, credentialExpiresAt, ...visit }) => ({ ...visit, visitorName: visitor.fullName, visitorCode: visitor.visitorCode, displayStatus: revokedAt ? "REVOKED" : visit.visitStatus === "REGISTERED" && credentialExpiresAt && credentialExpiresAt <= now ? "EXPIRED" : visit.visitStatus })),
    };
  }, { isolationLevel: "RepeatableRead", timeout: 15000 });
}
