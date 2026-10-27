import "dotenv/config";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../src/config/prisma";
import { getJwtSecret } from "../src/middleware/admin-auth";

const BASE_URL = process.env.SITEPASS_API_URL || "http://localhost:5001";
const ADMIN_EMAIL = process.env.SITEPASS_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SITEPASS_ADMIN_PASSWORD;
const TEST_EMPLOYEE_CODE = process.env.SITEPASS_TEST_EMPLOYEE_CODE || "EMP-TEST-001";
const TEST_EMPLOYEE_NAME = "SITEPASS Automated Test Employee";
let cleanupAdminToken = "";
let cleanupEmployeeId = "";

type ApiResult = { status: number; body: Record<string, any> };

async function request(path: string, options: RequestInit = {}): Promise<ApiResult> {
  const response = await fetch(`${BASE_URL}${path}`, options);
  const text = await response.text();
  let body: Record<string, any> = {};
  try { body = text ? JSON.parse(text) as Record<string, any> : {}; } catch { body = { raw: text }; }
  return { status: response.status, body };
}

function jsonBody(body: unknown): RequestInit { return { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }; }
function auth(token: string): HeadersInit { return { authorization: `Bearer ${token}` }; }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }

async function getFreshToken(siteCode: string, latitude: number, longitude: number, action: "ENTRY" | "EXIT" = "ENTRY"): Promise<string> {
  const result = await request("/api/public/location/verify", { method: "POST", ...jsonBody({ siteCode, action, latitude, longitude, accuracy: 10 }) });
  assert(result.status === 200 && typeof result.body.verificationToken === "string", `GPS verification failed for ${siteCode}.`);
  return result.body.verificationToken;
}

async function safetyDeclaration(siteCode: string, verificationToken: string): Promise<string> {
  const result = await request("/api/public/attendance/safety-declarations", { method: "POST", ...jsonBody({ siteCode, verificationToken, responses: { safetyHelmet: true, safetyFootwear: true, highVisibilityClothing: true, protectiveEquipment: true, siteSafetyInstructions: true, fitForDuty: true } }) });
  assert(result.status === 201 && typeof result.body.safetyToken === "string", `Safety declaration submission failed (${result.status}).`);
  return result.body.safetyToken as string;
}

async function attendance(siteCode: string, employeeCode: string, accessCode: string, verificationToken: string, safetyToken?: string, action: "ENTRY" | "EXIT" = "ENTRY"): Promise<ApiResult> {
  const endpoint = action === "ENTRY" ? "/api/public/attendance/entry" : "/api/public/attendance/exit";
  return request(endpoint, { method: "POST", ...jsonBody({ siteCode, employeeCode, accessCode, verificationToken, ...(safetyToken ? { safetyToken } : {}) }) });
}

async function sessionByToken(token: string) {
  return prisma.verificationSession.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, siteId: true, consumedAt: true, expiresAt: true } });
}

