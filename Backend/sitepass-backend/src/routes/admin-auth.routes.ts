import bcrypt from "bcrypt";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { getJwtSecret } from "../middleware/admin-auth";

const router = Router();
const loginSchema = z.object({ email: z.string().trim().email().max(191), password: z.string().min(1).max(200) });
const loginRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false });

router.post("/login", loginRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, message: "Invalid login request." });

  try {
    const admin = await prisma.administrator.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    const passwordMatches = admin ? await bcrypt.compare(parsed.data.password, admin.passwordHash) : false;
    if (!admin || !admin.isActive || !passwordMatches) return res.status(401).json({ success: false, message: "Invalid administrator credentials." });

    const token = jwt.sign({ role: "ADMIN" }, getJwtSecret(), { subject: admin.id, expiresIn: "15m" });
    return res.json({ success: true, token, administrator: { id: admin.id, fullName: admin.fullName, email: admin.email, role: "ADMIN" } });
  } catch (error) {
    console.error("Administrator login failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(503).json({ success: false, message: "Administrator authentication is not available." });
  }
});

export default router;
