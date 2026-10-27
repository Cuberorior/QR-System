import { createHash } from "node:crypto";
import { prisma } from "../src/config/prisma";

type ApiResult = { status: number; body: Record<string, any> };

async function postLocation(body: Record<string, unknown>): Promise<ApiResult> {
  const response = await fetch("http://localhost:5001/api/public/location/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function main() {
  const site = await prisma.constructionSite.findUnique({
    where: { siteCode: "SITE-CMB-01" },
    select: { id: true, latitude: true, longitude: true },
  });

  if (!site || site.latitude === null || site.longitude === null) {
    throw new Error("Configured test site coordinates are missing.");
  }

  const health = await fetch("http://localhost:5001/api/health");
  const siteLookup = await fetch("http://localhost:5001/api/public/sites/SITE-CMB-01");
  const success = await postLocation({ siteCode: "SITE-CMB-01", latitude: site.latitude, longitude: site.longitude, accuracy: 10 });
  const outside = await postLocation({ siteCode: "SITE-CMB-01", latitude: site.latitude + 1, longitude: site.longitude, accuracy: 10 });
  const invalidCoordinates = await postLocation({ siteCode: "SITE-CMB-01", latitude: 100, longitude: site.longitude, accuracy: 10 });
  const poorAccuracy = await postLocation({ siteCode: "SITE-CMB-01", latitude: site.latitude, longitude: site.longitude, accuracy: 51 });
  const invalidSite = await postLocation({ siteCode: "DOES-NOT-EXIST", latitude: site.latitude, longitude: site.longitude, accuracy: 10 });
  const inactiveSite = await prisma.constructionSite.findFirst({ where: { isActive: false }, select: { siteCode: true, latitude: true, longitude: true } });
  const inactive = inactiveSite && inactiveSite.latitude !== null && inactiveSite.longitude !== null
    ? await postLocation({ siteCode: inactiveSite.siteCode, latitude: inactiveSite.latitude, longitude: inactiveSite.longitude, accuracy: 10 })
    : null;

  const session = await prisma.verificationSession.findFirst({
    where: { siteId: site.id },
    orderBy: { createdAt: "desc" },
    select: { tokenHash: true, siteId: true, expiresAt: true },
  });

  const tokenHashMatches = Boolean(
    session && success.body.verificationToken &&
    session.tokenHash === createHash("sha256").update(success.body.verificationToken).digest("hex"),
  );

  console.log(JSON.stringify({
    health: health.status,
    siteLookup: siteLookup.status,
    success: { status: success.status, allowed: success.body.success, distanceMeters: success.body.distanceMeters, expiresAtPresent: Boolean(success.body.expiresAt) },
    outside: { status: outside.status, errorCode: outside.body.errorCode },
    invalidCoordinates: { status: invalidCoordinates.status },
    poorAccuracy: { status: poorAccuracy.status, errorCode: poorAccuracy.body.errorCode },
    invalidSite: { status: invalidSite.status },
    inactiveSite: inactive ? { status: inactive.status } : { skipped: true, reason: "No inactive site with configured coordinates exists in the database." },
    session: { created: Boolean(session), tokenHashMatches, expiresAtInFuture: Boolean(session && session.expiresAt > new Date()) },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Location API test failed");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
