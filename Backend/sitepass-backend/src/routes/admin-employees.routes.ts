import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { requireAdmin } from "../middleware/admin-auth";

const router = Router();
const employeeCode = z.string().trim().min(1).max(100);
const accessCode = z.string().min(8).max(200);
const createEmployeeSchema = z.object({ employeeCode, fullName: z.string().trim().min(1).max(191), email: z.string().trim().email().max(191).optional().or(z.literal("")), phone: z.string().trim().max(50).optional(), siteCode: z.string().trim().min(1).max(100), accessCode });
const updateEmployeeSchema = z.object({ fullName: z.string().trim().min(1).max(191).optional(), email: z.string().trim().email().max(191).optional().or(z.literal("")), phone: z.string().trim().max(50).optional(), siteCode: z.string().trim().min(1).max(100).optional(), isActive: z.boolean().optional() }).strict();
const statusSchema = z.object({ isActive: z.boolean() });
const resetAccessCodeSchema = z.object({ accessCode });

const publicEmployeeSelect = { id: true, employeeCode: true, fullName: true, email: true, phone: true, siteId: true, isActive: true, createdAt: true, updatedAt: true } as const;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function canAccessSite(adminId: string, role: string, siteId: string): Promise<boolean> {
  return (await prisma.administrator.count({ where: { id: adminId, role: "ADMIN", isActive: true } })) === 1;
}

async function findAuthorizedSite(siteCode: string, adminId: string, role: string) {
  const site = await prisma.constructionSite.findUnique({ where: { siteCode }, select: { id: true, siteCode: true, isActive: true } });
  if (!site || !(await canAccessSite(adminId, role, site.id))) return null;
  return site;
}

router.use(requireAdmin);

