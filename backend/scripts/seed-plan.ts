import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type SeedRole = 'admin' | 'hr' | 'employee';
export const defaultPermissions = {
  admin: { canViewAllComp: true, canViewOwnComp: true, canProposeOthersComp: true, canProposeOwnComp: true, canApproveComp: true, canApproveOwnComp: true, requiresApproval: false },
  hr: { canViewAllComp: true, canViewOwnComp: true, canProposeOthersComp: true, canProposeOwnComp: false, canApproveComp: false, canApproveOwnComp: false, requiresApproval: true },
  employee: { canViewAllComp: false, canViewOwnComp: true, canProposeOthersComp: false, canProposeOwnComp: false, canApproveComp: false, canApproveOwnComp: false, requiresApproval: true },
} as const;
export type PermissionFlags = { [K in keyof typeof defaultPermissions.admin]: boolean };
export type PlannedPerson = { email: string; name: string; role: SeedRole; generated: boolean };
export type SeedPlan = { organization: { name: string; slug: string }; people: PlannedPerson[]; roles: Partial<Record<SeedRole, { displayName?: string; permissions?: Partial<PermissionFlags> }>> };

type RawPlan = {
  organization?: { name?: unknown; slug?: unknown };
  users?: { email?: unknown; name?: unknown; role?: unknown }[];
  generatedEmployees?: { count?: unknown; emailPrefix?: unknown; namesFile?: unknown; names?: { first_names?: unknown; last_names?: unknown } };
  roles?: Record<string, { displayName?: unknown; permissions?: Record<string, unknown> }>;
};

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a nonempty string`);
  return value.trim();
}

function choice(seed: string, length: number): number {
  const bytes = createHash('sha256').update(seed).digest();
  return bytes.readUInt32BE(0) % length;
}

export function parseSeedPlan(value: unknown): SeedPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Seed input must be a JSON object');
  const raw = value as RawPlan;
  const name = requiredText(raw.organization?.name, 'organization.name');
  const slug = raw.organization?.slug === undefined
    ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    : requiredText(raw.organization.slug, 'organization.slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('organization.slug must use lowercase letters, numbers, and hyphens');
  if (!Array.isArray(raw.users)) throw new Error('users must be an array');
  const people: PlannedPerson[] = raw.users.map((user, index) => {
    const role = user.role;
    if (role !== 'admin' && role !== 'hr' && role !== 'employee') throw new Error(`users[${index}].role must be admin, hr, or employee`);
    const email = requiredText(user.email, `users[${index}].email`).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid email for users[${index}]`);
    return { email, name: requiredText(user.name, `users[${index}].name`), role, generated: false };
  });
  if (people.filter((person) => person.role === 'admin').length !== 1) throw new Error('Exactly one explicit admin is required');

  const generated = raw.generatedEmployees;
  if (generated) {
    const count = generated.count;
    if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > 10000) {
      throw new Error('generatedEmployees.count must be an integer from 0 to 10000');
    }
    const prefix = generated.emailPrefix === undefined ? `${slug}.employee` : requiredText(generated.emailPrefix, 'generatedEmployees.emailPrefix');
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(prefix)) throw new Error('generatedEmployees.emailPrefix must be a lowercase email alias prefix');
    const names = generated.names ?? JSON.parse(readFileSync(resolve(requiredText(generated.namesFile, 'generatedEmployees.namesFile')), 'utf8')) as { first_names?: unknown; last_names?: unknown };
    const first = names.first_names;
    const last = names.last_names;
    if (!Array.isArray(first) || !first.length || !first.every((item) => typeof item === 'string' && item.trim())) throw new Error('namesFile.first_names must contain names');
    if (!Array.isArray(last) || !last.length || !last.every((item) => typeof item === 'string' && item.trim())) throw new Error('namesFile.last_names must contain names');
    for (let n = 1; n <= (count as number); n++) {
      people.push({
        email: `${prefix}${n}@yopmail.com`,
        name: `${first[choice(`${slug}:first:${n}`, first.length)]} ${last[choice(`${slug}:last:${n}`, last.length)]}`,
        role: 'employee',
        generated: true,
      });
    }
  }
  if (new Set(people.map((person) => person.email)).size !== people.length) throw new Error('Input creates duplicate email addresses');
  const roles: SeedPlan['roles'] = {};
  for (const [key, value] of Object.entries(raw.roles ?? {})) {
    if (key !== 'admin' && key !== 'hr' && key !== 'employee') throw new Error(`Unknown role: ${key}`);
    if (!value || typeof value !== 'object') throw new Error(`roles.${key} must be an object`);
    const role: { displayName?: string; permissions?: Partial<PermissionFlags> } = {};
    if (value.displayName !== undefined) role.displayName = requiredText(value.displayName, `roles.${key}.displayName`);
    if (value.permissions !== undefined) {
      if (!value.permissions || typeof value.permissions !== 'object' || Array.isArray(value.permissions)) throw new Error(`roles.${key}.permissions must be an object`);
      const flags: Partial<PermissionFlags> = {};
      for (const [flag, enabled] of Object.entries(value.permissions)) {
        if (!(flag in defaultPermissions.admin) || typeof enabled !== 'boolean') throw new Error(`Invalid boolean permission roles.${key}.permissions.${flag}`);
        (flags as Record<string, boolean>)[flag] = enabled;
      }
      if (key === 'employee' && (flags.canViewOwnComp === false || Object.entries(flags).some(([flag, enabled]) => enabled && flag !== 'canViewOwnComp' && flag !== 'requiresApproval'))) {
        throw new Error('roles.employee may only view its own compensation');
      }
      role.permissions = flags;
    }
    roles[key] = role;
  }
  return { organization: { name, slug }, people, roles };
}

