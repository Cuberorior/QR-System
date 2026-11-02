import bcrypt from "bcrypt";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin } from "../middleware/admin-auth";
import { sendBrevoEmail, welcomeEmail } from "../services/brevo-email";
import { generateEmployeeAccessCode } from "../utils/access-code";
import { getConfiguredSite } from "../utils/single-site";

const router = Router();
router.use(requireAdmin);

const email = z.string().trim().email().max(191);
const phone = z.string().trim().max(50).optional().or(z.literal(""));
const address = z.string().trim().max(500).optional().or(z.literal(""));
const createSchema = z.object({ fullName: z.string().trim().min(1).max(191), email, phone, address, siteCode: z.string().trim().min(1).max(100).optional() }).strict();
const updateSchema = z.object({ fullName: z.string().trim().min(1).max(191).optional(), email: email.optional().or(z.literal("")), phone, address, isActive: z.boolean().optional() }).strict();
const statusSchema = z.object({ isActive: z.boolean() });
const legacyResetSchema = z.object({ accessCode: z.string().regex(/^\d{6}$/, "Access code must be exactly 6 digits.") });
const publicEmployeeSelect = { id: true, employeeCode: true, fullName: true, email: true, phone: true, address: true, siteId: true, isActive: true, archivedAt: true, createdAt: true, updatedAt: true } as const;
const resendLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many access-code resend attempts. Please try again later." } });

function isUnique(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }
function idempotencyKey(req: any) { const value = req.header("idempotency-key"); return typeof value === "string" && /^[A-Za-z0-9._-]{16,191}$/.test(value) ? value : null; }
function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
/** Accepts Sri Lankan local, 0094, and international forms and stores canonical E.164. */
function normalizeSriLankanPhone(value: string | undefined): string | null {
  const supplied = value?.trim() || "";
  if (!supplied) return null;
  const compact = supplied.replace(/[\s().-]/g, "");
  const normalized = compact.startsWith("0094") ? `+94${compact.slice(4)}` : compact.startsWith("0") ? `+94${compact.slice(1)}` : compact;
  return /^\+94[1-9]\d{8}$/.test(normalized) ? normalized : null;
}
function phoneError(res: any) { return res.status(400).json({ success: false, message: "Enter a valid Sri Lankan phone number, for example +94771234567 or 0771234567." }); }
async function siteFor() { return getConfiguredSite(); }
async function emailStatus(employeeId: string) { return prisma.emailDelivery.findFirst({ where: { employeeId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, brevoMessageId: true, attemptCount: true, lastError: true, createdAt: true, updatedAt: true } }); }
async function responseEmployee(employee: any) { return { ...employee, emailDelivery: await emailStatus(employee.id) }; }
async function sendAndRecord(deliveryId: string, input: Parameters<typeof sendBrevoEmail>[0]) {
  let result: Awaited<ReturnType<typeof sendBrevoEmail>>;
  try { result = await sendBrevoEmail(input); } catch (error) { result = { accepted: false, status: "FAILED", error: error instanceof Error ? error.message : "Brevo email configuration is unavailable." } as Awaited<ReturnType<typeof sendBrevoEmail>>; }
  await prisma.emailDelivery.update({ where: { id: deliveryId }, data: { status: result.status, brevoMessageId: result.messageId, attemptCount: { increment: 1 }, lastError: result.error || null } });
  return result;
}
async function duplicateEmail(emailAddress: string, excludeEmployeeId?: string) { return prisma.employee.findFirst({ where: { email: normalizeEmail(emailAddress), ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}) }, select: { id: true } }); }
async function scopedEmployee(employeeId: string, siteId: string | undefined) { return prisma.employee.findFirst({ where: { id: employeeId, siteId, archivedAt: null }, select: { id: true, employeeCode: true, fullName: true } }); }

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Full name and a valid email are required.", errors: parsed.error.issues });
  const normalizedPhone = normalizeSriLankanPhone(parsed.data.phone);
  if (parsed.data.phone && !normalizedPhone) return phoneError(res);
  const key = idempotencyKey(req);
  if (!key) return res.status(400).json({ success: false, message: "An Idempotency-Key header is required for employee creation." });
  const site = await siteFor();
  if (!site) return res.status(404).json({ success: false, message: "Configured construction site not found." });
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

router.get("/", async (_req, res) => {
  const site = await siteFor();
  if (!site) return res.status(404).json({ success: false, message: "Configured construction site not found." });
  const employees = await prisma.employee.findMany({ where: { siteId: site.id, archivedAt: null }, select: { ...publicEmployeeSelect, site: { select: { id: true, siteCode: true, name: true } } }, orderBy: { fullName: "asc" } });
  return res.json({ success: true, employees: await Promise.all(employees.map(async (employee) => ({ ...employee, emailDelivery: await emailStatus(employee.id) }))) });
});

router.get("/:employeeId", async (req, res) => {
  const site = await siteFor();
  const employee = await prisma.employee.findFirst({ where: { id: req.params.employeeId, siteId: site?.id, archivedAt: null }, select: { ...publicEmployeeSelect, site: { select: { id: true, siteCode: true, name: true } } } });
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });
  return res.json({ success: true, employee: await responseEmployee(employee) });
});

