import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin } from "../middleware/admin-auth";
import { authorizedSiteIds } from "../utils/admin-access";
import { buildVisitorPdf, type VisitorReportRow } from "../services/visitor-report-pdf";

const router = Router();
const visitorFilterSchema = z.object({
  q: z.string().trim().max(191).optional(), email: z.string().trim().max(191).optional(), purpose: z.string().trim().max(500).optional(), siteCode: z.string().trim().max(100).optional(),
  visitStatus: z.enum(["REGISTERED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED"]).optional(), safetyStatus: z.enum(["COMPLETED", "PENDING", "NOT_RECORDED"]).optional(),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
});
const validateDateRange = (value: { from?: Date; to?: Date }, ctx: z.RefinementCtx) => { if (value.from && value.to && value.from > value.to) ctx.addIssue({ code: "custom", path: ["from"], message: "Start date cannot be after end date." }); };
const querySchema = visitorFilterSchema.extend({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }).superRefine(validateDateRange);
const visitorExportSchema = visitorFilterSchema.extend({ format: z.literal("pdf") }).superRefine(validateDateRange);
const clearSchema = visitorFilterSchema.extend({ confirmation: z.literal("CLEAR") }).superRefine(validateDateRange);

const include = { visitor: true, site: { select: { siteCode: true, name: true } } } as const;
async function emailStatus(visitorVisitId: string) { return prisma.emailDelivery.findFirst({ where: { visitorVisitId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, createdAt: true, updatedAt: true } }); }
async function buildWhere(adminId: string, role: string, input: z.infer<typeof querySchema>) {
  const ids = await authorizedSiteIds(adminId, role); let siteId: string | undefined;
  if (input.siteCode) { const site = await prisma.constructionSite.findUnique({ where: { siteCode: input.siteCode }, select: { id: true } }); if (!site || (ids && !ids.includes(site.id))) return null; siteId = site.id; }
  const visitorFilters: any[] = []; if (input.q) visitorFilters.push({ OR: [{ fullName: { contains: input.q } }, { visitorCode: { contains: input.q } }] }); if (input.email) visitorFilters.push({ email: { contains: input.email } });
  return { ...(siteId ? { siteId } : ids ? { siteId: { in: ids } } : {}), ...(input.visitStatus ? { visitStatus: input.visitStatus } : {}), ...(visitorFilters.length ? { visitor: { is: { AND: visitorFilters } } } : {}), ...(input.purpose ? { purpose: { contains: input.purpose } } : {}), ...(input.safetyStatus === "COMPLETED" ? { safetySubmittedAt: { not: null } } : {}), ...(input.safetyStatus === "PENDING" || input.safetyStatus === "NOT_RECORDED" ? { safetySubmittedAt: null } : {}), ...(input.from || input.to ? { createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } } : {}) };
}
function shape(visit: any): VisitorReportRow & Record<string, unknown> { return { id: visit.id, visitorCode: visit.visitor.visitorCode, fullName: visit.visitor.fullName, phone: visit.visitor.phone, email: visit.visitor.email, organization: visit.visitor.organization, purpose: visit.purpose || null, siteCode: visit.site.siteCode, siteName: visit.site.name, visitStatus: visit.visitStatus, safetyStatus: visit.safetySubmittedAt ? "COMPLETED" : "NOT_RECORDED", safetySubmittedAt: visit.safetySubmittedAt?.toISOString() || null, emailVerified: Boolean(visit.emailVerifiedAt), revoked: Boolean(visit.revokedAt), entryTime: visit.entryTime?.toISOString() || null, exitTime: visit.exitTime?.toISOString() || null, createdAt: visit.createdAt.toISOString() }; }

