import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin } from "../middleware/admin-auth";
import { authorizedSiteIds } from "../utils/admin-access";
import { dashboardSummary } from "../services/dashboard-summary";
import { Prisma } from "../../generated/prisma/client";

const router = Router(); router.use(requireAdmin);
router.get("/", async (req, res) => {
  const requestedSiteCode = typeof req.query.siteCode === "string" ? req.query.siteCode.trim() : "";
  const authorized = await authorizedSiteIds(req.admin!.sub, req.admin!.role);
  let siteIds = authorized ?? [];
  if (requestedSiteCode) {
    const site = await prisma.constructionSite.findUnique({ where: { siteCode: requestedSiteCode }, select: { id: true } });
    if (!site || (authorized && !authorized.includes(site.id))) return res.status(404).json({ success: false, message: "Construction site not found or not authorized." });
    siteIds = [site.id];
  } else if (authorized === undefined) {
    siteIds = (await prisma.constructionSite.findMany({ select: { id: true } })).map((site) => site.id);
  }
  return res.json(await dashboardSummary(siteIds));
});
const auditQuerySchema = z.object({
  siteCode: z.string().trim().max(100).optional(),
  q: z.string().trim().max(150).optional(),
  category: z.enum(["Attendance", "Safety", "Employee Management", "Visitor Management", "Site Management", "Administration"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  export: z.enum(["csv"]).optional(),
});
const auditClearSchema = auditQuerySchema.omit({ page: true, pageSize: true, export: true }).extend({ confirmation: z.literal("CLEAR") });

const actionLabels: Record<string, string> = {
  ATTENDANCE_ENTRY: "Employee Checked In",
  ATTENDANCE_EXIT: "Employee Checked Out",
  ATTENDANCE_AUTO_EXIT: "Employee Automatically Checked Out (10 hours)",
  SAFETY_DECLARATION_SUBMITTED: "Safety Checklist Submitted",
  SAFETY_DECLARATION_CONSUMED: "Safety Verification Completed",
  EMPLOYEE_CREATED: "Employee Created",
  EMPLOYEE_ARCHIVED: "Employee Archived",
};

const categoryActions: Record<string, string[]> = {
  Attendance: ["ATTENDANCE_ENTRY", "ATTENDANCE_EXIT", "ATTENDANCE_AUTO_EXIT"],
  Safety: ["SAFETY_DECLARATION_SUBMITTED", "SAFETY_DECLARATION_CONSUMED"],
  "Employee Management": ["EMPLOYEE_CREATED", "EMPLOYEE_UPDATED", "EMPLOYEE_ACTIVATED", "EMPLOYEE_DEACTIVATED", "EMPLOYEE_ARCHIVED", "EMPLOYEE_ACCESS_CODE_RESET", "EMPLOYEE_ACCESS_CODE_REGENERATED"],
  "Visitor Management": ["VISITOR_REGISTERED", "VISITOR_EMAIL_VERIFIED", "VISITOR_CHECK_IN", "VISITOR_CHECK_OUT", "VISITOR_APPROVED", "VISITOR_REJECTED", "VISITOR_REVOKED", "VISITOR_CREDENTIALS_REGENERATED"],
  "Site Management": ["SITE_CREATED", "SITE_UPDATED", "SITE_ACTIVATED", "SITE_DEACTIVATED", "GPS_SETTINGS_CHANGED"],
  Administration: ["ADMINISTRATOR_CREATED", "ADMINISTRATOR_UPDATED", "ADMINISTRATOR_ACTIVATED", "ADMINISTRATOR_DEACTIVATED", "ADMINISTRATOR_PASSWORD_RESET"],
};
const categoryEntityTypes: Record<string, string> = { Attendance: "AttendanceRecord", Safety: "SafetyDeclaration", "Employee Management": "Employee", "Visitor Management": "VisitorVisit", "Site Management": "ConstructionSite", Administration: "Administrator" };

const categoryFor = (action: string, entityType: string): string => {
  const actionCategory = Object.entries(categoryActions).find(([, actions]) => actions.includes(action))?.[0];
  if (actionCategory) return actionCategory;
  if (entityType === "AttendanceRecord") return "Attendance";
  if (entityType === "SafetyDeclaration") return "Safety";
  if (entityType === "Employee") return "Employee Management";
  if (entityType === "Visitor" || entityType === "VisitorVisit") return "Visitor Management";
  if (entityType === "ConstructionSite") return "Site Management";
  return "Administration";
};

const readableAction = (action: string): string => actionLabels[action] || action.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
const readableField = (field: string): string => field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^./, (value) => value.toUpperCase());
const sensitiveKey = /(password|token|secret|hash|access.?code|authorization|cookie|jwt|api.?key)/i;

function safeDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeDetails);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? "[redacted]" : safeDetails(item)]));
}

