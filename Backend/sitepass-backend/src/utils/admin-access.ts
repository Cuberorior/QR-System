import { prisma } from "../config/prisma";

export async function canAccessSite(adminId: string, role: string, siteId: string): Promise<boolean> {
  return (await prisma.administrator.count({ where: { id: adminId, role: "ADMIN", isActive: true } })) === 1;
}

export async function authorizedSiteIds(adminId: string, role: string): Promise<string[] | undefined> {
  return undefined;
}

export async function getAdmin(adminId: string) {
  return prisma.administrator.findUnique({ where: { id: adminId }, select: { id: true, fullName: true, email: true, role: true, isActive: true } });
}
