import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";

const router = Router();
export const SAFETY_CHECKLIST_VERSION = "construction-worker-v1";
const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
const submitLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, message: "Too many safety declaration attempts. Please try again later." } });
const schema = z.object({
  siteCode: z.string().trim().min(1).max(100),
  verificationToken: z.string().min(1).max(512).optional(),
  responses: z.object({
    safetyHelmet: z.literal(true),
    safetyFootwear: z.literal(true),
    highVisibilityClothing: z.literal(true),
    protectiveEquipment: z.literal(true),
    siteSafetyInstructions: z.literal(true),
    fitForDuty: z.literal(true),
  }).strict(),
}).strict();

router.post("/safety-declarations", submitLimit, async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ success: false, message: "Every safety requirement must be confirmed before continuing.", errors: parsed.error.issues });
  const site = await prisma.constructionSite.findUnique({ where: { siteCode: parsed.data.siteCode }, select: { id: true, siteCode: true, isActive: true, geofencingEnabled: true } });
  if (!site?.isActive) return res.status(404).json({ success: false, message: "Construction site not found or inactive." });
  try {
    if (site.geofencingEnabled && !parsed.data.verificationToken) return res.status(401).json({ success: false, message: "Valid location verification is required." });
    if (!site.geofencingEnabled && parsed.data.verificationToken) return res.status(400).json({ success: false, message: "GPS verification is disabled for this site." });
    if (site.geofencingEnabled) {
      const session = await prisma.verificationSession.findFirst({ where: { siteId: site.id, tokenHash: hashToken(parsed.data.verificationToken!), intendedAction: "ENTRY", consumedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
      if (!session) return res.status(401).json({ success: false, message: "Location verification is invalid or expired." });
    }
    const rawToken = randomBytes(32).toString("base64url");
    const declaration = await prisma.safetyDeclaration.create({ data: { siteId: site.id, checklistVersion: SAFETY_CHECKLIST_VERSION, intendedAction: "ENTRY", responseSnapshot: parsed.data.responses, submittedAt: new Date(), tokenHash: hashToken(rawToken), tokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000), status: "DECLARED" }, select: { id: true, checklistVersion: true, intendedAction: true, submittedAt: true, tokenExpiresAt: true } });
    await prisma.auditLog.create({ data: { actorType: "EMPLOYEE_WORKFLOW", action: "SAFETY_DECLARATION_SUBMITTED", entityType: "SafetyDeclaration", entityId: declaration.id, details: { siteCode: site.siteCode, checklistVersion: declaration.checklistVersion } } });
    return res.status(201).json({ success: true, message: "Safety declaration recorded. Continue with employee verification.", safetyToken: rawToken, declaration: { id: declaration.id, checklistVersion: declaration.checklistVersion, intendedAction: declaration.intendedAction, submittedAt: declaration.submittedAt.toISOString(), expiresAt: declaration.tokenExpiresAt.toISOString() } });
  } catch (error) { console.error("Safety declaration failed:", error instanceof Error ? error.message : "Unknown error"); return res.status(500).json({ success: false, message: "Unable to record the safety declaration." }); }
});

export default router;