export function loadSeedPlan(file: string): SeedPlan {
  return parseSeedPlan(JSON.parse(readFileSync(resolve(file), 'utf8')) as unknown);
}

export const defaultComponentCatalog = [
  { code: 'BASIC', name: 'Basic Salary', category: 'EARNING', is_basic: true },
  { code: 'HRA', name: 'House Rent Allowance', category: 'EARNING', is_basic: false },
  { code: 'SPECIAL', name: 'Special Allowance', category: 'EARNING', is_basic: false },
  { code: 'EMPLOYER_PF', name: 'Employer PF', category: 'EMPLOYER_CONTRIBUTION', is_basic: false },
  { code: 'EMPLOYEE_PF', name: 'Employee PF', category: 'EMPLOYEE_DEDUCTION', is_basic: false },
] as const;
export type CatalogCode = typeof defaultComponentCatalog[number]['code'];
export type PlannedRule = { code: CatalogCode; calculationType: 'FIXED' | 'PERCENTAGE_OF_BASE'; fixedAmount: string | null; percentage: string | null };

// Monthly Basic Salary bands in INR; each person gets a stable value inside their role's band.
const basicBands: Record<SeedRole, { min: number; max: number }> = {
  admin: { min: 150000, max: 200000 },
  hr: { min: 60000, max: 90000 },
  employee: { min: 25000, max: 70000 },
};
export const seedCompensationCurrency = 'INR';
export const seedCompensationEffectiveFrom = '2026-04-01';

export function plannedCompensation(slug: string, person: Pick<PlannedPerson, 'email' | 'role'>): PlannedRule[] {
  const band = basicBands[person.role];
  const steps = (band.max - band.min) / 500;
  const basic = band.min + choice(`${slug}:basic:${person.email}`, steps + 1) * 500;
  const special = Math.round(basic * (0.2 + choice(`${slug}:special:${person.email}`, 21) / 100) / 100) * 100;
  return [
    { code: 'BASIC', calculationType: 'FIXED', fixedAmount: basic.toFixed(2), percentage: null },
    { code: 'HRA', calculationType: 'PERCENTAGE_OF_BASE', fixedAmount: null, percentage: '40' },
    { code: 'SPECIAL', calculationType: 'FIXED', fixedAmount: special.toFixed(2), percentage: null },
    { code: 'EMPLOYER_PF', calculationType: 'PERCENTAGE_OF_BASE', fixedAmount: null, percentage: '12' },
    { code: 'EMPLOYEE_PF', calculationType: 'PERCENTAGE_OF_BASE', fixedAmount: null, percentage: '12' },
  ];
}
