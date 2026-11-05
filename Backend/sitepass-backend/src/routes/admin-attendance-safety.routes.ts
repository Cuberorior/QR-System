import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin } from "../middleware/admin-auth";
import { authorizedSiteIds } from "../utils/admin-access";
import { buildAttendanceCsv } from "../services/attendance-report";
import { buildAttendancePdf } from "../services/attendance-pdf";
import { expireOpenAttendance } from "../services/attendance-auto-exit";

const router = Router();
const querySchema = z.object({ siteCode: z.string().trim().max(100).optional(), employeeId: z.string().trim().max(191).optional(), employeeQuery: z.string().trim().max(191).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), status: z.enum(["OPEN", "CLOSED"]).optional(), safetyStatus: z.enum(["DECLARED", "PENDING", "MISSING", "NOT_RECORDED"]).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
const clearSchema = querySchema.omit({ page: true, pageSize: true }).extend({ confirmation: z.literal("CLEAR") });
const include = { employee: { select: { employeeCode: true, fullName: true } }, site: { select: { siteCode: true, name: true } }, safetyDeclaration: { select: { id: true, checklistVersion: true, responseSnapshot: true, submittedAt: true, consumedAt: true, status: true } } } as const;
async function buildWhere(adminId: string, role: string, input: z.infer<typeof querySchema>) { const siteIds = await authorizedSiteIds(adminId, role); let selectedSiteId: string | undefined; if (input.siteCode) { const site = await prisma.constructionSite.findUnique({ where: { siteCode: input.siteCode }, select: { id: true } }); if (!site) return null; selectedSiteId = site.id; } if (selectedSiteId && siteIds && !siteIds.includes(selectedSiteId)) return null; const allowed = selectedSiteId ? [selectedSiteId] : siteIds; const employeeFilter = input.employeeQuery ? { OR: [{ fullName: { contains: input.employeeQuery } }, { employeeCode: { contains: input.employeeQuery } }] } : undefined; return { ...(allowed ? { siteId: { in: allowed } } : {}), ...(input.employeeId ? { employeeId: input.employeeId } : {}), ...(employeeFilter ? { employee: { is: employeeFilter } } : {}), ...(input.status ? { status: input.status } : {}), ...(input.safetyStatus === "DECLARED" ? { safetyDeclaration: { isNot: null } } : {}), ...(input.safetyStatus === "PENDING" ? { safetyDeclaration: { is: { status: "DECLARED" as const } } } : {}), ...(input.safetyStatus === "MISSING" || input.safetyStatus === "NOT_RECORDED" ? { safetyDeclaration: { is: null } } : {}), ...(input.from || input.to ? { entryTime: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } } : {}) }; }
const shape = (item: any) => ({ id: item.id, siteCode: item.site.siteCode, siteName: item.site.name, employeeId: item.employee.employeeCode, employeeName: item.employee.fullName, entryTime: item.entryTime.toISOString(), exitTime: item.exitTime?.toISOString() ?? null, status: item.status, durationMinutes: item.exitTime ? Math.max(0, Math.round((item.exitTime.getTime() - item.entryTime.getTime()) / 60000)) : null, safetyStatus: item.safetyDeclaration ? "DECLARED" : "NOT_RECORDED", safetyDeclaration: item.safetyDeclaration ? { id: item.safetyDeclaration.id, checklistVersion: item.safetyDeclaration.checklistVersion, responses: item.safetyDeclaration.responseSnapshot, submittedAt: item.safetyDeclaration.submittedAt.toISOString(), consumedAt: item.safetyDeclaration.consumedAt?.toISOString() ?? null } : null });
router.use(requireAdmin);
router.use(async (req, _res, next) => {
  const siteIds = await authorizedSiteIds(req.admin!.sub, req.admin!.role);
  await expireOpenAttendance(new Date(), siteIds ? { siteId: { in: siteIds } } : {});
  next();
});
router.get("/", async (req, res) => { const parsed = querySchema.safeParse(req.query); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid attendance filters." }); const where = await buildWhere(req.admin!.sub, req.admin!.role, parsed.data); if (!where) return res.status(403).json({ success: false, message: "You are not authorized to view this site." }); const { page, pageSize } = parsed.data; const [total, records] = await prisma.$transaction([prisma.attendanceRecord.count({ where }), prisma.attendanceRecord.findMany({ where, include, orderBy: { entryTime: "desc" }, skip: (page - 1) * pageSize, take: pageSize })]); return res.json({ success: true, data: records.map(shape), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } }); });
router.get("/summary", async (req, res) => { const parsed = querySchema.omit({ page: true, pageSize: true }).safeParse(req.query); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid attendance filters." }); const where = await buildWhere(req.admin!.sub, req.admin!.role, { ...parsed.data, page: 1, pageSize: 1 }); if (!where) return res.status(403).json({ success: false, message: "You are not authorized to view this site." }); const records = await prisma.attendanceRecord.findMany({ where, select: { status: true, entryTime: true, exitTime: true } }); const totalDurationMinutes = records.reduce((sum, row) => sum + (row.exitTime ? Math.max(0, Math.round((row.exitTime.getTime() - row.entryTime.getTime()) / 60000)) : 0), 0); return res.json({ success: true, summary: { totalRecords: records.length, open: records.filter(row => row.status === "OPEN").length, closed: records.filter(row => row.status === "CLOSED").length, totalDurationMinutes, averageClosedDurationMinutes: records.filter(row => row.exitTime).length ? Math.round(totalDurationMinutes / records.filter(row => row.exitTime).length) : 0 } }); });
router.get("/export", async (req, res) => {
  const parsed = querySchema.omit({ page: true, pageSize: true }).extend({ format: z.enum(["csv", "pdf"]).default("csv") }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid export filters." });
  if (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to) return res.status(400).json({ success: false, message: "Start date cannot be after end date." });
  const where = await buildWhere(req.admin!.sub, req.admin!.role, { ...parsed.data, page: 1, pageSize: 1 });
  if (!where) return res.status(403).json({ success: false, message: "You are not authorized to export this site." });
  const records = (await prisma.attendanceRecord.findMany({ where, include, orderBy: { entryTime: "desc" } })).map(shape);
  if (!records.length) return res.status(404).json({ success: false, message: "No attendance records match the selected filters." });
  const filterParts = [parsed.data.employeeId && `Employee ${parsed.data.employeeId}`, parsed.data.employeeQuery && `Employee search “${parsed.data.employeeQuery}”`, parsed.data.status && `Attendance ${parsed.data.status === "OPEN" ? "Open" : "Closed"}`, parsed.data.safetyStatus && `Safety ${parsed.data.safetyStatus === "DECLARED" ? "Declared" : "Not recorded"}`].filter(Boolean).join("; ") || "All authorized attendance records";
  const siteCodes = new Set(records.map((record) => record.siteCode));
  const siteLabel = siteCodes.size === 1 ? `${records[0].siteName} (${records[0].siteCode})` : "Multiple authorized construction sites";
  const dateRange = parsed.data.from || parsed.data.to ? `${parsed.data.from?.toISOString().slice(0, 10) || "All earlier dates"} to ${parsed.data.to?.toISOString().slice(0, 10) || "All later dates"}` : "All dates";
  const baseName = `SITEPASS_Attendance_${parsed.data.from?.toISOString().slice(0, 10) || "all"}_to_${parsed.data.to?.toISOString().slice(0, 10) || "dates"}`;
  if (parsed.data.format === "pdf") { const pdf = await buildAttendancePdf(records, { siteLabel, dateRange, filters: filterParts, timezone: "UTC" }); return res.type("application/pdf").set("Content-Disposition", `attachment; filename=${baseName}.pdf`).send(pdf); }
  return res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${baseName}.csv` }).send(buildAttendanceCsv(records));
});
router.delete("/", async (req, res) => {
  const parsed = clearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Type CLEAR to confirm removing attendance history." });
  if (parsed.data.status === "OPEN") return res.status(409).json({ success: false, message: "Open attendance sessions cannot be cleared. Select closed or all records to clear historical attendance only." });
  const where = await buildWhere(req.admin!.sub, req.admin!.role, { ...parsed.data, status: "CLOSED", page: 1, pageSize: 1 });
  if (!where) return res.status(403).json({ success: false, message: "You are not authorized to clear attendance for this site." });
  const result = await prisma.$transaction(async tx => {
    const records = await tx.attendanceRecord.findMany({ where, select: { id: true } });
    if (!records.length) return { count: 0 };
    const ids = records.map(record => record.id);
    await tx.safetyDeclaration.deleteMany({ where: { attendanceRecordId: { in: ids } } });
    const deleted = await tx.attendanceRecord.deleteMany({ where: { id: { in: ids } } });
    await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "ATTENDANCE_HISTORY_CLEARED", entityType: "AttendanceRecord", details: { clearedCount: deleted.count, siteCode: parsed.data.siteCode || null, historicalOnly: true } } });
    return { count: deleted.count };
  });
  if (!result.count) return res.status(404).json({ success: false, message: "No closed attendance records match the selected filters." });
  return res.json({ success: true, deletedCount: result.count, message: `${result.count} attendance record${result.count === 1 ? "" : "s"} cleared. Open sessions were preserved.` });
});
router.get("/:attendanceId/safety", async (req, res) => { const record = await prisma.attendanceRecord.findUnique({ where: { id: req.params.attendanceId }, include }); if (!record) return res.status(404).json({ success: false, message: "Attendance record not found." }); const allowed = await authorizedSiteIds(req.admin!.sub, req.admin!.role); if (allowed && !allowed.includes(record.siteId)) return res.status(403).json({ success: false, message: "You are not authorized to view this attendance record." }); return res.json({ success: true, safety: shape(record).safetyDeclaration, safetyStatus: shape(record).safetyStatus }); });

export default router;
