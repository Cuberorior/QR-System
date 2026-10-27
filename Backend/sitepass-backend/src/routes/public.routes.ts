
import { Router } from "express";
import { prisma } from "../config/prisma";

const router = Router();

router.get("/sites/:siteId", async (req, res) => {
  try {
    const siteCode = String(req.params.siteId);

    const site = await prisma.constructionSite.findUnique({
      where: { siteCode },
      select: {
        siteCode: true,
        name: true,
        location: true,
        isActive: true,
        geofencingEnabled: true,
      },
    });

    if (!site || !site.isActive) {
      return res.status(404).json({
        success: false,
        message: "Site unavailable or inactive",
      });
    }

    return res.json({
      success: true,
      data: site,
    });
  } catch (error) {
    console.error("Site lookup failed:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

export default router;
