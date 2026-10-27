import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin } from "../middleware/admin-auth";
import { authorizedSiteIds } from "../utils/admin-access";

const router = Router();
const querySchema = z.object({ siteCode: z.string().trim().max(100).optional(), employeeId: z.string().trim().max(191).optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional(), status: z.enum(["OPEN", "CLOSED"]).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });

async function buildWhere(adminId: string, role: string, input: z.infer<typeof querySchema>) {
  const siteIds = await authorizedSiteIds(adminId, role);
  let selectedSiteId: string | undefined;
  if (input.siteCode) {
    const site = await prisma.constructionSite.findUnique({ where: { siteCode: input.siteCode }, select: { id: true } });
    if (!site) return null;
    selectedSiteId = site.id;
  }
  if (selectedSiteId && siteIds && !siteIds.includes(selectedSiteId)) return null;
  const allowed = selectedSiteId ? [selectedSiteId] : siteIds;
  return { ...(allowed ? { siteId: { in: allowed } } : {}), ...(input.employeeId ? { employeeId: input.employeeId } : {}), ...(input.status ? { status: input.status } : {}), ...(input.from || input.to ? { entryTime: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } } : {}) };
}

const shape = (item: any) => ({ id: item.id, siteCode: item.site.siteCode, siteName: item.site.name, employeeId: item.employee.employeeCode, employeeName: item.employee.fullName, entryTime: item.entryTime.toISOString(), exitTime: item.exitTime?.toISOString() ?? null, status: item.status, durationMinutes: item.exitTime ? Math.max(0, Math.round((item.exitTime.getTime() - item.entryTime.getTime()) / 60000)) : null });
const include = { employee: { select: { employeeCode: true, fullName: true } }, site: { select: { siteCode: true, name: true } } } as const;

router.use(requireAdmin);
router.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid attendance filters." });
  const where = await buildWhere(req.admin!.sub, req.admin!.role, parsed.data); if (!where) return res.status(403).json({ success: false, message: "You are not authorized to view this site." });
  const { page, pageSize } = parsed.data; const [total, records] = await prisma.$transaction([prisma.attendanceRecord.count({ where }), prisma.attendanceRecord.findMany({ where, include, orderBy: { entryTime: "desc" }, skip: (page - 1) * pageSize, take: pageSize })]);
  return res.json({ success: true, data: records.map(shape), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});

router.get("/summary", async (req, res) => {
  const parsed = querySchema.omit({ page: true, pageSize: true }).safeParse(req.query); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid attendance filters." });
  const where = await buildWhere(req.admin!.sub, req.admin!.role, { ...parsed.data, page: 1, pageSize: 1 }); if (!where) return res.status(403).json({ success: false, message: "You are not authorized to view this site." });
  const records = await prisma.attendanceRecord.findMany({ where, select: { status: true, entryTime: true, exitTime: true } });
  const totalDurationMinutes = records.reduce((sum, row) => sum + (row.exitTime ? Math.max(0, Math.round((row.exitTime.getTime() - row.entryTime.getTime()) / 60000)) : 0), 0);
  const group = (key: (row: { entryTime: Date }) => string) => { const map = new Map<string, { period: string; entries: number; exits: number }>(); for (const row of records) { const period = key(row); const item = map.get(period) || { period, entries: 0, exits: 0 }; item.entries += 1; if (row.exitTime) item.exits += 1; map.set(period, item); } return [...map.values()].sort((a, b) => a.period.localeCompare(b.period)); };
  return res.json({ success: true, summary: { totalRecords: records.length, open: records.filter((row) => row.status === "OPEN").length, closed: records.filter((row) => row.status === "CLOSED").length, totalDurationMinutes, averageClosedDurationMinutes: records.filter((row) => row.exitTime).length ? Math.round(totalDurationMinutes / records.filter((row) => row.exitTime).length) : 0, daily: group((row) => row.entryTime.toISOString().slice(0, 10)), monthly: group((row) => row.entryTime.toISOString().slice(0, 7)) } });
});

router.get("/export", async (req, res) => {
  const parsed = querySchema.omit({ page: true, pageSize: true }).extend({ format: z.enum(["csv", "pdf"]).default("csv") }).safeParse(req.query); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid export filters." });
  const where = await buildWhere(req.admin!.sub, req.admin!.role, { ...parsed.data, page: 1, pageSize: 1 }); if (!where) return res.status(403).json({ success: false, message: "You are not authorized to export this site." });
  const records = (await prisma.attendanceRecord.findMany({ where, include, orderBy: { entryTime: "desc" } })).map(shape);
  if (parsed.data.format === "pdf") { const lines = ["SITEPASS ATTENDANCE REPORT", ...records.map((row) => `${row.siteCode} | ${row.employeeId} | ${row.entryTime} | ${row.exitTime ?? "OPEN"} | ${row.status}`)]; const body = lines.join("\\n"); const pdf = `%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R>>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1>>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R>>endobj\n4 0 obj<< /Length ${body.length + 40}>>stream\nBT /F1 9 Tf 40 740 Td (${body.replace(/[()\\]/g, "")}) Tj ET\nendstream endobj\ntrailer<< /Root 1 0 R>>%%EOF`; res.type("application/pdf").set("Content-Disposition", "attachment; filename=attendance-report.pdf").send(pdf); return; }
  const csv = ["id,siteCode,siteName,employeeId,employeeName,entryTime,exitTime,status,durationMinutes", ...records.map((row) => [row.id,row.siteCode,row.siteName,row.employeeId,row.employeeName,row.entryTime,row.exitTime ?? "",row.status,row.durationMinutes ?? ""].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))].join("\n"); return res.type("text/csv").set("Content-Disposition", "attachment; filename=attendance-report.csv").send(csv);
});

export default router;
