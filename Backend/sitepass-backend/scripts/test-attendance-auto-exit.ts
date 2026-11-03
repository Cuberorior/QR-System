import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/prisma';
import { expireAttendanceBatch } from '../src/services/attendance-auto-exit';

// All fixtures and audit events stay inside a transaction that is always rolled back.
const rollback = new Error('ROLLBACK_AUTO_EXIT_TEST');
const suffix = randomUUID();
try {
  await prisma.$transaction(async tx => {
    const site = await tx.constructionSite.create({ data: { siteCode: `AUTO-TEST-${suffix}`, name: 'Automatic exit test' } });
    const employee = await tx.employee.create({ data: { employeeCode: `AUTO-EMP-${suffix}`, fullName: 'Test worker', accessCodeHash: 'unused-test-hash', siteId: site.id } });
    const scope = { siteId: site.id };
    const entryTime = new Date('2026-11-03T08:00:00+05:30');
    const deadline = new Date('2026-11-03T18:00:00+05:30');
    const create = (entry = entryTime, exitTime: Date | null = null) => tx.attendanceRecord.create({ data: { siteId: site.id, employeeId: employee.id, entryTime: entry, exitTime, status: exitTime ? 'CLOSED' : 'OPEN' } });

    const open = await create();
    const manualTime = new Date('2026-11-03T15:00:00+05:30');
    const manual = await create(entryTime, manualTime);
    assert.equal((await expireAttendanceBatch(tx, new Date(deadline.getTime() - 1), scope)).closed, 0, 'Keep attendance open until the full 10 hours');
    assert.equal((await expireAttendanceBatch(tx, deadline, { siteId: { in: [] } })).closed, 0, 'Respect empty authorized site scope');
    assert.equal((await expireAttendanceBatch(tx, deadline, scope)).closed, 1, 'Close at exactly 10 hours');
    const closed = await tx.attendanceRecord.findUniqueOrThrow({ where: { id: open.id } });
    assert.equal(closed.status, 'CLOSED');
    assert.equal(closed.exitTime?.toISOString(), deadline.toISOString(), '08:00 entry records 18:00 exit in the same timezone');
    assert.equal((await tx.attendanceRecord.findUniqueOrThrow({ where: { id: manual.id } })).exitTime?.toISOString(), manualTime.toISOString(), 'Preserve earlier manual exits');
    const log = await tx.auditLog.findFirstOrThrow({ where: { entityId: open.id, action: 'ATTENDANCE_AUTO_EXIT' } });
    assert.equal(log.actorType, 'SYSTEM');
    assert.equal((log.details as { exitTime: string }).exitTime, deadline.toISOString());
    assert.equal((await expireAttendanceBatch(tx, deadline, scope)).closed, 0, 'Repeated sweeps are idempotent');
    assert.equal(await tx.auditLog.count({ where: { entityId: open.id } }), 1, 'Do not duplicate audit events');

    const overnightEntry = new Date('2026-11-02T20:00:00+05:30');
    const overnight = await create(overnightEntry);
    assert.equal((await expireAttendanceBatch(tx, deadline, scope)).closed, 1);
    assert.equal((await tx.attendanceRecord.findUniqueOrThrow({ where: { id: overnight.id } })).exitTime?.toISOString(), new Date('2026-11-03T06:00:00+05:30').toISOString(), 'Delayed processing uses the overnight deadline, not processing time');
    assert.equal(await tx.attendanceRecord.count({ where: { ...scope, status: 'OPEN' } }), 0, 'Expired sessions no longer block new entry or count as on-site');
    const nextEntry = await create(deadline);
    assert.equal((await expireAttendanceBatch(tx, deadline, scope)).closed, 0, 'A new check-in gets its own full 10-hour window');
    assert.equal((await tx.attendanceRecord.findUniqueOrThrow({ where: { id: nextEntry.id } })).status, 'OPEN');

    // Simulate a manual exit winning between candidate selection and the conditional update.
    const raced = await create();
    const competingTx = {
      ...tx,
      attendanceRecord: {
        ...tx.attendanceRecord,
        findMany: async (args: Parameters<typeof tx.attendanceRecord.findMany>[0]) => {
          const candidates = await tx.attendanceRecord.findMany(args);
          await tx.attendanceRecord.update({ where: { id: raced.id }, data: { status: 'CLOSED', exitTime: manualTime } });
          return candidates;
        },
      },
    } as typeof tx;
    assert.equal((await expireAttendanceBatch(competingTx, deadline, scope)).closed, 0, 'A competing manual exit is never overwritten');
    assert.equal(await tx.auditLog.count({ where: { entityId: raced.id } }), 0, 'A lost race creates no automatic exit audit');

    await tx.attendanceRecord.createMany({ data: Array.from({ length: 101 }, () => ({ siteId: site.id, employeeId: employee.id, entryTime })) });
    assert.equal((await expireAttendanceBatch(tx, deadline, scope)).closed, 100, 'Bound each database transaction');
    assert.equal((await expireAttendanceBatch(tx, deadline, scope)).closed, 1, 'Process the remainder on the next batch');
    throw rollback;
  }, { timeout: 30000 });
} catch (error) {
  if (error !== rollback) throw error;
  assert.equal(await prisma.constructionSite.count({ where: { siteCode: `AUTO-TEST-${suffix}` } }), 0);
  console.log('PASS: 10-hour boundary, 08:00→18:00, manual exits, overnight/downtime catch-up, site scoping, audit/idempotency, new entry, concurrent exit protection, batching, and fixture rollback.');
} finally {
  await prisma.$disconnect();
}
