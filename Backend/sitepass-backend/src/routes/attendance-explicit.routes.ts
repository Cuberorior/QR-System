import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { SAFETY_CHECKLIST_VERSION } from "./safety.routes";

const router = Router();
const actionSchema = z.enum(["ENTRY", "EXIT"]);
const requestSchema = z.object({ siteCode: z.string().trim().min(1).max(100), employeeCode: z.string().trim().min(1).max(100), accessCode: z.string().min(1).max(200), verificationToken: z.string().min(1).max(512).optional(), safetyToken: z.string().min(1).max(512).optional(), action: actionSchema.optional() }).strict();
const verificationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many attendance verification attempts. Please try again later." } });
const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
const iso = (value: Date | null) => value ? value.toISOString() : null;
class VerificationFailure extends Error { status: number; constructor(message: string, status = 401) { super(message); this.status = status; } }

async function handleAttendance(req: any, res: any, forcedAction?: "ENTRY" | "EXIT") {
  const parsed = requestSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid attendance verification request." }); const action = forcedAction || parsed.data.action; if (!action) return res.status(400).json({ success: false, message: "An explicit attendance action is required." }); const { siteCode, employeeCode, accessCode, verificationToken, safetyToken } = parsed.data;
  try {
    const site = await prisma.constructionSite.findUnique({ where: { siteCode }, select: { id: true, siteCode: true, isActive: true, geofencingEnabled: true } }); if (!site || !site.isActive) return res.status(404).json({ success: false, message: "Construction site not found or inactive." });
    const employee = await prisma.employee.findFirst({ where: { employeeCode, siteId: site.id }, select: { id: true, employeeCode: true, fullName: true, accessCodeHash: true, isActive: true } }); const matches = employee ? await bcrypt.compare(accessCode, employee.accessCodeHash) : false; if (!employee || !employee.isActive || !matches) return res.status(401).json({ success: false, message: "Employee verification failed." });
    const result = await prisma.$transaction(async tx => {
      const authoritativeSite = await tx.constructionSite.findUnique({ where: { id: site.id }, select: { geofencingEnabled: true } }); if (!authoritativeSite) throw new VerificationFailure("Construction site not found.", 404);
      await tx.$queryRaw`SELECT id FROM Employee WHERE id = ${employee.id} FOR UPDATE`;
      const now = new Date(); const openRecord = await tx.attendanceRecord.findFirst({ where: { employeeId: employee.id, siteId: site.id, status: "OPEN", exitTime: null }, orderBy: { entryTime: "desc" } });
      if (action === "ENTRY" && openRecord) throw new VerificationFailure("Employee is already checked in at this site.", 409); if (action === "EXIT" && !openRecord) throw new VerificationFailure("No open attendance record exists for this employee at this site.", 409);
      if (authoritativeSite.geofencingEnabled && !verificationToken) throw new VerificationFailure("Valid location verification is required."); if (!authoritativeSite.geofencingEnabled && verificationToken) throw new VerificationFailure("GPS verification is disabled for this site; do not submit a location token.");
      if (authoritativeSite.geofencingEnabled) { const gpsHash = hashToken(verificationToken!); const session = await tx.verificationSession.findFirst({ where: { tokenHash: gpsHash, siteId: site.id, intendedAction: action, consumedAt: null, expiresAt: { gt: now } } }); if (!session) throw new VerificationFailure("Verification token is invalid, expired, or already used for this attendance action."); const consumed = await tx.verificationSession.updateMany({ where: { id: session.id, siteId: site.id, intendedAction: action, tokenHash: gpsHash, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } }); if (consumed.count !== 1) throw new VerificationFailure("Verification token is invalid, expired, or already used."); }
      if (action === "ENTRY") {
        if (!safetyToken) throw new VerificationFailure("A completed safety declaration is required before check-in.", 428);
        const safetyHash = hashToken(safetyToken); const declaration = await tx.safetyDeclaration.findFirst({ where: { siteId: site.id, tokenHash: safetyHash, intendedAction: "ENTRY", checklistVersion: SAFETY_CHECKLIST_VERSION, status: "DECLARED", consumedAt: null, tokenExpiresAt: { gt: now } } }); if (!declaration) throw new VerificationFailure("Safety declaration is invalid, expired, or already used.");
        const attendance = await tx.attendanceRecord.create({ data: { employeeId: employee.id, siteId: site.id, entryTime: now, status: "OPEN" } }); const consumed = await tx.safetyDeclaration.updateMany({ where: { id: declaration.id, siteId: site.id, tokenHash: safetyHash, status: "DECLARED", consumedAt: null, tokenExpiresAt: { gt: now } }, data: { employeeId: employee.id, attendanceRecordId: attendance.id, consumedAt: now, status: "CONSUMED" } }); if (consumed.count !== 1) throw new VerificationFailure("Safety declaration is invalid, expired, or already used.");
        await tx.auditLog.create({ data: { actorId: employee.id, actorType: "EMPLOYEE", action: "SAFETY_DECLARATION_CONSUMED", entityType: "SafetyDeclaration", entityId: declaration.id, details: { siteCode, employeeCode, attendanceRecordId: attendance.id, action } } }); await tx.auditLog.create({ data: { actorId: employee.id, actorType: "EMPLOYEE", action: "ATTENDANCE_ENTRY", entityType: "AttendanceRecord", entityId: attendance.id, details: { siteCode, employeeCode, action } } }); return { action, attendance, safetyStatus: "DECLARED" as const };
      }
      const attendance = await tx.attendanceRecord.update({ where: { id: openRecord!.id }, data: { exitTime: now, status: "CLOSED" } }); await tx.auditLog.create({ data: { actorId: employee.id, actorType: "EMPLOYEE", action: "ATTENDANCE_EXIT", entityType: "AttendanceRecord", entityId: attendance.id, details: { siteCode, employeeCode, action } } }); return { action, attendance, safetyStatus: "NOT_REQUIRED" as const };
    });
    return res.status(200).json({ success: true, action: result.action, message: result.action === "ENTRY" ? "Entry recorded successfully" : "Exit recorded successfully", employee: { employeeCode: employee.employeeCode, fullName: employee.fullName }, attendance: { id: result.attendance.id, status: result.attendance.status, entryTime: iso(result.attendance.entryTime), exitTime: iso(result.attendance.exitTime), safetyStatus: result.safetyStatus } });
  } catch (error) { if (error instanceof VerificationFailure) return res.status(error.status).json({ success: false, message: error.message }); console.error("Attendance verification failed:", error instanceof Error ? error.message : "Unknown error"); return res.status(500).json({ success: false, message: "Unable to record attendance at this time." }); }
}

router.post("/entry", verificationRateLimit, (req, res) => handleAttendance(req, res, "ENTRY"));
router.post("/exit", verificationRateLimit, (req, res) => handleAttendance(req, res, "EXIT"));
router.post("/verify", verificationRateLimit, (req, res) => handleAttendance(req, res));
export default router;
