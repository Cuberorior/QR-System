import { z } from 'zod';

export const countWords = (value) => value.trim().split(/\s+/u).filter(Boolean).length;
export function normalizeUKPhone(value) {
  // Accept the optional trunk marker used in printed international UK numbers.
  const compact = (value || '').trim().replace(/^(\+44|0044)\s*\(0\)/, '$1').replace(/[\s().-]/g, '');
  if (!compact) return null;
  const normalized = compact.startsWith('0044') ? `+44${compact.slice(4)}` : compact.startsWith('0') ? `+44${compact.slice(1)}` : compact;
  return /^\+44(?:1\d{8,9}|[23789]\d{9})$/.test(normalized) ? normalized : null;
}

const fullName = z.string().trim().transform(value => value.replace(/\s+/gu, ' ')).pipe(
  z.string().min(1, 'Employee name is required.').max(30, 'Employee name must be 30 characters or fewer.')
    .refine(value => /\p{L}/u.test(value) && /^[\p{L}\p{M}\u200c\u200d .\u0027\u2019-]+$/u.test(value), 'Use letters, spaces, apostrophes, periods, or hyphens for the employee name.'),
);
const email = z.string().trim().min(1, 'Email address is required.').max(191, 'Email address must be 191 characters or fewer.').email('Enter a valid email address.').transform(value => value.toLowerCase());
const phone = z.string().trim().max(50, 'Phone number must be 50 characters or fewer.')
  .refine(value => !value || normalizeUKPhone(value) !== null, 'Enter a valid UK phone number, for example 07700 900123 or +44 7700 900123.').optional();
const address = z.string().trim().max(500, 'Address must be 500 characters or fewer.')
  .refine(value => countWords(value) <= 50, 'Address must be 50 words or fewer.')
  .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value), 'Remove unsupported control characters from the address.').optional();

export const createEmployeeSchema = z.object({
  fullName, email, phone, address,
  siteCode: z.string().trim().min(1, 'Choose a construction site.').max(100, 'Construction site code is too long.'),
}).strict();
export const updateEmployeeSchema = z.object({ fullName: fullName.optional(), email: email.optional(), phone, address, isActive: z.boolean().optional() })
  .strict().refine(value => Object.keys(value).length > 0, 'Provide at least one employee field to update.');

export function validateEmployeeForm(form, sites, editing) {
  const { isActive, ...fields } = form;
  const result = createEmployeeSchema.safeParse(fields);
  const errors = {};
  if (!result.success) for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field && !errors[field]) errors[field] = issue.message;
  }
  if (!editing && form.siteCode && !sites.some(site => site.siteCode === form.siteCode && site.isActive)) {
    errors.siteCode = 'Choose an active construction site.';
  }
  return { errors, data: result.success ? { ...result.data, phone: normalizeUKPhone(result.data.phone) || '' } : null };
}
