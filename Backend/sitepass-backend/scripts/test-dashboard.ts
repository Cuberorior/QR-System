import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/config/prisma';
import { dashboardDays, dashboardSummary } from '../src/services/dashboard-summary';
import { getConfiguredSite } from '../src/utils/single-site';
import { getJwtSecret } from '../src/middleware/admin-auth';
import app from '../src/app';

// Read-only verification against the configured database. Never creates test records.
const now = new Date();
const ranges = dashboardDays(new Date('2026-01-01T00:00:00Z'));
assert.equal(ranges[0].date, '2025-12-26');
assert.equal(ranges[6].end.toISOString(), '2026-01-02T00:00:00.000Z');
assert.equal(dashboardDays(new Date('2024-03-01T23:59:59Z'))[5].date, '2024-02-29');
let server: ReturnType<typeof app.listen> | undefined;
try {
  const site = await getConfiguredSite();
  assert.ok(site, 'A configured site is required for database verification.');
  const data = await dashboardSummary([site.id], now);
  const days = dashboardDays(now);
  const today = days[6].start, tomorrow = days[6].end;
  const [attendance] = await prisma.$queryRaw<Array<{ open: bigint; entries: bigint; exits: bigint }>>`
    SELECT COALESCE(SUM(status = 'OPEN'), 0) AS open,
      COALESCE(SUM(entryTime >= ${today} AND entryTime < ${tomorrow}), 0) AS entries,
      COALESCE(SUM(exitTime >= ${today} AND exitTime < ${tomorrow}), 0) AS exits
    FROM AttendanceRecord WHERE siteId = ${site.id}`;
  assert.equal(data.stats.checkedInEmployees, Number(attendance.open));
  assert.equal(data.stats.todayEntries, Number(attendance.entries));
  assert.equal(data.stats.todayExits, Number(attendance.exits));
  const [visitors] = await prisma.$queryRaw<Array<{ active: bigint; completed: bigint; awaiting: bigint }>>`
    SELECT COALESCE(SUM(visitStatus = 'CHECKED_IN'), 0) AS active,
      COALESCE(SUM(visitStatus = 'CHECKED_OUT' AND exitTime >= ${today} AND exitTime < ${tomorrow}), 0) AS completed,
      COALESCE(SUM(visitStatus = 'REGISTERED' AND revokedAt IS NULL AND credentialExpiresAt > ${now}), 0) AS awaiting
    FROM VisitorVisit WHERE siteId = ${site.id}`;
  assert.equal(data.stats.checkedInVisitors, Number(visitors.active));
  assert.equal(data.visitorStatus.completed, Number(visitors.completed));
  assert.equal(data.visitorStatus.awaitingEntry, Number(visitors.awaiting));
  const weekStart = days[0].start;
  for (const field of ['entryTime', 'exitTime'] as const) {
    // Field is a fixed test constant, not user input.
    const rows = await prisma.$queryRawUnsafe<Array<{ day: string; total: bigint }>>(
      `SELECT DATE_FORMAT(${field}, '%Y-%m-%d') AS day, COUNT(*) AS total FROM AttendanceRecord WHERE siteId = ? AND ${field} >= ? AND ${field} < ? GROUP BY day`, site.id, weekStart, tomorrow);
    const counts = new Map(rows.map(row => [row.day, Number(row.total)]));
    for (const point of data.accessOverview) assert.equal(point[field === 'entryTime' ? 'entries' : 'exits'], counts.get(point.date) || 0);
  }
  for (const row of data.recentAttendance) {
    const saved = await prisma.attendanceRecord.findUniqueOrThrow({ where: { id: row.id }, include: { employee: true } });
    assert.equal(row.employeeName, saved.employee.fullName);
    assert.equal(row.employeeCode, saved.employee.employeeCode);
    assert.equal(row.entryTime.toISOString(), saved.entryTime.toISOString());
    assert.equal(row.exitTime?.toISOString(), saved.exitTime?.toISOString());
    assert.equal(row.status, saved.status);
  }
  for (const row of data.recentVisitors) {
    const saved = await prisma.visitorVisit.findUniqueOrThrow({ where: { id: row.id }, include: { visitor: true } });
    assert.equal(row.purpose, saved.purpose);
    assert.equal(row.visitorName, saved.visitor.fullName);
    assert.equal(row.visitorCode, saved.visitor.visitorCode);
    assert.equal(row.entryTime?.toISOString(), saved.entryTime?.toISOString());
    assert.equal(row.exitTime?.toISOString(), saved.exitTime?.toISOString());
    assert.equal(row.visitStatus, saved.visitStatus);
  }
  assert.equal(data.accessOverview.length, 7);
  assert.ok(data.recentAttendance.every((row, i, rows) => i === 0 || rows[i - 1].entryTime >= row.entryTime));
  assert.ok(!/accessCode|password|tokenHash|authorizationToken/.test(JSON.stringify(data)));
  const empty = await dashboardSummary([], now);
  assert.equal(empty.site, null);
  assert.ok(Object.values(empty.stats).every(value => value === 0));
  assert.equal(empty.recentAttendance.length + empty.recentVisitors.length, 0);
  assert.ok(empty.accessOverview.every(day => !day.entries && !day.exits));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/admin/dashboard`;
  assert.equal((await fetch(base)).status, 401);
  const admin = await prisma.administrator.findFirst({ where: { isActive: true, role: 'ADMIN' } });
  assert.ok(admin, 'An active administrator is required for authenticated endpoint verification.');
  const token = jwt.sign({ sub: admin.id, role: admin.role }, getJwtSecret(), { expiresIn: '2m' });
  const response = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).site.id, site.id);
  console.log('PASS: UTC boundaries, four KPIs, seven daily buckets, both status charts, saved activity fields, empty scope, sensitive-field exclusion, and JWT endpoint access.');
  console.log(JSON.stringify({ stats: data.stats, attendanceRows: data.recentAttendance.length, visitorRows: data.recentVisitors.length }));
} finally {
  server?.close();
  await prisma.$disconnect();
}
