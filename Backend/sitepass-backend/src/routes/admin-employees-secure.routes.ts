import bcrypt from "bcrypt";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin } from "../middleware/admin-auth";
import { sendBrevoEmail, welcomeEmail } from "../services/brevo-email";
import { generateEmployeeAccessCode } from "../utils/access-code";
import { authorizedSiteIds, canAccessSite } from "../utils/admin-access";
import { createEmployeeSchema as createSchema, updateEmployeeSchema as updateSchema, normalizeUKPhone } from "../utils/employee-validation";

const router = Router();
router.use(requireAdmin);

const statusSchema = z.object({ isActive: z.boolean() });
const legacyResetSchema = z.object({ accessCode: z.string().regex(/^\d{6}$/, "Access code must be exactly 6 digits.") });
const DOCUMENT_TYPES = ["WORKER_ID", "MEDICAL", "OTHER"] as const;
const uploadDocumentSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  documentName: z.string().trim().min(1).max(191),
  expiresAt: z.string().datetime().nullable().optional(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  dataBase64: z.string().min(1).max(7_000_000),
}).strict();
const publicEmployeeSelect = { id: true, employeeCode: true, fullName: true, email: true, phone: true, address: true, siteId: true, isActive: true, archivedAt: true, createdAt: true, updatedAt: true } as const;
const resendLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many access-code resend attempts. Please try again later." } });

