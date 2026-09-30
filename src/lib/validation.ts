import { z } from 'zod';
import { ISSUE_TYPES } from '@/db/schema';
import { ISSUE_FIELDS } from './case-fields';
import { isSupplyTeam } from './permissions';
import { SEVERITIES, UNITS } from './constants';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters` })
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** Empty input -> null; otherwise a non-negative number. Never turns "missing" into 0. */
const optionalQuantity = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
    const n = typeof v === 'number' ? v : Number(v.replace(/,/g, '').trim());
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: 'custom', message: 'Enter a number (0 or more)' });
      return z.NEVER;
    }
    if (n > 10_000_000) {
      ctx.addIssue({ code: 'custom', message: 'That quantity looks too large' });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable());

const personName = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(z.string().min(2, { error: 'Enter the full name' }).max(100, { error: 'Name is too long' }));

const teamName = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ' '))
  .pipe(z.string().min(2, { error: 'Enter a team' }).max(100, { error: 'Team name is too long' }));

/** Login names: lowercase letters, digits, dot, dash, underscore. Stored lowercase. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(3, { error: 'Username must be at least 3 characters' })
      .max(32, { error: 'Username must be at most 32 characters' })
      .regex(/^[a-z0-9][a-z0-9._-]*$/, { error: 'Use letters, numbers, dot, dash or underscore' }),
  );

export const PASSWORD_MIN = 8;
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, { error: `Use at least ${PASSWORD_MIN} characters` })
  .max(128, { error: 'Password is too long' })
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), { error: 'Use at least one letter and one number' });

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, { error: 'Enter your username' }).max(50),
  password: z.string().min(1, { error: 'Enter your password' }).max(128),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: 'Enter your current password' }).max(128),
    newPassword: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ['confirmPassword'], error: 'Passwords do not match' })
  .refine((d) => d.newPassword !== d.currentPassword, { path: ['newPassword'], error: 'Choose a password different from the current one' });

/** Self-registration. Supply-team powers are never self-granted: an admin assigns that team. */
export const signupSchema = z
  .object({
    name: personName,
    username: usernameSchema,
    team: teamName.refine((t) => !isSupplyTeam(t), {
      error: 'Supply team access is given by an admin. Pick your current team (e.g. Sales); an admin can move you later.',
    }),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ['confirmPassword'], error: 'Passwords do not match' });

const ROLES = ['SALES', 'MANAGER', 'ADMIN'] as const;

export const adminCreateUserSchema = z.object({
  name: personName,
  username: usernameSchema,
  team: teamName,
  role: z.enum(ROLES, { error: 'Choose a role' }),
});

export const adminUpdateUserSchema = z.object({
  userId: z.uuid(),
  name: personName,
  username: usernameSchema,
  team: teamName,
  role: z.enum(ROLES, { error: 'Choose a role' }),
  active: z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean()),
});

export const newCaseSchema = z
  .object({
    tileId: emptyToNull(z.uuid({ error: 'Pick a tile from the list' })),
    noTile: z.preprocess((v) => v === true || v === 'on' || v === 'true', z.boolean()),
    requestedTileName: optionalText(200),
    issueType: z.enum(ISSUE_TYPES, { error: 'Choose the problem' }),
    description: z
      .string({ error: 'Describe the customer requirement' })
      .trim()
      .min(5, { error: 'Add a few words about the customer requirement' })
      .max(4000, { error: 'Keep the description under 4000 characters' }),
    requestedColor: optionalText(150),
    requestedSize: optionalText(100),
    requestedFinish: optionalText(150),
    requiredQuantity: optionalQuantity,
    availableQuantity: optionalQuantity,
    unit: emptyToNull(z.enum(UNITS, { error: 'Choose a unit' })),
    alternativeTileText: optionalText(300),
    alternativeAccepted: emptyToNull(z.enum(['yes', 'no'])),
    severity: emptyToNull(z.enum(SEVERITIES, { error: 'Choose a severity' })),
    notes: optionalText(2000),
  })
  .superRefine((d, ctx) => {
    if (!d.tileId && !d.noTile) {
      ctx.addIssue({
        code: 'custom',
        path: ['tileId'],
        message: 'Select a tile, or choose "Tile not found / I don\'t know the tile number"',
      });
    }
    const cfg = ISSUE_FIELDS[d.issueType];
    const labels: Record<string, string> = {
      requiredQuantity: 'Enter the required quantity',
      availableQuantity: 'Enter the available quantity (0 if none)',
      unit: 'Choose a unit',
      requestedColor: 'Enter the colour the customer wants',
      requestedSize: 'Enter the size the customer wants',
      requestedFinish: 'Enter the finish the customer wants',
    };
    for (const f of cfg.required) {
      if (d[f] === null || d[f] === undefined) ctx.addIssue({ code: 'custom', path: [f], message: labels[f] });
    }
    if ((d.requiredQuantity !== null || d.availableQuantity !== null) && !d.unit && !cfg.required.includes('unit')) {
      ctx.addIssue({ code: 'custom', path: ['unit'], message: 'Choose a unit for the quantities' });
    }
  })
  .transform((d) => ({
    ...d,
    // A selected tile wins over the "not found" toggle.
    tileId: d.tileId,
    requestedTileName: d.tileId ? null : d.requestedTileName,
    alternativeAccepted: d.alternativeAccepted === null ? null : d.alternativeAccepted === 'yes',
  }));
export type NewCaseInput = z.infer<typeof newCaseSchema>;

export type FieldErrors = Partial<Record<string, string[]>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}

export const listCasesQuerySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED']).optional().catch(undefined),
  scope: z.enum(['mine', 'all']).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).optional().catch(undefined),
});
