import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";

const router = Router();
const requestSchema = z.object({ siteCode: z.string().trim().min(1).max(100), employeeCode: z.string().trim().min(1).max(100), accessCode: z.string().min(1).max(200), verificationToken: z.string().min(1).max(512).optional() });
const verificationRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many attendance verification attempts. Please try again later." } });
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

class VerificationFailure extends Error {
  status: number;
  constructor(message: string, status = 401) { super(message); this.status = status; }
}

function iso(value: Date | null): string | null { return value ? value.toISOString() : null; }

router.post("/verify", verificationRateLimit, async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid attendance verification request." });
  const { siteCode, employeeCode, accessCode, verificationToken } = parsed.data;

  try {
    const site = await prisma.constructionSite.findUnique({ where: { siteCode }, select: { id: true, siteCode: true, isActive: true, geofencingEnabled: true } });
    if (!site || !site.isActive) return res.status(404).json({ success: false, message: "Construction site not found or inactive." });

    const employee = await prisma.employee.findFirst({ where: { employeeCode, siteId: site.id }, select: { id: true, employeeCode: true, fullName: true, accessCodeHash: true, isActive: true, siteId: true } });
    const accessCodeMatches = employee ? await bcrypt.compare(accessCode, employee.accessCodeHash) : false;
    if (!employee || !employee.isActive || !accessCodeMatches) return res.status(401).json({ success: false, message: "Employee verification failed." });

    const result = await prisma.$transaction(async (tx) => {
      const authoritativeSite = await tx.constructionSite.findUnique({ where: { id: site.id }, select: { geofencingEnabled: true } });
      if (!authoritativeSite) throw new VerificationFailure("Construction site not found.", 404);
      if (!authoritativeSite.geofencingEnabled && verificationToken) throw new VerificationFailure("GPS verification is disabled for this site; do not submit a location token.", 400);
      if (authoritativeSite?.geofencingEnabled && !verificationToken) throw new VerificationFailure("Valid location verification is required.");
      // Serialize all attendance decisions for this employee. The row lock prevents
      // two valid requests from creating two OPEN records concurrently.
      await tx.$queryRaw`SELECT id FROM Employee WHERE id = ${employee.id} FOR UPDATE`;

      const now = new Date();
      if (authoritativeSite.geofencingEnabled) {
        const tokenHash = hashToken(verificationToken!);
        const session = await tx.verificationSession.findFirst({ where: { tokenHash, siteId: site.id } });
        if (!session || session.consumedAt !== null || session.expiresAt <= now) throw new VerificationFailure("Verification token is invalid, expired, or already used.");
        const consumed = await tx.verificationSession.updateMany({ where: { id: session.id, siteId: site.id, tokenHash, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
        if (consumed.count !== 1) throw new VerificationFailure("Verification token is invalid, expired, or already used.");
      }

      const openRecord = await tx.attendanceRecord.findFirst({ where: { employeeId: employee.id, siteId: site.id, status: "OPEN", exitTime: null }, orderBy: { entryTime: "desc" } });
      if (!openRecord) {
        const attendance = await tx.attendanceRecord.create({ data: { employeeId: employee.id, siteId: site.id, entryTime: now, status: "OPEN" } });
        await tx.auditLog.create({ data: { actorId: employee.id, actorType: "EMPLOYEE", action: "ATTENDANCE_ENTRY", entityType: "AttendanceRecord", entityId: attendance.id, details: { siteCode, employeeCode } } });
        return { action: "ENTRY" as const, attendance };
      }

      const attendance = await tx.attendanceRecord.update({ where: { id: openRecord.id }, data: { exitTime: now, status: "CLOSED" } });
      await tx.auditLog.create({ data: { actorId: employee.id, actorType: "EMPLOYEE", action: "ATTENDANCE_EXIT", entityType: "AttendanceRecord", entityId: attendance.id, details: { siteCode, employeeCode } } });
      return { action: "EXIT" as const, attendance };
    });

    return res.status(200).json({ success: true, action: result.action, message: result.action === "ENTRY" ? "Entry recorded successfully" : "Exit recorded successfully", employee: { employeeCode: employee.employeeCode, fullName: employee.fullName }, attendance: { status: result.attendance.status, entryTime: iso(result.attendance.entryTime), ...(result.action === "EXIT" ? { exitTime: iso(result.attendance.exitTime) } : {}) } });
  } catch (error) {
    if (error instanceof VerificationFailure) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Attendance verification failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ success: false, message: "Unable to record attendance at this time." });
  }
});

export default router;