function isUnique(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }
function idempotencyKey(req: any) { const value = req.header("idempotency-key"); return typeof value === "string" && /^[A-Za-z0-9._-]{16,191}$/.test(value) ? value : null; }
function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
function phoneError(res: any) { return res.status(400).json({ success: false, message: "Enter a valid UK phone number, for example 07700 900123 or +44 7700 900123." }); }
async function siteFor(siteCode: string, adminId: string, role: string) {
  const site = await prisma.constructionSite.findUnique({ where: { siteCode }, select: { id: true, siteCode: true, name: true, isActive: true } });
  return site && await canAccessSite(adminId, role, site.id) ? site : null;
}
async function emailStatus(employeeId: string) { return prisma.emailDelivery.findFirst({ where: { employeeId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, brevoMessageId: true, attemptCount: true, lastError: true, createdAt: true, updatedAt: true } }); }
async function responseEmployee(employee: any) { return { ...employee, emailDelivery: await emailStatus(employee.id) }; }
async function sendAndRecord(deliveryId: string, input: Parameters<typeof sendBrevoEmail>[0]) {
  let result: Awaited<ReturnType<typeof sendBrevoEmail>>;
  try { result = await sendBrevoEmail(input); } catch (error) { result = { accepted: false, status: "FAILED", error: error instanceof Error ? error.message : "Brevo email configuration is unavailable." } as Awaited<ReturnType<typeof sendBrevoEmail>>; }
  await prisma.emailDelivery.update({ where: { id: deliveryId }, data: { status: result.status, brevoMessageId: result.messageId, attemptCount: { increment: 1 }, lastError: result.error || null } });
  return result;
}
async function duplicateEmail(emailAddress: string, excludeEmployeeId?: string) { return prisma.employee.findFirst({ where: { email: normalizeEmail(emailAddress), ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}) }, select: { id: true } }); }
async function scopedEmployee(employeeId: string, adminId: string, role: string) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, archivedAt: null }, select: { id: true, employeeCode: true, fullName: true, siteId: true, site: { select: { siteCode: true, name: true } } } });
  return employee && await canAccessSite(adminId, role, employee.siteId) ? employee : null;
}
function documentSummary(document: { id: string; documentType: string; documentName: string; fileName: string; mimeType: string; fileSize: number; expiresAt: Date | null; createdAt: Date; updatedAt: Date }) {
  return { ...document, downloadUrl: `/api/admin/employees/documents/${document.id}/download` };
}
function decodedUpload(dataBase64: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64) || dataBase64.length % 4 !== 0) return null;
  const data = Buffer.from(dataBase64, "base64");
  return data.length > 0 && data.length <= 5 * 1024 * 1024 ? data : null;
}
function matchesMimeType(data: Buffer, mimeType: string) {
  if (mimeType === "application/pdf") return data.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mimeType === "image/jpeg") return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (mimeType === "image/png") return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return false;
}

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || "Invalid employee details.", errors: parsed.error.issues });
  const normalizedPhone = normalizeUKPhone(parsed.data.phone);
  if (parsed.data.phone && !normalizedPhone) return phoneError(res);
  const key = idempotencyKey(req);
  if (!key) return res.status(400).json({ success: false, message: "An Idempotency-Key header is required for employee creation." });
  const site = await siteFor(parsed.data.siteCode, req.admin!.sub, req.admin!.role);
  if (!site) return res.status(404).json({ success: false, message: "Construction site not found or not authorized." });
  if (!site.isActive) return res.status(409).json({ success: false, message: "Cannot register an employee on an inactive site." });
  const normalizedEmail = normalizeEmail(parsed.data.email);
  if (await duplicateEmail(normalizedEmail)) return res.status(409).json({ success: false, message: "An employee already uses this email address." });
  let accessCode = "";
  try {
    const result = await prisma.$transaction(async (tx) => {
      const prior = await tx.employeeCreationRequest.findUnique({ where: { idempotencyKey: key }, include: { employee: { select: publicEmployeeSelect } } });
      if (prior) return { employee: prior.employee, delivery: await tx.emailDelivery.findFirst({ where: { employeeId: prior.employee.id }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } }), reused: true };
      if (await tx.employee.findFirst({ where: { email: normalizedEmail }, select: { id: true } })) throw new Error("DUPLICATE_EMAIL");
      const sequence = await tx.employeeIdSequence.update({ where: { id: 1 }, data: { nextValue: { increment: 1 } } });
      const employeeCode = `EMP-${String(sequence.nextValue - 1).padStart(6, "0")}`;
      accessCode = generateEmployeeAccessCode();
      const employee = await tx.employee.create({ data: { employeeCode, fullName: parsed.data.fullName, email: normalizedEmail, phone: normalizedPhone, address: parsed.data.address || null, siteId: site.id, accessCodeHash: await bcrypt.hash(accessCode, 12) }, select: publicEmployeeSelect });
      await tx.employeeCreationRequest.create({ data: { idempotencyKey: key, employeeId: employee.id } });
      const delivery = await tx.emailDelivery.create({ data: { employeeId: employee.id, recipientEmail: normalizedEmail, emailType: "EMPLOYEE_WELCOME" }, select: { id: true, status: true } });
      await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_CREATED", entityType: "Employee", entityId: employee.id, details: { siteCode: site.siteCode, employeeCode: employee.employeeCode, email: employee.email } } });
      return { employee, delivery, reused: false };
    });
    if (result.reused) return res.status(200).json({ success: true, reused: true, employee: await responseEmployee(result.employee), message: "Employee creation request already processed." });
    const sent = await sendAndRecord(result.delivery!.id, { to: normalizedEmail, ...welcomeEmail({ fullName: parsed.data.fullName, employeeCode: result.employee.employeeCode, accessCode, siteName: site.name }) });
    return res.status(201).json({ success: true, employee: await responseEmployee(result.employee), emailDelivery: { status: sent.status, messageId: sent.messageId, error: sent.error }, message: sent.accepted ? "Employee created successfully." : "Employee was created successfully, but the welcome email could not be sent." });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_EMAIL") return res.status(409).json({ success: false, message: "An employee already uses this email address." });
    if (isUnique(error)) return res.status(409).json({ success: false, message: "This employee creation request was already processed or the generated employee ID conflicted. Please retry with a new Idempotency-Key." });
    console.error("Employee creation failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ success: false, message: "Unable to create employee." });
  }
});

