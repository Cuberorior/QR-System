import bcrypt from "bcrypt";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { getJwtSecret, requireAdmin } from "../middleware/admin-auth";

const router = Router();
const loginSchema = z.object({ email: z.string().trim().email().max(191), password: z.string().min(1).max(200) });
const profileSchema = z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(191) });
const passwordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(12).max(200) });
const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

router.post("/login", loginRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid login request." });

  try {
    const admin = await prisma.administrator.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    const passwordMatches = admin ? await bcrypt.compare(parsed.data.password, admin.passwordHash) : false;
    if (!admin || !admin.isActive || !passwordMatches) return res.status(401).json({ success: false, message: "Invalid administrator credentials." });

    const token = jwt.sign({ role: "ADMIN" }, getJwtSecret(), { subject: admin.id, expiresIn: "8h" });
    return res.json({ success: true, token, administrator: { id: admin.id, fullName: admin.fullName, email: admin.email, role: "ADMIN" } });
  } catch (error) {
    console.error("Administrator login failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(503).json({ success: false, message: "Administrator authentication is not available." });
  }
});

router.get("/profile", requireAdmin, async (req, res) => {
  const administrator = await prisma.administrator.findUnique({
    where: { id: req.admin!.sub },
    select: { id: true, fullName: true, email: true, role: true },
  });
  if (!administrator) return res.status(404).json({ success: false, message: "Administrator profile not found." });
  return res.json({ success: true, administrator });
});

router.patch("/profile", requireAdmin, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Enter a valid name and email address." });

  try {
    const email = parsed.data.email.toLowerCase();
    const duplicate = await prisma.administrator.findFirst({ where: { email, id: { not: req.admin!.sub } }, select: { id: true } });
    if (duplicate) return res.status(409).json({ success: false, message: "That email address is already in use." });
    const administrator = await prisma.administrator.update({
      where: { id: req.admin!.sub },
      data: { fullName: parsed.data.fullName, email },
      select: { id: true, fullName: true, email: true, role: true },
    });
    return res.json({ success: true, administrator });
  } catch (error) {
    console.error("Administrator profile update failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(503).json({ success: false, message: "Administrator profile could not be updated." });
  }
});

router.patch("/password", requireAdmin, async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "The new password must contain at least 12 characters." });

  try {
    const administrator = await prisma.administrator.findUnique({ where: { id: req.admin!.sub }, select: { passwordHash: true } });
    if (!administrator || !(await bcrypt.compare(parsed.data.currentPassword, administrator.passwordHash))) {
      return res.status(401).json({ success: false, message: "The current password is incorrect." });
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.administrator.update({ where: { id: req.admin!.sub }, data: { passwordHash } });
    return res.json({ success: true, message: "Password updated successfully." });
  } catch (error) {
    console.error("Administrator password update failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(503).json({ success: false, message: "Administrator password could not be updated." });
  }
});

export default router;
