import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { haversineDistanceMeters, roundedDistanceMeters } from "../utils/geofence";

const router = Router();

const locationRequestSchema = z.object({
  siteCode: z.string().trim().min(1).max(100),
  action: z.enum(["ENTRY", "EXIT"]).optional(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().positive().max(100_000),
});

const verificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many location verification attempts. Please try again later." },
});

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

router.post("/verify", verificationRateLimit, async (req, res) => {
  const parsed = locationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid location verification request.",
      errors: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
    });
  }

  const { siteCode, latitude, longitude, accuracy, action } = parsed.data;

  try {
    const site = await prisma.constructionSite.findUnique({
      where: { siteCode },
      select: { id: true, isActive: true, geofencingEnabled: true, latitude: true, longitude: true, geofenceRadius: true },
    });

    if (!site || !site.isActive) {
      return res.status(404).json({ success: false, message: "Construction site not found or inactive." });
    }

    if (!site.geofencingEnabled || site.latitude === null || site.longitude === null || !Number.isFinite(site.latitude) || !Number.isFinite(site.longitude) || site.geofenceRadius <= 0) {
      return res.status(503).json({ success: false, message: "Location verification is not available for this site." });
    }

    if (accuracy > 50) {
      return res.status(422).json({ success: false, message: "GPS accuracy is insufficient. Please try again with a clearer GPS signal.", errorCode: "POOR_ACCURACY" });
    }

    const distanceMeters = haversineDistanceMeters(latitude, longitude, site.latitude, site.longitude);
    const roundedDistance = roundedDistanceMeters(distanceMeters);
    if (distanceMeters > site.geofenceRadius) {
      return res.status(403).json({ success: false, message: "You are outside the construction site.", errorCode: "OUTSIDE_GEOFENCE", distanceMeters: roundedDistance });
    }

    const verificationToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);
    await prisma.verificationSession.create({ data: { siteId: site.id, tokenHash: hashToken(verificationToken), latitude, longitude, accuracy, intendedAction: action || "LEGACY", expiresAt } });

    return res.status(200).json({ success: true, message: "Location verified successfully.", verificationToken, expiresAt: expiresAt.toISOString(), distanceMeters: roundedDistance });
  } catch (error) {
    console.error("Location verification failed:", error instanceof Error ? error.message : "Unknown error");
    return res.status(500).json({ success: false, message: "Unable to verify location at this time." });
  }
});

export default router;
