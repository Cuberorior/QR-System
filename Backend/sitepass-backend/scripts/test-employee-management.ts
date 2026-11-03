import "dotenv/config";
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/config/prisma";

const baseUrl = process.env.EMPLOYEE_TEST_BASE_URL || "http://127.0.0.1:5011/api";
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const adminEmail = `employee-management-${suffix}@invalid.test`;
const employeeEmail = `employee-${suffix}@invalid.test`;
let adminId = "";
let employeeId = "";
let openEmployeeId = "";
let accessToken = "";

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}), ...(init.headers || {}) } });
}
async function body(response: Response) { return response.json() as Promise<any>; }

async function main() {
  const password = randomBytes(20).toString("base64url");
  const configuredSite = await prisma.constructionSite.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, siteCode: true } });
  assert(configuredSite, "A configured construction site is required for this test.");
  const admin = await prisma.administrator.create({ data: { fullName: "Employee Management Test Admin", email: adminEmail, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" } });
  adminId = admin.id;
  try {
    const login = await request("/admin/auth/login", { method: "POST", body: JSON.stringify({ email: adminEmail, password }) });
    const loginData = await body(login); assert(login.ok && loginData.token, "Temporary admin login failed."); accessToken = loginData.token;

    const created = await request("/admin/employees", { method: "POST", headers: { "idempotency-key": `employee-test-${suffix}` }, body: JSON.stringify({ fullName: "Phone Test Employee", email: employeeEmail, phone: "07700 900123", address: "12 Temple Road, Colombo" }) });
    const createdData = await body(created); assert(created.status === 201, `Employee creation failed: ${createdData.message || created.status}`); assert(createdData.employee.phone === "+447700900123", "Phone number was not normalized to the UK international format."); assert(createdData.employee.address === "12 Temple Road, Colombo", "Address was not saved on employee creation."); employeeId = createdData.employee.id;

    const listed = await request("/admin/employees"); const listedData = await body(listed); assert(listed.ok && listedData.employees.some((employee: any) => employee.id === employeeId && employee.phone === "+447700900123"), "Phone number is absent from the employee directory.");

    const edited = await request(`/admin/employees/${employeeId}`, { method: "PATCH", body: JSON.stringify({ fullName: "Updated Phone Test Employee", email: employeeEmail, phone: "+44 7700 900124", address: "22 Test Lane, Kandy", isActive: false }) });
    const editedData = await body(edited); assert(edited.ok && editedData.employee.fullName === "Updated Phone Test Employee" && editedData.employee.phone === "+447700900124" && editedData.employee.address === "22 Test Lane, Kandy" && editedData.employee.isActive === false, "Employee edit did not persist the expected values.");

    const duplicate = await request("/admin/employees", { method: "POST", headers: { "idempotency-key": `employee-duplicate-${suffix}` }, body: JSON.stringify({ fullName: "Duplicate Email", email: employeeEmail, phone: "07700900125" }) });
    assert(duplicate.status === 409, "Duplicate employee email was accepted.");

    const openCreated = await request("/admin/employees", { method: "POST", headers: { "idempotency-key": `employee-open-${suffix}` }, body: JSON.stringify({ fullName: "Open Session Employee", email: `open-${employeeEmail}`, phone: "07700900126" }) });
    const openCreatedData = await body(openCreated); assert(openCreated.status === 201, `Open-session fixture creation failed: ${openCreatedData.message || openCreated.status}`); openEmployeeId = openCreatedData.employee.id;
    await prisma.employee.update({ where: { id: openEmployeeId }, data: { accessCodeHash: await bcrypt.hash("ArchiveCheck123!", 12) } });
    const attendance = await prisma.attendanceRecord.create({ data: { employeeId: openEmployeeId, siteId: configuredSite.id, status: "OPEN" } });
    const blockedArchive = await request(`/admin/employees/${openEmployeeId}/archive`, { method: "POST" }); assert(blockedArchive.status === 409, "Archive did not reject an employee with an open attendance session.");
    await prisma.attendanceRecord.update({ where: { id: attendance.id }, data: { status: "CLOSED", exitTime: new Date() } });

    const archived = await request(`/admin/employees/${openEmployeeId}/archive`, { method: "POST" }); const archivedData = await body(archived); assert(archived.ok && archivedData.employee.archivedAt, "Employee archival did not persist an archive timestamp.");
    const afterArchive = await request("/admin/employees"); const afterArchiveData = await body(afterArchive); assert(!afterArchiveData.employees.some((employee: any) => employee.id === openEmployeeId), "Archived employee remains in the normal employee directory.");
    const deniedVerification = await request("/public/attendance/entry", { method: "POST", body: JSON.stringify({ siteCode: configuredSite.siteCode, employeeCode: archivedData.employee.employeeCode, accessCode: "ArchiveCheck123!" }) });
    assert(deniedVerification.status === 401, "Archived employee credentials were accepted for attendance verification.");
    console.log("Employee management integration checks passed.");
  } finally {
    const ids = [employeeId, openEmployeeId].filter(Boolean);
    if (ids.length) {
      await prisma.safetyDeclaration.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.attendanceRecord.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.emailDelivery.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.employeeCreationRequest.deleteMany({ where: { employeeId: { in: ids } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
      await prisma.employee.deleteMany({ where: { id: { in: ids } } });
    }
    if (adminId) { await prisma.auditLog.deleteMany({ where: { actorId: adminId } }); await prisma.administrator.delete({ where: { id: adminId } }); }
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