router.get("/", async (req, res) => {
  const requestedSiteCode = typeof req.query.siteCode === "string" ? req.query.siteCode.trim() : "";
  const allowed = await authorizedSiteIds(req.admin!.sub, req.admin!.role);
  let siteId: string | undefined;
  if (requestedSiteCode) { const site = await siteFor(requestedSiteCode, req.admin!.sub, req.admin!.role); if (!site) return res.status(404).json({ success: false, message: "Construction site not found or not authorized." }); siteId = site.id; }
  const employees = await prisma.employee.findMany({ where: { ...(siteId ? { siteId } : allowed ? { siteId: { in: allowed } } : {}), archivedAt: null }, select: { ...publicEmployeeSelect, site: { select: { id: true, siteCode: true, name: true } } }, orderBy: { fullName: "asc" } });
  return res.json({ success: true, employees: await Promise.all(employees.map(async (employee) => ({ ...employee, emailDelivery: await emailStatus(employee.id) }))) });
});

router.get("/:employeeId", async (req, res) => {
  const candidate = await scopedEmployee(req.params.employeeId, req.admin!.sub, req.admin!.role);
  const employee = candidate ? await prisma.employee.findFirst({ where: { id: candidate.id, archivedAt: null }, select: { ...publicEmployeeSelect, site: { select: { id: true, siteCode: true, name: true } } } }) : null;
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });
  return res.json({ success: true, employee: await responseEmployee(employee) });
});

router.patch("/:employeeId", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || "Invalid employee update.", errors: parsed.error.issues });
  const normalizedPhone = parsed.data.phone === undefined ? undefined : normalizeUKPhone(parsed.data.phone);
  if (parsed.data.phone && !normalizedPhone) return phoneError(res);
  const existing = await scopedEmployee(req.params.employeeId, req.admin!.sub, req.admin!.role);
  if (!existing) return res.status(404).json({ success: false, message: "Employee not found." });
  const normalizedEmail = parsed.data.email === undefined || !parsed.data.email ? null : normalizeEmail(parsed.data.email);
  if (normalizedEmail && await duplicateEmail(normalizedEmail, existing.id)) return res.status(409).json({ success: false, message: "An employee already uses this email address." });
  const updated = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.update({ where: { id: existing.id }, data: { fullName: parsed.data.fullName, email: parsed.data.email === undefined ? undefined : normalizedEmail, phone: parsed.data.phone === undefined ? undefined : normalizedPhone, address: parsed.data.address === undefined ? undefined : parsed.data.address || null, isActive: parsed.data.isActive }, select: publicEmployeeSelect });
    await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_UPDATED", entityType: "Employee", entityId: employee.id, details: { employeeCode: employee.employeeCode, siteCode: existing.site.siteCode } } });
    return employee;
  });
  return res.json({ success: true, employee: await responseEmployee(updated), message: "Employee updated successfully." });
});

router.patch("/:employeeId/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "isActive must be a boolean." });
  const existing = await scopedEmployee(req.params.employeeId, req.admin!.sub, req.admin!.role);
  if (!existing) return res.status(404).json({ success: false, message: "Employee not found." });
  const employee = await prisma.$transaction(async (tx) => {
    const result = await tx.employee.update({ where: { id: existing.id }, data: { isActive: parsed.data.isActive }, select: publicEmployeeSelect });
    await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: parsed.data.isActive ? "EMPLOYEE_ACTIVATED" : "EMPLOYEE_DEACTIVATED", entityType: "Employee", entityId: result.id, details: { employeeCode: result.employeeCode, siteCode: existing.site.siteCode } } }); return result;
  });
  return res.json({ success: true, employee, message: `Employee ${parsed.data.isActive ? "activated" : "deactivated"}.` });
});

