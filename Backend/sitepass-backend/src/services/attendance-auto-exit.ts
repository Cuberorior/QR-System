import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../config/prisma";

export const MAX_ATTENDANCE_HOURS = 10;
const MAX_ATTENDANCE_MS = MAX_ATTENDANCE_HOURS * 60 * 60 * 1000;
const BATCH_SIZE = 100;
type AttendanceScope = { employeeId?: string; siteId?: string | { in: string[] } };

/** Run inside a transaction so closing a session and its audit event commit together. */
export async function expireAttendanceBatch(tx: Prisma.TransactionClient, now: Date, scope: AttendanceScope = {}) {
  const cutoff = new Date(now.getTime() - MAX_ATTENDANCE_MS);
  const records = await tx.attendanceRecord.findMany({
    where: { ...scope, status: "OPEN", exitTime: null, entryTime: { lte: cutoff } },
    select: { id: true, entryTime: true, employee: { select: { employeeCode: true } }, site: { select: { siteCode: true } } },
    orderBy: [{ entryTime: "asc" }, { id: "asc" }], take: BATCH_SIZE,
  });
  let closed = 0;
  for (const record of records) {
    const exitTime = new Date(record.entryTime.getTime() + MAX_ATTENDANCE_MS);
    // Compare-and-set protects manual exits and concurrent workers from duplicate changes/logs.
    const updated = await tx.attendanceRecord.updateMany({
      where: { id: record.id, status: "OPEN", exitTime: null, entryTime: record.entryTime },
      data: { exitTime, status: "CLOSED" },
    });
    if (!updated.count) continue;
    await tx.auditLog.create({ data: {
      actorType: "SYSTEM", action: "ATTENDANCE_AUTO_EXIT", entityType: "AttendanceRecord", entityId: record.id,
      details: {
        siteCode: record.site.siteCode, employeeCode: record.employee.employeeCode,
        entryTime: record.entryTime.toISOString(), exitTime: exitTime.toISOString(),
        processedAt: now.toISOString(), reason: "Maximum attendance duration reached", maxHours: MAX_ATTENDANCE_HOURS,
      },
    } });
    closed += 1;
  }
  return { scanned: records.length, closed };
}

/** Also called on reads/actions to catch up after downtime and on serverless hosts. */
export async function expireOpenAttendance(now = new Date(), scope: AttendanceScope = {}) {
  let total = 0;
  let scanned: number;
  do {
    const result = await prisma.$transaction(tx => expireAttendanceBatch(tx, now, scope), { timeout: 15000 });
    total += result.closed;
    scanned = result.scanned;
  } while (scanned === BATCH_SIZE);
  return total;
}

/** Long-running servers sweep once per minute; request-time checks enforce the same deadline. */
export function startAttendanceAutoExit() {
  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try { await expireOpenAttendance(); }
    catch (error) { console.error("Automatic attendance exit failed:", error instanceof Error ? error.message : "Unknown error"); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void sweep(); }, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