router.post("/", async (req, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid employee data.", errors: parsed.error.issues });
  const admin = req.admin!;
  const site = await findAuthorizedSite(parsed.data.siteCode, admin.sub, admin.role);
  if (!site) return res.status(403).json({ success: false, message: "You are not authorized to manage this construction site." });
  if (!site.isActive) return res.status(409).json({ success: false, message: "Cannot register an employee on an inactive site." });

  try {
    const created = await prisma.$transaction(async (tx) => {
      const createdEmployee = await tx.employee.create({ data: { employeeCode: parsed.data.employeeCode, fullName: parsed.data.fullName, email: parsed.data.email || null, phone: parsed.data.phone || null, siteId: site.id, accessCodeHash: await bcrypt.hash(parsed.data.accessCode, 12) }, select: publicEmployeeSelect });
      await tx.auditLog.create({ data: { actorId: admin.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_CREATED", entityType: "Employee", entityId: createdEmployee.id, details: { siteCode: site.siteCode, employeeCode: createdEmployee.employeeCode } } });
      return createdEmployee;
    });
    return res.status(201).json({ success: true, employee: created });
  } catch (error) {
    if (isUniqueConstraintError(error)) return res.status(409).json({ success: false, message: "Employee code is already registered." });
    console.error("Employee creation failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ success: false, message: "Unable to create employee." });
  }
});

router.get("/", async (req, res) => {
  const siteCode = z.string().trim().min(1).max(100).safeParse(req.query.siteCode);
  if (!siteCode.success) return res.status(400).json({ success: false, message: "siteCode query parameter is required." });
  const admin = req.admin!;
  const site = await findAuthorizedSite(siteCode.data, admin.sub, admin.role);
  if (!site) return res.status(403).json({ success: false, message: "You are not authorized to view this construction site." });
  const employees = await prisma.employee.findMany({ where: { siteId: site.id }, select: publicEmployeeSelect, orderBy: { fullName: "asc" } });
  return res.json({ success: true, employees });
});

router.get("/:employeeId", async (req, res) => {
  const employee = await prisma.employee.findUnique({ where: { id: req.params.employeeId }, select: { ...publicEmployeeSelect, site: { select: { id: true, siteCode: true, name: true } } } });
  if (!employee) return res.status(404).json({ success: false, message: "Employee not found." });
  const admin = req.admin!;
  if (!(await canAccessSite(admin.sub, admin.role, employee.siteId))) return res.status(403).json({ success: false, message: "You are not authorized to view this employee." });
  return res.json({ success: true, employee });
});

router.patch("/:employeeId", async (req, res) => {
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid employee update.", errors: parsed.error.issues });
  const existing = await prisma.employee.findUnique({ where: { id: req.params.employeeId }, select: { id: true, siteId: true, employeeCode: true } });
  if (!existing) return res.status(404).json({ success: false, message: "Employee not found." });
  const admin = req.admin!;
  if (!(await canAccessSite(admin.sub, admin.role, existing.siteId))) return res.status(403).json({ success: false, message: "You are not authorized to update this employee." });
  let targetSiteId = existing.siteId;
  let targetSiteCode: string | undefined;
  if (parsed.data.siteCode) {
    const targetSite = await findAuthorizedSite(parsed.data.siteCode, admin.sub, admin.role);
    if (!targetSite) return res.status(403).json({ success: false, message: "You are not authorized to assign this employee to the requested site." });
    if (!targetSite.isActive) return res.status(409).json({ success: false, message: "Cannot assign an employee to an inactive site." });
    targetSiteId = targetSite.id; targetSiteCode = targetSite.siteCode;
  }
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.employee.update({ where: { id: existing.id }, data: { fullName: parsed.data.fullName, email: parsed.data.email === undefined ? undefined : parsed.data.email || null, phone: parsed.data.phone, siteId: targetSiteId, isActive: parsed.data.isActive }, select: publicEmployeeSelect });
      await tx.auditLog.create({ data: { actorId: admin.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_UPDATED", entityType: "Employee", entityId: result.id, details: targetSiteCode ? { employeeCode: result.employeeCode, siteCode: targetSiteCode } : { employeeCode: result.employeeCode } } });
      return result;
    });
    return res.json({ success: true, employee: updated });
  } catch (error) {
    console.error("Employee update failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ success: false, message: "Unable to update employee." });
  }
});

router.patch("/:employeeId/status", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "isActive must be a boolean." });
  const existing = await prisma.employee.findUnique({ where: { id: req.params.employeeId }, select: { id: true, siteId: true, employeeCode: true } });
  if (!existing) return res.status(404).json({ success: false, message: "Employee not found." });
  const admin = req.admin!;
  if (!(await canAccessSite(admin.sub, admin.role, existing.siteId))) return res.status(403).json({ success: false, message: "You are not authorized to update this employee." });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.employee.update({ where: { id: existing.id }, data: { isActive: parsed.data.isActive }, select: publicEmployeeSelect });
    await tx.auditLog.create({ data: { actorId: admin.sub, actorType: "ADMINISTRATOR", action: parsed.data.isActive ? "EMPLOYEE_ACTIVATED" : "EMPLOYEE_DEACTIVATED", entityType: "Employee", entityId: result.id, details: { employeeCode: result.employeeCode } } });
    return result;
  });
  return res.json({ success: true, employee: updated });
});

router.post("/:employeeId/access-code", async (req, res) => {
  const parsed = resetAccessCodeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid access code." });
  const existing = await prisma.employee.findUnique({ where: { id: req.params.employeeId }, select: { id: true, siteId: true, employeeCode: true } });
  if (!existing) return res.status(404).json({ success: false, message: "Employee not found." });
  const admin = req.admin!;
  if (!(await canAccessSite(admin.sub, admin.role, existing.siteId))) return res.status(403).json({ success: false, message: "You are not authorized to reset this employee access code." });
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.employee.update({ where: { id: existing.id }, data: { accessCodeHash: await bcrypt.hash(parsed.data.accessCode, 12) }, select: publicEmployeeSelect });
    await tx.auditLog.create({ data: { actorId: admin.sub, actorType: "ADMINISTRATOR", action: "EMPLOYEE_ACCESS_CODE_RESET", entityType: "Employee", entityId: result.id, details: { employeeCode: result.employeeCode } } });
    return result;
  });
  return res.json({ success: true, employee: updated });
});

export default router;