router.use(requireAdmin);
router.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid visitor filters." });
  const where = await buildWhere(req.admin!.sub, req.admin!.role, parsed.data); if (!where) return res.status(403).json({ success: false, message: "You are not authorized to view this visitor data." });
  const [total, visits] = await prisma.$transaction([prisma.visitorVisit.count({ where }), prisma.visitorVisit.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: (parsed.data.page - 1) * parsed.data.pageSize, take: parsed.data.pageSize })]);
  return res.json({ success: true, visitors: await Promise.all(visits.map(async (visit) => ({ ...shape(visit), emailDelivery: await emailStatus(visit.id) }))), pagination: { page: parsed.data.page, pageSize: parsed.data.pageSize, total, totalPages: Math.ceil(total / parsed.data.pageSize) } });
});
router.get("/export", async (req, res) => {
  const parsed = visitorExportSchema.safeParse(req.query); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid visitor export filters." });
  const where = await buildWhere(req.admin!.sub, req.admin!.role, { ...parsed.data, page: 1, pageSize: 1 }); if (!where) return res.status(403).json({ success: false, message: "You are not authorized to export this visitor data." });
  const records = (await prisma.visitorVisit.findMany({ where, include, orderBy: { createdAt: "desc" } })).map(shape); if (!records.length) return res.status(404).json({ success: false, message: "No visitor records match the selected filters." });
  const siteCodes = new Set(records.map((record) => record.siteCode)); const siteLabel = siteCodes.size === 1 ? `${records[0].siteName} (${records[0].siteCode})` : "Multiple authorized construction sites"; const dateRange = parsed.data.from || parsed.data.to ? `${parsed.data.from?.toISOString().slice(0, 10) || "All earlier dates"} to ${parsed.data.to?.toISOString().slice(0, 10) || "All later dates"}` : "All dates"; const filterParts = [parsed.data.q && `Visitor ${parsed.data.q}`, parsed.data.email && `Email ${parsed.data.email}`, parsed.data.purpose && `Reason ${parsed.data.purpose}`, parsed.data.visitStatus && `Status ${parsed.data.visitStatus.replace("_", " ")}`, parsed.data.safetyStatus && `Safety ${parsed.data.safetyStatus.replace("_", " ")}`].filter(Boolean).join("; ") || "All authorized visitor records";
  const pdf = await buildVisitorPdf(records, { siteLabel, dateRange, filters: filterParts, timezone: "UTC" }); const from = parsed.data.from?.toISOString().slice(0, 10) || "all"; const to = parsed.data.to?.toISOString().slice(0, 10) || "dates"; return res.type("application/pdf").set("Content-Disposition", `attachment; filename=SITEPASS_Visitors_${from}_to_${to}.pdf`).send(pdf);
});
router.delete("/", async (req, res) => {
  const parsed = clearSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Type CLEAR to confirm removing visitor history." });
  if (parsed.data.visitStatus === "CHECKED_IN") return res.status(409).json({ success: false, message: "Checked-in visitors cannot be cleared. Check them out first." });
  const where = await buildWhere(req.admin!.sub, req.admin!.role, { ...parsed.data, page: 1, pageSize: 1 }); if (!where) return res.status(403).json({ success: false, message: "You are not authorized to clear visitor history for this site." });
  const safeWhere: any = { AND: [where, { visitStatus: { not: "CHECKED_IN" } }] };
  const result = await prisma.$transaction(async tx => {
    const visits = await tx.visitorVisit.findMany({ where: safeWhere, select: { id: true } }); if (!visits.length) return { count: 0 };
    const ids = visits.map(visit => visit.id);
    await tx.emailDelivery.deleteMany({ where: { visitorVisitId: { in: ids } } });
    const deleted = await tx.visitorVisit.deleteMany({ where: { id: { in: ids } } });
    await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "VISITOR_HISTORY_CLEARED", entityType: "VisitorVisit", details: { clearedCount: deleted.count, siteCode: parsed.data.siteCode || null, checkedInVisitorsPreserved: true } } });
    return { count: deleted.count };
  });
  if (!result.count) return res.status(404).json({ success: false, message: "No historical visitor records match the selected filters." });
  return res.json({ success: true, deletedCount: result.count, message: `${result.count} visitor record${result.count === 1 ? "" : "s"} cleared. Checked-in visitors were preserved.` });
});
export default router;
