import { prisma } from "../config/prisma";
/** Explicit site assignments restrict an administrator. Existing administrators
 * with no assignments retain their historical all-site access. */
export async function authorizedSiteIds(adminId: string, _role: string): Promise<string[] | undefined> {
  const admin = await prisma.administrator.findUnique({ where: { id: adminId }, select: { isActive: true, siteAssignments: { select: { siteId: true } } } });
  if (!admin?.isActive) return [];
  return admin.siteAssignments.length ? admin.siteAssignments.map((assignment) => assignment.siteId) : undefined;
}

export async function canAccessSite(adminId: string, role: string, siteId: string): Promise<boolean> {
  const allowed = await authorizedSiteIds(adminId, role);
  return allowed === undefined || allowed.includes(siteId);
}

export async function getAdmin(adminId: string) {
  return prisma.administrator.findUnique({ where: { id: adminId }, select: { id: true, fullName: true, email: true, role: true, isActive: true } });
}