router.post("/:employeeId/archive", async (req, res) => {
  const employee = await scopedEmployee(req.params.employeeId, req.admin!.sub, req.admin!.role);
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found or already archived." });
  try {
    const archivedAt = new Date();
    const archived = await prisma.$transaction(async (tx) => {
      // Use the same employee-row lock as attendance verification so archival cannot race a new entry.
      await tx.$queryRaw`SELECT id FROM Employee WHERE id = ${employee.id} FOR UPDATE`;
      const openAttendance = await tx.attendanceRecord.findFirst({ where: { employeeId: employee.id, siteId: employee.siteId, status: "OPEN", exitTime: null }, select: { id: true } });
      if (openAttendance) throw new Error("OPEN_ATTENDANCE");
      const result = await tx.employee.update({ where: { id: employee.id }, data: { isActive: false, archivedAt }, select: publicEmployeeSelect });
      await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_ARCHIVED", entityType: "Employee", entityId: employee.id, details: { siteCode: employee.site.siteCode, employeeCode: employee.employeeCode, employeeName: employee.fullName, archivedAt: archivedAt.toISOString() } } }); return result;
    });
    return res.json({ success: true, employee: archived, message: "Employee archived. Historical attendance and safety records were preserved." });
  } catch (error) {
    if (error instanceof Error && error.message === "OPEN_ATTENDANCE") return res.status(409).json({ success: false, message: "This employee has an active attendance session. Record their exit before archiving them." });
    console.error("Employee archival failed:", error instanceof Error ? error.message : "Unknown error"); return res.status(500).json({ success: false, message: "Unable to archive employee." });
  }
});

router.post("/:employeeId/access-code", async (req, res) => {
  const parsed = legacyResetSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid access code." });
  const employee = await scopedEmployee(String(req.params.employeeId), req.admin!.sub, req.admin!.role);
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });
  const updated = await prisma.$transaction(async (tx) => { const result = await tx.employee.update({ where: { id: employee.id }, data: { accessCodeHash: await bcrypt.hash(parsed.data.accessCode, 12) }, select: publicEmployeeSelect }); await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_ACCESS_CODE_RESET", entityType: "Employee", entityId: employee.id, details: { employeeCode: employee.employeeCode, siteCode: employee.site.siteCode } } }); return result; });
  return res.json({ success: true, employee: updated });
});

router.post("/:employeeId/access-code/regenerate", resendLimit, async (req, res) => {
  const candidate = await scopedEmployee(String(req.params.employeeId), req.admin!.sub, req.admin!.role);
  const employee = candidate ? await prisma.employee.findFirst({ where: { id: candidate.id, archivedAt: null }, select: { ...publicEmployeeSelect, site: { select: { name: true } } } }) : null;
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });
  if (!employee.email) return res.status(409).json({ success: false, message: "Employee does not have an email address." });
  if (!employee.isActive) return res.status(409).json({ success: false, message: "Cannot regenerate credentials for an inactive employee." });
  const accessCode = generateEmployeeAccessCode(); const delivery = await prisma.emailDelivery.create({ data: { employeeId: employee.id, recipientEmail: employee.email, emailType: "EMPLOYEE_ACCESS_CODE_REGENERATION" } });
  const sent = await sendAndRecord(delivery.id, { to: employee.email, ...welcomeEmail({ fullName: employee.fullName, employeeCode: employee.employeeCode, accessCode, siteName: employee.site.name }) });
  if (!sent.accepted) return res.status(502).json({ success: false, message: "The access code was not changed because the email could not be accepted.", emailDelivery: { status: "FAILED", error: sent.error } });
  const updated = await prisma.$transaction(async (tx) => { const result = await tx.employee.update({ where: { id: employee.id }, data: { accessCodeHash: await bcrypt.hash(accessCode, 12) }, select: publicEmployeeSelect }); await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_ACCESS_CODE_REGENERATED", entityType: "Employee", entityId: employee.id, details: { employeeCode: employee.employeeCode, email: employee.email } } }); return result; });
  return res.json({ success: true, employee: updated, emailDelivery: { status: "SENT", messageId: sent.messageId }, message: "A new access code was sent to the employee." });
});