async function main() {
  assert(ADMIN_EMAIL && ADMIN_PASSWORD, "Set SITEPASS_ADMIN_EMAIL and SITEPASS_ADMIN_PASSWORD before running integration tests.");

  const originalSite = await prisma.constructionSite.findUnique({ where: { siteCode: "SITE-CMB-01" }, select: { id: true, siteCode: true, name: true, latitude: true, longitude: true, geofenceRadius: true, geofencingEnabled: true, isActive: true } });
  assert(originalSite && originalSite.latitude !== null && originalSite.longitude !== null, "SITE-CMB-01 is missing configured GPS coordinates.");
  const site = originalSite;

  const login = await request("/api/admin/auth/login", { method: "POST", ...jsonBody({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }) });
  assert(login.status === 200 && typeof login.body.token === "string", "Administrator login failed.");
  const adminToken = login.body.token as string;
  cleanupAdminToken = adminToken;

  const employeeList = await request(`/api/admin/employees?siteCode=${encodeURIComponent(site.siteCode)}`, { headers: auth(adminToken) });
  assert(employeeList.status === 200 && Array.isArray(employeeList.body.employees), "Authenticated employee list failed.");

  let testEmployee = employeeList.body.employees.find((item: Record<string, any>) => item.employeeCode === TEST_EMPLOYEE_CODE);
  let testEmployeeCreated = false;
  if (!testEmployee) {
    const accessCode = randomBytes(24).toString("base64url");
    const created = await request("/api/admin/employees", { method: "POST", headers: { ...auth(adminToken), "content-type": "application/json" }, body: JSON.stringify({ employeeCode: TEST_EMPLOYEE_CODE, fullName: TEST_EMPLOYEE_NAME, email: "sitepass-test@example.test", phone: "+0000000000", siteCode: site.siteCode, accessCode }) });
    assert(created.status === 201 && created.body.employee, "Development test employee creation failed.");
    testEmployee = created.body.employee;
    testEmployeeCreated = true;
  }

  const testEmployeeId = testEmployee.id as string;
  cleanupEmployeeId = testEmployeeId;
  const accessCode = randomBytes(24).toString("base64url");
  const reset = await request(`/api/admin/employees/${testEmployeeId}/access-code`, { method: "POST", headers: { ...auth(adminToken), "content-type": "application/json" }, body: JSON.stringify({ accessCode }) });
  assert(reset.status === 200 && !("accessCodeHash" in reset.body.employee), "Test employee access-code reset failed or leaked a hash.");
  await request(`/api/admin/employees/${testEmployeeId}/status`, { method: "PATCH", headers: { ...auth(adminToken), "content-type": "application/json" }, body: JSON.stringify({ isActive: true }) });

  const existingOpen = await prisma.attendanceRecord.findFirst({ where: { employeeId: testEmployeeId, siteId: site.id, status: "OPEN", exitTime: null } });
  if (existingOpen) {
    const cleanupToken = await getFreshToken(site.siteCode, site.latitude, site.longitude, "EXIT");
    const closeExisting = await attendance(site.siteCode, TEST_EMPLOYEE_CODE, accessCode, cleanupToken, undefined, "EXIT");
    assert(closeExisting.status === 200 && closeExisting.body.action === "EXIT", `Unable to close a previous test fixture attendance record (status ${closeExisting.status}, message ${closeExisting.body.message || "unknown"}).`);
  }

  const results: Record<string, string> = {};
  const validToken = await getFreshToken(site.siteCode, site.latitude, site.longitude);
  const validSession = await sessionByToken(validToken);
  assert(validSession && validSession.consumedAt === null, "Valid GPS session was not stored as unused.");
  results.validGps = "passed";
  const outside = await request("/api/public/location/verify", { method: "POST", ...jsonBody({ siteCode: site.siteCode, latitude: site.latitude + 1, longitude: site.longitude, accuracy: 10 }) });
  assert(outside.status === 403 && outside.body.errorCode === "OUTSIDE_GEOFENCE", "Outside-geofence test failed.");
  results.outsideGps = "passed";
  const poorAccuracy = await request("/api/public/location/verify", { method: "POST", ...jsonBody({ siteCode: site.siteCode, latitude: site.latitude, longitude: site.longitude, accuracy: 51 }) });
  assert(poorAccuracy.status === 422, "Poor-accuracy test failed.");
  results.poorAccuracy = "passed";
  const invalidSite = await request("/api/public/location/verify", { method: "POST", ...jsonBody({ siteCode: "SITE-DOES-NOT-EXIST", latitude: site.latitude, longitude: site.longitude, accuracy: 10 }) });
  assert(invalidSite.status === 404, "Invalid-site test failed.");
  results.invalidSite = "passed";
  const invalidCoordinates = await request("/api/public/location/verify", { method: "POST", ...jsonBody({ siteCode: site.siteCode, latitude: 100, longitude: site.longitude, accuracy: 10 }) });
  assert(invalidCoordinates.status === 400, "Invalid-coordinate test failed.");
  results.invalidCoordinates = "passed";

  const missingSafetyGps = await getFreshToken(site.siteCode, site.latitude, site.longitude);
  const missingSafety = await attendance(site.siteCode, TEST_EMPLOYEE_CODE, accessCode, missingSafetyGps);
  assert(missingSafety.status === 428 && (await sessionByToken(missingSafetyGps))?.consumedAt === null, "Check-in without safety declaration was not rejected safely.");
  results.missingSafety = "passed";

  const attendanceBeforeEntry = await prisma.attendanceRecord.count({ where: { employeeId: testEmployeeId, siteId: site.id } });
  const entrySafety = await safetyDeclaration(site.siteCode, validToken);
  const entryWithSafety = await attendance(site.siteCode, TEST_EMPLOYEE_CODE, accessCode, validToken, entrySafety);
  const entry = entryWithSafety;
  assert(entry.status === 200 && entry.body.action === "ENTRY" && entry.body.attendance.status === "OPEN" && entry.body.attendance.safetyStatus === "CONSUMED", "Employee entry test failed.");
  const consumedEntrySession = await sessionByToken(validToken);
  assert(consumedEntrySession?.consumedAt !== null, "Entry GPS session was not consumed.");
  const entryCount = await prisma.attendanceRecord.count({ where: { employeeId: testEmployeeId, siteId: site.id } });
  assert(entryCount === attendanceBeforeEntry + 1, "Entry did not create exactly one attendance record.");
  results.entry = "passed";

  const replay = await attendance(site.siteCode, TEST_EMPLOYEE_CODE, accessCode, validToken);
  assert(replay.status === 401, "Consumed GPS token was reusable.");
  results.consumedTokenReplay = "passed";

  const badCodeToken = await getFreshToken(site.siteCode, site.latitude, site.longitude);
  const badCode = await attendance(site.siteCode, TEST_EMPLOYEE_CODE, `${accessCode}-wrong`, badCodeToken);
  const badCodeSession = await sessionByToken(badCodeToken);
  assert(badCode.status === 401 && badCodeSession?.consumedAt === null, `Incorrect access code consumed or lost a GPS session (status ${badCode.status}, session ${badCodeSession ? "present" : "missing"}).`);
  results.incorrectAccessCode = "passed";

  const unknownEmployeeToken = await getFreshToken(site.siteCode, site.latitude, site.longitude);
  const unknownEmployee = await attendance(site.siteCode, "EMP-DOES-NOT-EXIST", accessCode, unknownEmployeeToken);
  assert(unknownEmployee.status === 401 && (await sessionByToken(unknownEmployeeToken))?.consumedAt === null, "Unknown employee test failed.");
  results.unknownEmployee = "passed";

  const exitToken = await getFreshToken(site.siteCode, site.latitude, site.longitude, "EXIT");
  const exit = await attendance(site.siteCode, TEST_EMPLOYEE_CODE, accessCode, exitToken, undefined, "EXIT");
  assert(exit.status === 200 && exit.body.action === "EXIT" && exit.body.attendance.status === "CLOSED", "Employee exit test failed.");
  assert((await prisma.attendanceRecord.count({ where: { employeeId: testEmployeeId, siteId: site.id } })) === entryCount, "Exit created a duplicate attendance record.");
  results.exit = "passed";

  const expiredToken = await getFreshToken(site.siteCode, site.latitude, site.longitude);
  const expiredSession = await sessionByToken(expiredToken);
  assert(expiredSession, "Expired-session fixture was not stored.");
  await prisma.verificationSession.update({ where: { id: expiredSession.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const expired = await attendance(site.siteCode, TEST_EMPLOYEE_CODE, accessCode, expiredToken);
  assert(expired.status === 401 && (await sessionByToken(expiredToken))?.consumedAt === null, "Expired GPS session test failed.");
  results.expiredToken = "passed";

  const invalidToken = await attendance(site.siteCode, TEST_EMPLOYEE_CODE, accessCode, "invalid-verification-token");
  assert(invalidToken.status === 401, "Invalid verification token test failed.");
  results.invalidToken = "passed";

  await request(`/api/admin/employees/${testEmployeeId}/status`, { method: "PATCH", headers: { ...auth(adminToken), "content-type": "application/json" }, body: JSON.stringify({ isActive: false }) });
  const inactiveToken = await getFreshToken(site.siteCode, site.latitude, site.longitude);
  const inactive = await attendance(site.siteCode, TEST_EMPLOYEE_CODE, accessCode, inactiveToken);
  assert(inactive.status === 401 && (await sessionByToken(inactiveToken))?.consumedAt === null, "Inactive employee test failed.");
  results.inactiveEmployee = "passed";
  await request(`/api/admin/employees/${testEmployeeId}/status`, { method: "PATCH", headers: { ...auth(adminToken), "content-type": "application/json" }, body: JSON.stringify({ isActive: true }) });

  const unauthorized = await request(`/api/admin/employees?siteCode=${site.siteCode}`);
  assert(unauthorized.status === 401, "Unauthorized administrator access was allowed.");
  results.unauthorizedAdminApi = "passed";

  const siteAdmin = null;
  const unassignedSite = await prisma.constructionSite.findFirst({ where: { id: { not: site.id }, isActive: true }, select: { id: true, siteCode: true } });
  const siteAdminHasNoAssignment = siteAdmin && unassignedSite ? (await prisma.adminSiteAssignment.count({ where: { adminId: siteAdmin.id, siteId: unassignedSite.id } })) === 0 : false;
  if (siteAdmin && unassignedSite && siteAdminHasNoAssignment) {
    const siteAdminToken = jwt.sign({ role: "SITE_ADMIN" }, getJwtSecret(), { subject: siteAdmin.id, expiresIn: "5m" });
    const unassignedAccess = await request(`/api/admin/employees?siteCode=${encodeURIComponent(unassignedSite.siteCode)}`, { headers: auth(siteAdminToken) });
    assert(unassignedAccess.status === 403, "Site Admin accessed an unassigned construction site.");
    results.unassignedSiteAdmin = "passed";
  } else {
    results.adminAllSites = "skipped: no second active site fixture";
  }

  const otherSite = await prisma.constructionSite.findFirst({ where: { siteCode: { not: site.siteCode }, isActive: true, latitude: { not: null }, longitude: { not: null } }, select: { siteCode: true, latitude: true, longitude: true } });
  if (otherSite && otherSite.latitude !== null && otherSite.longitude !== null) {
    const otherSiteToken = await getFreshToken(otherSite.siteCode, otherSite.latitude, otherSite.longitude);
    const wrongSite = await attendance(otherSite.siteCode, TEST_EMPLOYEE_CODE, accessCode, otherSiteToken);
    assert(wrongSite.status === 401, "Employee was accepted for a different site.");
    results.wrongSite = "passed";
  } else {
    results.wrongSite = "skipped: no second active configured site";
  }

  const concurrentBefore = await prisma.attendanceRecord.count({ where: { employeeId: testEmployeeId, siteId: site.id } });
  const [concurrentTokenA, concurrentTokenB] = await Promise.all([getFreshToken(site.siteCode, site.latitude, site.longitude), getFreshToken(site.siteCode, site.latitude, site.longitude)]);
  const [concurrentSafetyA, concurrentSafetyB] = await Promise.all([safetyDeclaration(site.siteCode, concurrentTokenA), safetyDeclaration(site.siteCode, concurrentTokenB)]);
  const concurrentResults = await Promise.all([attendance(site.siteCode, TEST_EMPLOYEE_CODE, accessCode, concurrentTokenA, concurrentSafetyA, "ENTRY"), attendance(site.siteCode, TEST_EMPLOYEE_CODE, accessCode, concurrentTokenB, concurrentSafetyB, "ENTRY")]);
  assert(concurrentResults.filter((item) => item.status === 200).length === 1 && concurrentResults.filter((item) => item.status === 409).length === 1, `Concurrent duplicate ENTRY requests were not serialized safely: ${concurrentResults.map((item) => `${item.status}:${item.body.message || ""}`).join(", ")}.`);
  const concurrentAfter = await prisma.attendanceRecord.count({ where: { employeeId: testEmployeeId, siteId: site.id } });
  const openCount = await prisma.attendanceRecord.count({ where: { employeeId: testEmployeeId, siteId: site.id, status: "OPEN", exitTime: null } });
  assert(concurrentAfter === concurrentBefore + 1 && openCount <= 1, "Concurrent requests created duplicate attendance records.");
  results.concurrentRequests = "passed";

  const finalRecords = await prisma.attendanceRecord.findMany({ where: { employeeId: testEmployeeId, siteId: site.id }, select: { status: true, entryTime: true, exitTime: true } });
  const auditCount = await prisma.auditLog.count({ where: { actorId: testEmployeeId, entityType: "AttendanceRecord" } });
  const preservedSite = await prisma.constructionSite.findUnique({ where: { id: site.id }, select: { siteCode: true, name: true, latitude: true, longitude: true, geofenceRadius: true, geofencingEnabled: true, isActive: true } });
  assert(preservedSite?.siteCode === site.siteCode && preservedSite.name === site.name && preservedSite.latitude === site.latitude && preservedSite.longitude === site.longitude && preservedSite.geofenceRadius === site.geofenceRadius, "Existing construction site data changed.");
  assert(finalRecords.length >= 2 && auditCount >= 2, "Attendance or audit records were not stored correctly.");
  results.databaseVerification = "passed";

  console.log(JSON.stringify({ success: true, testEmployeeCode: TEST_EMPLOYEE_CODE, testEmployeeCreated, results, attendanceRecords: finalRecords.length, attendanceAuditLogs: auditCount, testEmployeeDeactivatedForCleanup: true }, null, 2));

  await request(`/api/admin/employees/${testEmployeeId}/status`, { method: "PATCH", headers: { ...auth(adminToken), "content-type": "application/json" }, body: JSON.stringify({ isActive: false }) });
}

main().catch(async (error) => {
  if (cleanupAdminToken && cleanupEmployeeId) {
    await request(`/api/admin/employees/${cleanupEmployeeId}/status`, { method: "PATCH", headers: { ...auth(cleanupAdminToken), "content-type": "application/json" }, body: JSON.stringify({ isActive: false }) }).catch(() => undefined);
  }
  console.error(error instanceof Error ? error.stack : "Backend integration tests failed.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