router.patch("/:employeeId", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid employee update.", errors: parsed.error.issues });
  const normalizedPhone = parsed.data.phone === undefined ? undefined : normalizeSriLankanPhone(parsed.data.phone);
  if (parsed.data.phone && !normalizedPhone) return phoneError(res);
  const site = await siteFor();
  const existing = await scopedEmployee(req.params.employeeId, site?.id);
  if (!existing) return res.status(404).json({ success: false, message: "Employee not found." });
  const normalizedEmail = parsed.data.email === undefined || !parsed.data.email ? null : normalizeEmail(parsed.data.email);
  if (normalizedEmail && await duplicateEmail(normalizedEmail, existing.id)) return res.status(409).json({ success: false, message: "An employee already uses this email address." });
  const updated = await prisma.$transaction(async (tx) => {
    const employee = await tx.employee.update({ where: { id: existing.id }, data: { fullName: parsed.data.fullName, email: parsed.data.email === undefined ? undefined : normalizedEmail, phone: parsed.data.phone === undefined ? undefined : normalizedPhone, address: parsed.data.address === undefined ? undefined : parsed.data.address || null, isActive: parsed.data.isActive }, select: publicEmployeeSelect });
    await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_UPDATED", entityType: "Employee", entityId: employee.id, details: { employeeCode: employee.employeeCode } } });
    return employee;
  });
  return res.json({ success: true, employee: await responseEmployee(updated), message: "Employee updated successfully." });
});

router.patch("/:employeeId/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "isActive must be a boolean." });
  const site = await siteFor(); const existing = await scopedEmployee(req.params.employeeId, site?.id);
  if (!existing) return res.status(404).json({ success: false, message: "Employee not found." });
  const employee = await prisma.$transaction(async (tx) => {
    const result = await tx.employee.update({ where: { id: existing.id }, data: { isActive: parsed.data.isActive }, select: publicEmployeeSelect });
    await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: parsed.data.isActive ? "EMPLOYEE_ACTIVATED" : "EMPLOYEE_DEACTIVATED", entityType: "Employee", entityId: result.id, details: { employeeCode: result.employeeCode } } }); return result;
  });
  return res.json({ success: true, employee, message: `Employee ${parsed.data.isActive ? "activated" : "deactivated"}.` });
});

router.post("/:employeeId/archive", async (req, res) => {
  const site = await siteFor(); const employee = await scopedEmployee(req.params.employeeId, site?.id);
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found or already archived." });
  try {
    const archivedAt = new Date();
    const archived = await prisma.$transaction(async (tx) => {
      // Use the same employee-row lock as attendance verification so archival cannot race a new entry.
      await tx.$queryRaw`SELECT id FROM Employee WHERE id = ${employee.id} FOR UPDATE`;
      const openAttendance = await tx.attendanceRecord.findFirst({ where: { employeeId: employee.id, siteId: site!.id, status: "OPEN", exitTime: null }, select: { id: true } });
      if (openAttendance) throw new Error("OPEN_ATTENDANCE");
      const result = await tx.employee.update({ where: { id: employee.id }, data: { isActive: false, archivedAt }, select: publicEmployeeSelect });
      await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_ARCHIVED", entityType: "Employee", entityId: employee.id, details: { siteCode: site!.siteCode, employeeCode: employee.employeeCode, employeeName: employee.fullName, archivedAt: archivedAt.toISOString() } } }); return result;
    });
    return res.json({ success: true, employee: archived, message: "Employee archived. Historical attendance and safety records were preserved." });
  } catch (error) {
    if (error instanceof Error && error.message === "OPEN_ATTENDANCE") return res.status(409).json({ success: false, message: "This employee has an active attendance session. Record their exit before archiving them." });
    console.error("Employee archival failed:", error instanceof Error ? error.message : "Unknown error"); return res.status(500).json({ success: false, message: "Unable to archive employee." });
  }
});

router.post("/:employeeId/access-code", async (req, res) => {
  const parsed = legacyResetSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid access code." });
  const site = await siteFor(); const employee = await scopedEmployee(String(req.params.employeeId), site?.id);
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });
  const updated = await prisma.$transaction(async (tx) => { const result = await tx.employee.update({ where: { id: employee.id }, data: { accessCodeHash: await bcrypt.hash(parsed.data.accessCode, 12) }, select: publicEmployeeSelect }); await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_ACCESS_CODE_RESET", entityType: "Employee", entityId: employee.id, details: { employeeCode: employee.employeeCode } } }); return result; });
  return res.json({ success: true, employee: updated });
});

router.post("/:employeeId/access-code/regenerate", resendLimit, async (req, res) => {
  const site = await siteFor();
  const employee = await prisma.employee.findFirst({ where: { id: String(req.params.employeeId), siteId: site?.id, archivedAt: null }, select: { ...publicEmployeeSelect, site: { select: { name: true } } } });
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });
  if (!employee.email) return res.status(409).json({ success: false, message: "Employee does not have an email address." });
  if (!employee.isActive) return res.status(409).json({ success: false, message: "Cannot regenerate credentials for an inactive employee." });
  const accessCode = generateEmployeeAccessCode(); const delivery = await prisma.emailDelivery.create({ data: { employeeId: employee.id, recipientEmail: employee.email, emailType: "EMPLOYEE_ACCESS_CODE_REGENERATION" } });
  const sent = await sendAndRecord(delivery.id, { to: employee.email, ...welcomeEmail({ fullName: employee.fullName, employeeCode: employee.employeeCode, accessCode, siteName: employee.site.name }) });
  if (!sent.accepted) return res.status(502).json({ success: false, message: "The access code was not changed because the email could not be accepted.", emailDelivery: { status: "FAILED", error: sent.error } });
  const updated = await prisma.$transaction(async (tx) => { const result = await tx.employee.update({ where: { id: employee.id }, data: { accessCodeHash: await bcrypt.hash(accessCode, 12) }, select: publicEmployeeSelect }); await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_ACCESS_CODE_REGENERATED", entityType: "Employee", entityId: employee.id, details: { employeeCode: employee.employeeCode, email: employee.email } } }); return result; });
  return res.json({ success: true, employee: updated, emailDelivery: { status: "SENT", messageId: sent.messageId }, message: "A new access code was sent to the employee." });
});

export default router;
