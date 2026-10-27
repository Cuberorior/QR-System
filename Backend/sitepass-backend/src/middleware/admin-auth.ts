import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";

export type AdminRole = "ADMIN";

export type AdminClaims = {
  sub: string;
  role: AdminRole;
};

declare global {
  namespace Express {
    interface Request {
      admin?: AdminClaims;
    }
  }
}

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

  if (!token) {
    return res.status(401).json({ success: false, message: "Administrator authentication required." });
  }

  try {
    const claims = jwt.verify(token, getJwtSecret());
    if (!claims || typeof claims !== "object" || typeof claims.sub !== "string" || !["ADMIN", "SUPER_ADMIN", "SITE_ADMIN"].includes(String(claims.role))) {
      return res.status(401).json({ success: false, message: "Invalid administrator authentication token." });
    }
    const administrator = await prisma.administrator.findUnique({ where: { id: claims.sub }, select: { role: true, isActive: true } });
    if (!administrator?.isActive || administrator.role !== "ADMIN") return res.status(401).json({ success: false, message: "Administrator account is inactive or changed." });
    req.admin = { sub: claims.sub, role: "ADMIN" };
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired administrator authentication token." });
  }
}
