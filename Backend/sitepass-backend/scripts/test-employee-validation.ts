import assert from 'node:assert/strict';
import { createEmployeeSchema, updateEmployeeSchema, normalizeInternationalPhone } from '../src/utils/employee-validation';
import { createEmployeeSchema as frontendCreate, updateEmployeeSchema as frontendUpdate, validateEmployeeForm } from '../../../Frontend/src/services/employeeValidation.js';

const base = { fullName: 'Anne-Marie O’Neill', email: 'worker@example.com', phone: '07700 900123', address: '12 Main Road\nLondon', siteCode: 'TEST' };
const cases = [
  { label: 'normal employee', input: base, valid: true },
  { label: '30 name characters', input: { ...base, fullName: 'A'.repeat(30) }, valid: true },
  { label: '31 name characters', input: { ...base, fullName: 'A'.repeat(31) }, valid: false },
  { label: 'spaces count as characters', input: { ...base, fullName: 'Anne Marie '.repeat(3).trim() }, valid: false },
  { label: '50 address words', input: { ...base, address: Array(50).fill('Road').join('\n') }, valid: true },
  { label: '51 address words', input: { ...base, address: Array(51).fill('Road').join('  ') }, valid: false },
  { label: '500 address characters', input: { ...base, address: 'A'.repeat(500) }, valid: true },
  { label: '501 address characters', input: { ...base, address: 'A'.repeat(501) }, valid: false },
  { label: 'Unicode names', input: { ...base, fullName: 'ගයාන් பிரியா José' }, valid: true },
  { label: 'Sinhala joiner', input: { ...base, fullName: 'ශ්‍රී' }, valid: true },
  { label: 'initials', input: { ...base, fullName: "A. B. O'Neill" }, valid: true },
  { label: 'blank name', input: { ...base, fullName: '   ' }, valid: false },
  { label: 'numeric name', input: { ...base, fullName: '123' }, valid: false },
  { label: 'punctuation name', input: { ...base, fullName: '---' }, valid: false },
  { label: 'markup name', input: { ...base, fullName: '<script>' }, valid: false },
  { label: 'missing email', input: { ...base, email: '' }, valid: false },
  { label: 'invalid email', input: { ...base, email: 'worker@' }, valid: false },
  { label: 'invalid phone', input: { ...base, phone: '123' }, valid: false },
  { label: 'foreign phone', input: { ...base, phone: '+94771234567' }, valid: true },
  { label: 'formatted foreign phone', input: { ...base, phone: '+94 757 949 092' }, valid: true },
  { label: 'UK international mobile', input: { ...base, phone: '+44 7700 900123' }, valid: true },
  { label: 'UK landline', input: { ...base, phone: '020 7946 0123' }, valid: true },
  { label: 'UK 01 landline', input: { ...base, phone: '01632 960123' }, valid: true },
  { label: 'UK 03 number', input: { ...base, phone: '0306 999 0123' }, valid: true },
  { label: 'short UK mobile', input: { ...base, phone: '07700 90012' }, valid: false },
  { label: 'long UK mobile', input: { ...base, phone: '07700 9001234' }, valid: false },
  { label: 'invalid UK prefix', input: { ...base, phone: '+44 6700 900123' }, valid: false },
  { label: 'unprefixed number', input: { ...base, phone: '7700900123' }, valid: false },
  { label: 'empty optional fields', input: { ...base, phone: '', address: '' }, valid: true },
  { label: 'address control character', input: { ...base, address: 'Road\u0000Town' }, valid: false },
  { label: 'missing site', input: { ...base, siteCode: '' }, valid: false },
  { label: 'unrecognized field', input: { ...base, employeeCode: 'EMP-000001' }, valid: false },
];
for (const { label, input, valid } of cases) {
  assert.equal(createEmployeeSchema.safeParse(input).success, valid, `Backend: ${label}`);
  assert.equal(frontendCreate.safeParse(input).success, valid, `Frontend: ${label}`);
  const { siteCode, ...update } = input;
  if (label !== 'missing site') {
    assert.equal(updateEmployeeSchema.safeParse(update).success, valid, `Backend edit: ${label}`);
    assert.equal(frontendUpdate.safeParse(update).success, valid, `Frontend edit: ${label}`);
  }
}
for (const value of ['07700 900123', '+44 (7700) 900-123', '0044 7700 900123', '+44 (0)7700 900123', '0044 (0)7700 900123']) assert.equal(normalizeInternationalPhone(value), '+447700900123');
assert.equal(normalizeInternationalPhone('020 7946 0123'), '+442079460123');
assert.equal(normalizeInternationalPhone('+94 757 949 092'), '+94757949092');
assert.equal(normalizeInternationalPhone(''), null);
const normalized = createEmployeeSchema.parse({ ...base, fullName: '  Anne   Marie  ', email: '  WORKER@EXAMPLE.COM  ' });
assert.equal(normalized.fullName, 'Anne Marie');
assert.equal(normalized.email, 'worker@example.com');
assert.equal(updateEmployeeSchema.safeParse({ email: '' }).success, false);
assert.equal(updateEmployeeSchema.safeParse({}).success, false);
assert.equal(updateEmployeeSchema.safeParse({ isActive: false }).success, true);
const activeSites = [{ siteCode: 'TEST', isActive: true }];
assert.deepEqual(validateEmployeeForm({ ...base, isActive: true }, activeSites, false).errors, {});
assert.ok(validateEmployeeForm({ ...base, isActive: true }, [{ siteCode: 'TEST', isActive: false }], false).errors.siteCode);
assert.ok(validateEmployeeForm({ ...base, isActive: true }, [], false).errors.siteCode);
assert.equal(validateEmployeeForm({ ...base, isActive: true }, activeSites, false).data.phone, '+447700900123');
console.log('PASS: create/edit validation on both frontend and backend, word/character boundaries, Unicode names, email, phone, optional fields, active site checks, and normalization.');
