import { z } from 'zod';

export const countWords = (value: string) => value.trim().split(/\s+/u).filter(Boolean).length;
export function normalizeInternationalPhone(value: string | undefined): string | null {
  // Accept the optional trunk marker used in printed international UK numbers.
  const compact = (value || '').trim().replace(/^(\+44|0044)\s*\(0\)/, '$1').replace(/[\s().-]/g, '');
  if (!compact) return null;

  // International numbers must include a country code and contain 8–15 digits.
  const international = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  if (international.startsWith('+44')) return /^\+44(?:1\d{8,9}|[23789]\d{9})$/.test(international) ? international : null;
  if (/^\+[1-9]\d{7,14}$/.test(international)) return international;

  // Preserve support for the previously accepted UK local formats.
  const ukLocal = compact.startsWith('0') ? `+44${compact.slice(1)}` : compact;
  return /^\+44(?:1\d{8,9}|[23789]\d{9})$/.test(ukLocal) ? ukLocal : null;
}

const fullName = z.string().trim().transform(value => value.replace(/\s+/gu, ' ')).pipe(
  z.string().min(1, 'Employee name is required.').max(30, 'Employee name must be 30 characters or fewer.')
    .refine(value => /\p{L}/u.test(value) && /^[\p{L}\p{M}\u200c\u200d .\u0027\u2019-]+$/u.test(value), 'Use letters, spaces, apostrophes, periods, or hyphens for the employee name.'),
);
const email = z.string().trim().min(1, 'Email address is required.').max(191, 'Email address must be 191 characters or fewer.').email('Enter a valid email address.').transform(value => value.toLowerCase());
const phone = z.string().trim().max(50, 'Phone number must be 50 characters or fewer.')
  .refine(value => !value || normalizeInternationalPhone(value) !== null, 'Enter a valid phone number with country code, for example +94 757 949 092 or +44 7700 900123.').optional();
const address = z.string().trim().max(500, 'Address must be 500 characters or fewer.')
  .refine(value => countWords(value) <= 50, 'Address must be 50 words or fewer.')
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value), 'Remove unsupported control characters from the address.').optional();
export const createEmployeeSchema = z.object({
  fullName, email, phone, address,
  siteCode: z.string().trim().min(1, 'Choose a construction site.').max(100, 'Construction site code is too long.'),
}).strict();
export const updateEmployeeSchema = z.object({ fullName: fullName.optional(), email: email.optional(), phone, address, isActive: z.boolean().optional() })
  .strict().refine(value => Object.keys(value).length > 0, 'Provide at least one employee field to update.');