function detailsSummary(value: unknown): string {
  if (!value || typeof value !== "object") return value == null ? "No additional details" : String(value);
  return Object.entries(value as Record<string, unknown>).filter(([key]) => !sensitiveKey.test(key)).map(([key, item]) => `${readableField(key)}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`).join(" · ") || "No additional details";
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export const auditRouter = Router(); auditRouter.use(requireAdmin); auditRouter.get("/", async (req, res) => {
  const parsed = auditQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid audit filters." });
  const { q, category, from, to, page, pageSize, export: exportFormat, siteCode } = parsed.data;
  let siteFilter: Record<string, unknown> | undefined;
  if (siteCode) {
    const site = await prisma.constructionSite.findUnique({ where: { siteCode }, select: { id: true } });
    const allowed = await authorizedSiteIds(req.admin!.sub, req.admin!.role);
    if (!site || (allowed && !allowed.includes(site.id))) return res.status(403).json({ success: false, message: "You are not authorized to view this site's audit logs." });
    siteFilter = { OR: [{ entityType: "ConstructionSite", entityId: site.id }, { details: { path: ["siteCode"], equals: siteCode } }] };
  }
  const categoryFilter = category ? { OR: [{ action: { in: categoryActions[category] } }, { entityType: categoryEntityTypes[category] }] } : undefined;
  const dateFilter = from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : undefined;
  const actorMatches = q ? await Promise.all([
    prisma.administrator.findMany({ where: { OR: [{ fullName: { contains: q } }, { email: { contains: q } }] }, select: { id: true } }),
    prisma.employee.findMany({ where: { OR: [{ fullName: { contains: q } }, { employeeCode: { contains: q } }] }, select: { id: true } }),
  ]) : [[], []];
  const actorIds = actorMatches.flat().map((actor) => actor.id);
  const searchFilter = q ? { OR: [{ action: { contains: q } }, { entityType: { contains: q } }, { actorType: { contains: q } }, { entityId: { contains: q } }, ...(actorIds.length ? [{ actorId: { in: actorIds } }] : [])] } : undefined;
  const conditions: Prisma.AuditLogWhereInput[] = [];
  if (categoryFilter) conditions.push(categoryFilter);
  if (dateFilter) conditions.push(dateFilter);
  if (searchFilter) conditions.push(searchFilter);
  if (siteFilter) conditions.push(siteFilter as Prisma.AuditLogWhereInput);
  const where: Prisma.AuditLogWhereInput = { AND: conditions };
  const [total, rawLogs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: exportFormat ? 0 : (page - 1) * pageSize, take: exportFormat ? 10000 : pageSize }),
  ]);

  const adminIds = [...new Set(rawLogs.filter((log) => log.actorType === "ADMINISTRATOR" && log.actorId).map((log) => log.actorId!))];
  const employeeIds = [...new Set(rawLogs.filter((log) => ["EMPLOYEE", "EMPLOYEE_WORKFLOW"].includes(log.actorType) && log.actorId).map((log) => log.actorId!))];
  const entityIds = (entityType: string) => [...new Set(rawLogs.filter((log) => log.entityType === entityType && log.entityId).map((log) => log.entityId!))];
  const siteCodes = [...new Set(rawLogs.map((log) => (log.details && typeof log.details === "object" && !Array.isArray(log.details) ? (log.details as Record<string, unknown>).siteCode : undefined)).filter((value): value is string => typeof value === "string"))];
  const siteIds = [...new Set([...entityIds("ConstructionSite")])];
  const [admins, employees, attendance, safety, visitors, sites] = await Promise.all([
    adminIds.length ? prisma.administrator.findMany({ where: { id: { in: adminIds } }, select: { id: true, fullName: true, email: true } }) : [],
    employeeIds.length ? prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, employeeCode: true, fullName: true, siteId: true } }) : [],
    entityIds("AttendanceRecord").length ? prisma.attendanceRecord.findMany({ where: { id: { in: entityIds("AttendanceRecord") } }, select: { id: true, employee: { select: { id: true, employeeCode: true, fullName: true } }, site: { select: { id: true, siteCode: true, name: true } } } }) : [],
    entityIds("SafetyDeclaration").length ? prisma.safetyDeclaration.findMany({ where: { id: { in: entityIds("SafetyDeclaration") } }, select: { id: true, employee: { select: { id: true, employeeCode: true, fullName: true } }, site: { select: { id: true, siteCode: true, name: true } } } }) : [],
    entityIds("VisitorVisit").length ? prisma.visitorVisit.findMany({ where: { id: { in: entityIds("VisitorVisit") } }, select: { id: true, visitor: { select: { fullName: true, visitorCode: true } }, site: { select: { id: true, siteCode: true, name: true } } } }) : [],
    (siteIds.length || siteCodes.length) ? prisma.constructionSite.findMany({ where: { OR: [{ id: { in: siteIds } }, { siteCode: { in: siteCodes } }] }, select: { id: true, siteCode: true, name: true } }) : [],
  ]);
  const adminById = new Map(admins.map((item) => [item.id, item]));
  const employeeById = new Map(employees.map((item) => [item.id, item]));
  const attendanceById = new Map(attendance.map((item) => [item.id, item]));
  const safetyById = new Map(safety.map((item) => [item.id, item]));
  const visitorById = new Map(visitors.map((item) => [item.id, item]));
  const siteById = new Map(sites.map((item) => [item.id, item]));
  const siteByCode = new Map(sites.map((item) => [item.siteCode, item]));
  const enrichedLogs = rawLogs.map((log) => {
    const detailObject = log.details && typeof log.details === "object" && !Array.isArray(log.details) ? log.details as Record<string, unknown> : {};
    const related = log.entityType === "AttendanceRecord" ? attendanceById.get(log.entityId || "") : log.entityType === "SafetyDeclaration" ? safetyById.get(log.entityId || "") : log.entityType === "VisitorVisit" ? visitorById.get(log.entityId || "") : undefined;
    const actor = log.actorType === "ADMINISTRATOR" ? adminById.get(log.actorId || "") : log.actorType === "EMPLOYEE" ? employeeById.get(log.actorId || "") : related && "visitor" in related ? related.visitor : undefined;
    const actorName = actor && "fullName" in actor ? actor.fullName : log.actorType === "EMPLOYEE_WORKFLOW" ? "Employee workflow" : log.actorType === "VISITOR" ? "Visitor workflow" : "System / public workflow";
    const actorReference = actor && "employeeCode" in actor ? actor.employeeCode : actor && "email" in actor ? actor.email : log.actorId || null;
    const detailSiteCode = typeof detailObject.siteCode === "string" ? detailObject.siteCode : undefined;
    const site = (related && "site" in related ? related.site : undefined) || siteByCode.get(detailSiteCode || "") || (log.entityType === "ConstructionSite" ? siteById.get(log.entityId || "") : undefined);
    const safe = safeDetails(log.details);
    return { id: log.id, createdAt: log.createdAt.toISOString(), actorType: log.actorType, actorId: log.actorId, actorName, actorReference, action: log.action, actionLabel: readableAction(log.action), category: categoryFor(log.action, log.entityType), entityType: log.entityType, entityId: log.entityId, entityLabel: log.entityType.replace(/([a-z])([A-Z])/g, "$1 $2"), siteCode: site?.siteCode || detailSiteCode || null, siteName: site?.name || null, details: safe, detailsSummary: detailsSummary(safe) };
  });
  if (exportFormat === "csv") {
    const csv = ["Date & Time,Performed By,Activity,Category,Construction Site,Details", ...enrichedLogs.map((log) => [log.createdAt, log.actorName, log.actionLabel, log.category, log.siteName || log.siteCode || "Site unavailable", log.detailsSummary].map(csvCell).join(","))].join("\n");
    return res.type("text/csv").set("Content-Disposition", "attachment; filename=sitepass-activity-logs.csv").send(csv);
  }
  return res.json({ success: true, logs: enrichedLogs, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
});
auditRouter.delete("/", async (req, res) => {
  const parsed = auditClearSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Type CLEAR to confirm removing activity logs." });
  const { q, category, from, to, siteCode } = parsed.data;
  let siteFilter: Record<string, unknown> | undefined;
  if (siteCode) {
    const site = await prisma.constructionSite.findUnique({ where: { siteCode }, select: { id: true } });
    const allowed = await authorizedSiteIds(req.admin!.sub, req.admin!.role);
    if (!site || (allowed && !allowed.includes(site.id))) return res.status(403).json({ success: false, message: "You are not authorized to clear this site's activity logs." });
    siteFilter = { OR: [{ entityType: "ConstructionSite", entityId: site.id }, { details: { path: ["siteCode"], equals: siteCode } }] };
  }
  const categoryFilter = category ? { OR: [{ action: { in: categoryActions[category] } }, { entityType: categoryEntityTypes[category] }] } : undefined;
  const dateFilter = from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : undefined;
  const actorMatches = q ? await Promise.all([
    prisma.administrator.findMany({ where: { OR: [{ fullName: { contains: q } }, { email: { contains: q } }] }, select: { id: true } }),
    prisma.employee.findMany({ where: { OR: [{ fullName: { contains: q } }, { employeeCode: { contains: q } }] }, select: { id: true } }),
  ]) : [[], []];
  const actorIds = actorMatches.flat().map(actor => actor.id);
  const searchFilter = q ? { OR: [{ action: { contains: q } }, { entityType: { contains: q } }, { actorType: { contains: q } }, { entityId: { contains: q } }, ...(actorIds.length ? [{ actorId: { in: actorIds } }] : [])] } : undefined;
  const conditions: Prisma.AuditLogWhereInput[] = [];
  if (categoryFilter) conditions.push(categoryFilter);
  if (dateFilter) conditions.push(dateFilter);
  if (searchFilter) conditions.push(searchFilter);
  if (siteFilter) conditions.push(siteFilter as Prisma.AuditLogWhereInput);
  const where: Prisma.AuditLogWhereInput = { AND: conditions };
  const result = await prisma.$transaction(async tx => {
    const deleted = await tx.auditLog.deleteMany({ where });
    if (!deleted.count) return { count: 0 };
    await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "ACTIVITY_LOG_HISTORY_CLEARED", entityType: "AuditLog", details: { clearedCount: deleted.count, siteCode: siteCode || null, category: category || null } } });
    return { count: deleted.count };
  });
  if (!result.count) return res.status(404).json({ success: false, message: "No activity logs match the selected filters." });
  return res.json({ success: true, deletedCount: result.count, message: `${result.count} activity log${result.count === 1 ? "" : "s"} cleared. A clearance audit event was retained.` });
});
export default router;
