import { prisma } from "../config/prisma";

/** Resolve the one site SITEPASS is configured to manage. The optional environment
 * value is deployment configuration; without it, the existing earliest site is used. */
export async function getConfiguredSite() {
  const siteCode = process.env.SITEPASS_SITE_CODE || process.env.DEFAULT_SITE_CODE;
  return prisma.constructionSite.findFirst({
    where: siteCode ? { siteCode } : undefined,
    orderBy: { createdAt: "asc" },
    select: { id: true, siteCode: true, name: true, location: true, latitude: true, longitude: true, geofenceRadius: true, geofencingEnabled: true, isActive: true },
  });
}
