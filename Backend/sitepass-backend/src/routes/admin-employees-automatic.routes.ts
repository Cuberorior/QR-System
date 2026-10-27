import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin } from "../middleware/admin-auth";
import { sendBrevoEmail, welcomeEmail } from "../services/brevo-email";

const router = Router();
router.use(requireAdmin);
const email = z.string().trim().email().max(191);
const phone = z.string().trim().max(50).optional().or(z.literal(""));
const createSchema = z.object({ fullName: z.string().trim().min(1).max(191), email, phone, siteCode: z.string().trim().min(1).max(100) }).strict();
const updateSchema = z.object({ fullName: z.string().trim().min(1).max(191).optional(), email: email.optional().or(z.literal("")), phone, siteCode: z.string().trim().min(1).max(100).optional(), isActive: z.boolean().optional() }).strict();
const statusSchema = z.object({ isActive: z.boolean() });
const legacyResetSchema = z.object({ accessCode: z.string().min(8).max(200) });
const publicEmployeeSelect = { id: true, employeeCode: true, fullName: true, email: true, phone: true, siteId: true, isActive: true, createdAt: true, updatedAt: true } as const;
const resendLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many access-code resend attempts. Please try again later." } });

function isUnique(error: unknown) { return typeof error === "object" && error !== null && "code" in error && error.code === "P2002"; }
function newAccessCode() { return randomBytes(12).toString("base64url").slice(0, 16); }
function idempotencyKey(req: any) { const value = req.header("idempotency-key"); return typeof value === "string" && /^[A-Za-z0-9._-]{16,191}$/.test(value) ? value : null; }
async function siteFor(siteCode: string) { return prisma.constructionSite.findUnique({ where: { siteCode }, select: { id: true, siteCode: true, name: true, isActive: true } }); }
async function emailStatus(employeeId: string) { return prisma.emailDelivery.findFirst({ where: { employeeId }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, brevoMessageId: true, attemptCount: true, lastError: true, createdAt: true, updatedAt: true } }); }
async function responseEmployee(employee: any) { return { ...employee, emailDelivery: await emailStatus(employee.id) }; }
async function sendAndRecord(deliveryId: string, input: Parameters<typeof sendBrevoEmail>[0]) {
  let result: Awaited<ReturnType<typeof sendBrevoEmail>>;
  try { result = await sendBrevoEmail(input); } catch (error) { result = { accepted: false, status: "FAILED", error: error instanceof Error ? error.message : "Brevo email configuration is unavailable." }; }
  await prisma.emailDelivery.update({ where: { id: deliveryId }, data: { status: result.status, brevoMessageId: result.messageId, attemptCount: { increment: 1 }, lastError: result.error || null } });
  return result;
}

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Full name, valid email, phone, and active site are required.", errors: parsed.error.issues });
  const key = idempotencyKey(req); if (!key) return res.status(400).json({ success: false, message: "An Idempotency-Key header is required for employee creation." });
  const site = await siteFor(parsed.data.siteCode); if (!site) return res.status(404).json({ success: false, message: "Construction site not found." }); if (!site.isActive) return res.status(409).json({ success: false, message: "Cannot register an employee on an inactive site." });
  let created: any; let reused = false; let accessCode = "";
  try {
    const result = await prisma.$transaction(async (tx) => {
      const prior = await tx.employeeCreationRequest.findUnique({ where: { idempotencyKey: key }, include: { employee: { select: publicEmployeeSelect } } });
      if (prior) return { employee: prior.employee, delivery: await tx.emailDelivery.findFirst({ where: { employeeId: prior.employee.id }, orderBy: { createdAt: "desc" }, select: { id: true, status: true } }), reused: true };
      const sequence = await tx.employeeIdSequence.update({ where: { id: 1 }, data: { nextValue: { increment: 1 } } });
      const employeeCode = `EMP-${String(sequence.nextValue - 1).padStart(6, "0")}`; accessCode = newAccessCode();
      const employee = await tx.employee.create({ data: { employeeCode, fullName: parsed.data.fullName, email: parsed.data.email.toLowerCase(), phone: parsed.data.phone || null, siteId: site.id, accessCodeHash: await bcrypt.hash(accessCode, 12) }, select: publicEmployeeSelect });
      await tx.employeeCreationRequest.create({ data: { idempotencyKey: key, employeeId: employee.id } });
      const delivery = await tx.emailDelivery.create({ data: { employeeId: employee.id, recipientEmail: parsed.data.email.toLowerCase(), emailType: "EMPLOYEE_WELCOME" }, select: { id: true, status: true } });
      await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_CREATED", entityType: "Employee", entityId: employee.id, details: { siteCode: site.siteCode, employeeCode: employee.employeeCode, email: employee.email } } });
      return { employee, delivery, reused: false };
    });
    created = result.employee; reused = result.reused;
    if (reused) return res.status(200).json({ success: true, reused: true, employee: await responseEmployee(created), message: "Employee creation request already processed." });
    const delivery = result.delivery!;
    const sent = await sendAndRecord(delivery.id, { to: parsed.data.email, ...welcomeEmail({ fullName: parsed.data.fullName, employeeCode: created.employeeCode, accessCode, siteName: site.name }) });
    return res.status(201).json({ success: true, employee: await responseEmployee(created), emailDelivery: { status: sent.status, messageId: sent.messageId, error: sent.error }, message: sent.accepted ? "Employee created successfully." : "Employee was created successfully, but the welcome email could not be sent." });
  } catch (error) {
    if (isUnique(error)) return res.status(409).json({ success: false, message: "This employee creation request was already processed or the generated employee ID conflicted. Please retry with a new Idempotency-Key." });
    console.error("Employee creation failed:", error instanceof Error ? error.message : "Unknown error"); return res.status(500).json({ success: false, message: "Unable to create employee." });
  }
});