router.get("/:employeeId/documents", async (req, res) => {
  const employee = await scopedEmployee(req.params.employeeId, req.admin!.sub, req.admin!.role);
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });
  const documents = await prisma.employeeDocument.findMany({
    where: { employeeId: employee.id },
    select: { id: true, documentType: true, documentName: true, fileName: true, mimeType: true, fileSize: true, expiresAt: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "desc" },
  });
  return res.json({ success: true, documents: documents.map(documentSummary) });
});

router.post("/:employeeId/documents", async (req, res) => {
  const parsed = uploadDocumentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter valid document details and upload a PDF, JPG, or PNG file no larger than 5 MB." });
  const fileData = decodedUpload(parsed.data.dataBase64);
  if (!fileData) return res.status(400).json({ success: false, message: "The uploaded file is invalid or larger than 5 MB." });
  if (!matchesMimeType(fileData, parsed.data.mimeType)) return res.status(400).json({ success: false, message: "The file contents do not match the selected document type." });
  const employee = await scopedEmployee(req.params.employeeId, req.admin!.sub, req.admin!.role);
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return res.status(400).json({ success: false, message: "Enter a valid expiry date." });
  const document = await prisma.$transaction(async tx => {
    const created = await tx.employeeDocument.create({ data: {
      employeeId: employee.id, documentType: parsed.data.documentType, documentName: parsed.data.documentName,
      fileName: parsed.data.fileName.replace(/[\\/]/g, "_"), mimeType: parsed.data.mimeType, fileSize: fileData.length, fileData, expiresAt,
    }, select: { id: true, documentType: true, documentName: true, fileName: true, mimeType: true, fileSize: true, expiresAt: true, createdAt: true, updatedAt: true } });
    await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_DOCUMENT_UPLOADED", entityType: "EmployeeDocument", entityId: created.id, details: { employeeId: employee.id, employeeCode: employee.employeeCode, documentType: created.documentType, documentName: created.documentName, expiresAt: created.expiresAt?.toISOString() ?? null } } });
    return created;
  });
  return res.status(201).json({ success: true, document: documentSummary(document), message: "Employee document uploaded." });
});

router.get("/documents/:documentId/download", async (req, res) => {
  const document = await prisma.employeeDocument.findUnique({ where: { id: req.params.documentId }, include: { employee: { select: { id: true, siteId: true, archivedAt: true } } } });
  if (!document || document.employee.archivedAt || !(await canAccessSite(req.admin!.sub, req.admin!.role, document.employee.siteId))) return res.status(404).json({ success: false, message: "Document not found." });
  res.setHeader("Content-Type", document.mimeType);
  res.setHeader("Content-Length", document.fileSize);
  res.setHeader("Content-Disposition", `attachment; filename="${document.fileName.replace(/[\"\\\r\n]/g, "_")}"`);
  return res.send(Buffer.from(document.fileData));
});

router.delete("/documents/:documentId", async (req, res) => {
  const document = await prisma.employeeDocument.findUnique({ where: { id: req.params.documentId }, include: { employee: { select: { id: true, siteId: true, employeeCode: true, archivedAt: true } } } });
  if (!document || document.employee.archivedAt || !(await canAccessSite(req.admin!.sub, req.admin!.role, document.employee.siteId))) return res.status(404).json({ success: false, message: "Document not found." });
  await prisma.$transaction(async tx => {
    await tx.employeeDocument.delete({ where: { id: document.id } });
    await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_DOCUMENT_DELETED", entityType: "EmployeeDocument", entityId: document.id, details: { employeeId: document.employee.id, employeeCode: document.employee.employeeCode, documentType: document.documentType, documentName: document.documentName } } });
  });
  return res.json({ success: true, message: "Employee document deleted." });
});

export default router;
