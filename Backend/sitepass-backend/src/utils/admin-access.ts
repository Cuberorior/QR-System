import { prisma } from "../config/prisma";
import { getConfiguredSite } from "./single-site";

export async function canAccessSite(adminId: string, role: string, siteId: string): Promise<boolean> {
  const [administrator, site] = await Promise.all([
    prisma.administrator.count({ where: { id: adminId, role: "ADMIN", isActive: true } }),
    getConfiguredSite(),
  ]);
  return administrator === 1 && site?.id === siteId;
}

export async function authorizedSiteIds(adminId: string, role: string): Promise<string[] | undefined> {
  const [administrator, site] = await Promise.all([
    prisma.administrator.count({ where: { id: adminId, role: "ADMIN", isActive: true } }),
    getConfiguredSite(),
  ]);
  if (administrator !== 1) return [];
  return site ? [site.id] : [];
}

export async function getAdmin(adminId: string) {
  return prisma.administrator.findUnique({ where: { id: adminId }, select: { id: true, fullName: true, email: true, role: true, isActive: true } });
}