router.get("/", async (req, res) => { const parsed = z.string().trim().min(1).max(100).safeParse(req.query.siteCode); if (!parsed.success) return res.status(400).json({ success: false, message: "siteCode query parameter is required." }); const site = await siteFor(parsed.data); if (!site) return res.status(404).json({ success: false, message: "Construction site not found." }); const employees = await prisma.employee.findMany({ where: { siteId: site.id }, select: { ...publicEmployeeSelect, site: { select: { id: true, siteCode: true, name: true } } }, orderBy: { fullName: "asc" } }); const enriched = await Promise.all(employees.map(async employee => ({ ...employee, emailDelivery: await emailStatus(employee.id) }))); return res.json({ success: true, employees: enriched }); });
router.get("/:employeeId", async (req, res) => { const employee = await prisma.employee.findUnique({ where: { id: req.params.employeeId }, select: { ...publicEmployeeSelect, site: { select: { id: true, siteCode: true, name: true } } } }); if (!employee) return res.status(404).json({ success: false, message: "Employee not found." }); return res.json({ success: true, employee: await responseEmployee(employee) }); });
router.patch("/:employeeId", async (req, res) => { const parsed = updateSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid employee update.", errors: parsed.error.issues }); const existing = await prisma.employee.findUnique({ where: { id: req.params.employeeId }, select: { id: true, siteId: true } }); if (!existing) return res.status(404).json({ success: false, message: "Employee not found." }); let siteId: string | undefined; if (parsed.data.siteCode) { const site = await siteFor(parsed.data.siteCode); if (!site) return res.status(404).json({ success: false, message: "Construction site not found." }); if (!site.isActive) return res.status(409).json({ success: false, message: "Cannot assign an employee to an inactive site." }); siteId = site.id; } const updated = await prisma.$transaction(async tx => { const employee = await tx.employee.update({ where: { id: existing.id }, data: { fullName: parsed.data.fullName, email: parsed.data.email === undefined ? undefined : parsed.data.email || null, phone: parsed.data.phone === undefined ? undefined : parsed.data.phone || null, siteId, isActive: parsed.data.isActive }, select: publicEmployeeSelect }); await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_UPDATED", entityType: "Employee", entityId: employee.id, details: { employeeCode: employee.employeeCode } } }); return employee; }); return res.json({ success: true, employee: updated }); });
router.patch("/:employeeId/status", async (req, res) => { const parsed = statusSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "isActive must be a boolean." }); const existing = await prisma.employee.findUnique({ where: { id: req.params.employeeId }, select: { id: true } }); if (!existing) return res.status(404).json({ success: false, message: "Employee not found." }); const employee = await prisma.$transaction(async tx => { const result = await tx.employee.update({ where: { id: existing.id }, data: { isActive: parsed.data.isActive }, select: publicEmployeeSelect }); await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: parsed.data.isActive ? "EMPLOYEE_ACTIVATED" : "EMPLOYEE_DEACTIVATED", entityType: "Employee", entityId: result.id, details: { employeeCode: result.employeeCode } } }); return result; }); return res.json({ success: true, employee }); });

// Kept for compatibility with existing internal tooling. New credentials should use the emailed regenerate action below.
router.post("/:employeeId/access-code", async (req, res) => { const parsed = legacyResetSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid access code." }); const employee = await prisma.employee.findUnique({ where: { id: String(req.params.employeeId) }, select: { id: true, employeeCode: true } }); if (!employee) return res.status(404).json({ success: false, message: "Employee not found." }); const updated = await prisma.$transaction(async tx => { const result = await tx.employee.update({ where: { id: employee.id }, data: { accessCodeHash: await bcrypt.hash(parsed.data.accessCode, 12) }, select: publicEmployeeSelect }); await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_ACCESS_CODE_RESET", entityType: "Employee", entityId: employee.id, details: { employeeCode: employee.employeeCode } } }); return result; }); return res.json({ success: true, employee: updated }); });

router.post("/:employeeId/access-code/regenerate", resendLimit, async (req, res) => { const employee = await prisma.employee.findUnique({ where: { id: String(req.params.employeeId) }, select: { ...publicEmployeeSelect, site: { select: { name: true } } } }); if (!employee) return res.status(404).json({ success: false, message: "Employee not found." }); if (!employee.email) return res.status(409).json({ success: false, message: "Employee does not have an email address." }); if (!employee.isActive) return res.status(409).json({ success: false, message: "Cannot regenerate credentials for an inactive employee." }); const accessCode = newAccessCode(); const delivery = await prisma.emailDelivery.create({ data: { employeeId: employee.id, recipientEmail: employee.email, emailType: "EMPLOYEE_ACCESS_CODE_REGENERATION" } }); const sent = await sendAndRecord(delivery.id, { to: employee.email, ...welcomeEmail({ fullName: employee.fullName, employeeCode: employee.employeeCode, accessCode, siteName: employee.site.name }) }); if (!sent.accepted) return res.status(502).json({ success: false, message: "The access code was not changed because the email could not be accepted.", emailDelivery: { status: "FAILED", error: sent.error } }); const updated = await prisma.$transaction(async tx => { const result = await tx.employee.update({ where: { id: employee.id }, data: { accessCodeHash: await bcrypt.hash(accessCode, 12) }, select: publicEmployeeSelect }); await tx.auditLog.create({ data: { actorId: req.admin!.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_ACCESS_CODE_REGENERATED", entityType: "Employee", entityId: employee.id, details: { employeeCode: employee.employeeCode, email: employee.email } } }); return result; }); return res.json({ success: true, employee: updated, emailDelivery: { status: "SENT", messageId: sent.messageId }, message: "A new access code was sent to the employee." }); });

export default router;
