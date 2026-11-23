import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { Prisma, type PrismaClient } from './generated/prisma/client.js';
import { calculateCompensation } from './compensation-calculation.js';
import { toCsv } from './csv.js';
import {
  defaultComponentCatalog, defaultPermissions, departmentCatalog, packageEffectiveFrom, workforceComponents, workforcePlan,
  type PlannedEmployee,
} from './workforce-plan.js';

// Creates a complete organization in one go: roles and permissions, departments, the component
// catalog, and one login per person (admins, HR, employees), each with an employee profile and an
// active package. Every account gets a random temporary password and must change it at first
// login, then verify their email; that is the normal CompVista sign-in flow.

export const minimumPeople = 100;
export const maximumPeople = 20_000;
export type Role = 'admin' | 'hr' | 'employee';
export type ProvisionInput = { name: string; slug: string; admins: number; hrs: number; employees: number; emailDomain: string; adminEmail: string | null; adminName: string | null };
export type Credential = { name: string; email: string; role: Role; password: string; employeeCode: string; department: string; country: string; jobTitle: string };
export type Progress = { phase: 'setup' | 'accounts' | 'verifying' | 'done'; done: number; total: number };

export class ProvisioningError extends Error {}
const fail = (message: string): never => { throw new ProvisioningError(message); };
const count = (value: unknown, label: string) => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 0) fail(`${label} must be a whole number`);
  return number as number;
};
export const slugify = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export function parseProvisionInput(body: unknown): ProvisionInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 80) fail('Organization name must be 2–80 characters');
  const slug = typeof raw.slug === 'string' && raw.slug.trim() ? raw.slug.trim().toLowerCase() : slugify(name);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(slug)) fail('Slug may use lowercase letters, numbers, and hyphens (up to 40)');
  const admins = count(raw.admins, 'Admins');
  const hrs = count(raw.hrs, 'HR');
  const employees = count(raw.employees, 'Employees');
  if (admins < 1) fail('At least one admin is required');
  const total = admins + hrs + employees;
  if (total < minimumPeople || total > maximumPeople) fail(`Total people must be between ${minimumPeople.toLocaleString('en-US')} and ${maximumPeople.toLocaleString('en-US')} (currently ${total.toLocaleString('en-US')})`);
  const emailDomain = typeof raw.emailDomain === 'string' && raw.emailDomain.trim() ? raw.emailDomain.trim().toLowerCase() : 'yopmail.com';
  if (!/^(?=.{3,100}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(emailDomain)) fail('Email domain is not valid');
  const adminEmail = typeof raw.adminEmail === 'string' && raw.adminEmail.trim() ? raw.adminEmail.trim().toLowerCase() : null;
  if (adminEmail && !/^[^@\s]{1,64}@[^@\s]+\.[^@\s]+$/.test(adminEmail)) fail('First admin email is not valid');
  const adminName = typeof raw.adminName === 'string' && raw.adminName.trim() ? raw.adminName.trim().slice(0, 80) : null;
  return { name, slug, admins, hrs, employees, emailDomain, adminEmail, adminName };
}

/** Random temporary password that satisfies the password policy (upper, lower, digit, symbol, ≥ 10). */
export function temporaryPassword(): string {
  const body = randomBytes(12).toString('base64url').replace(/[-_]/g, '');
  const pick = (set: string) => set[randomInt(set.length)];
  return `${pick('ABCDEFGHJKLMNPQRSTUVWXYZ')}${pick('abcdefghijkmnpqrstuvwxyz')}${pick('23456789')}${pick('!@#$%*?')}${body}`;
}

/**
 * Roles go to the most senior people, Human Resources first, so admins and HR look like the
 * people team. Admins and HR move into Human Resources with a matching title.
 */
export function assignRoles(plan: PlannedEmployee[], admins: number, hrs: number): { person: PlannedEmployee; role: Role }[] {
  const seniority = { DIRECTOR: 6, MANAGER: 5, LEAD: 4, SENIOR: 3, MID: 2, JUNIOR: 1 } as const;
  const order = plan.map((person, index) => ({ person, index }))
    .sort((a, b) => Number(b.person.department === 'HUMAN_RESOURCES') - Number(a.person.department === 'HUMAN_RESOURCES') || seniority[b.person.level] - seniority[a.person.level] || a.index - b.index);
  const roles = new Map<number, Role>();
  order.slice(0, admins).forEach(({ index }) => roles.set(index, 'admin'));
  order.slice(admins, admins + hrs).forEach(({ index }) => roles.set(index, 'hr'));
  return plan.map((person, index) => {
    const role = roles.get(index) ?? 'employee';
    if (role === 'employee') return { person, role };
    return { role, person: { ...person, department: 'HUMAN_RESOURCES', jobTitle: role === 'admin' ? (person.level === 'DIRECTOR' ? 'Director of People' : 'Compensation Administrator') : (person.level === 'DIRECTOR' || person.level === 'MANAGER' ? 'HR Manager' : 'HR Business Partner') } };
  });
}

export async function provisionOrganization(prisma: PrismaClient, input: ProvisionInput, onProgress: (progress: Progress) => void = () => undefined): Promise<{ organizationId: string; slug: string; credentials: Credential[] }> {
  const total = input.admins + input.hrs + input.employees;
  onProgress({ phase: 'setup', done: 0, total });
  if (await prisma.organization.findUnique({ where: { slug: input.slug } })) fail(`An organization with the slug "${input.slug}" already exists`);

  const emailPrefix = input.slug.replace(/-/g, '').slice(0, 16);
  // Admins first: the first admin owns every package, so they are written in the first batch.
  const rank = { admin: 0, hr: 1, employee: 2 } as const;
  const people = assignRoles(workforcePlan(new Map(), input.emailDomain, { total, emailPrefix }), input.admins, input.hrs)
    .map((entry, index) => ({ ...entry, index })).sort((a, b) => rank[a.role] - rank[b.role] || a.index - b.index);
  if (input.adminEmail) {
    const first = people.find((entry) => entry.role === 'admin')!;
    first.person = { ...first.person, email: input.adminEmail, displayName: input.adminName ?? first.person.displayName };
  }
  const emails = people.map((entry) => entry.person.email);
  for (let offset = 0; offset < emails.length; offset += 5000) {
    const taken = await prisma.user.findFirst({ where: { email: { in: emails.slice(offset, offset + 5000) } }, select: { email: true } });
    if (taken) fail(`${taken.email} already has a CompVista login. Use another email domain or organization slug.`);
  }

  // Organization, roles with permissions, departments, and components.
  const organizationId = randomUUID();
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.organization.create({ data: { id: organizationId, name: input.name, slug: input.slug, createdAt: now } });
    for (const key of ['admin', 'hr', 'employee'] as const) {
      await tx.organization_role.create({ data: { id: randomUUID(), organizationId, key, displayName: key === 'hr' ? 'HR' : key[0].toUpperCase() + key.slice(1), organization_role_permissions: { create: { ...defaultPermissions[key] } } } });
    }
    await tx.department.createMany({ data: departmentCatalog.map((item) => ({ id: randomUUID(), organization_id: organizationId, ...item })) });
    await tx.compensation_component_definition.createMany({ data: [
      ...defaultComponentCatalog.map((item) => ({ id: randomUUID(), organization_id: organizationId, ...item, default_frequency: 'MONTHLY' as const })),
      ...workforceComponents.map((item) => ({ id: randomUUID(), organization_id: organizationId, ...item, is_basic: false })),
    ] });
  });

  try {
    const departments = new Map((await prisma.department.findMany({ where: { organization_id: organizationId } })).map((item) => [item.code, item]));
    const definitions = await prisma.compensation_component_definition.findMany({ where: { organization_id: organizationId } });
    const definitionByCode = new Map(definitions.map((item) => [item.code, item]));
    const currencies = new Map((await prisma.currency.findMany()).map((item) => [item.code, item]));
    const calculatorDefinitions = definitions.map((item) => ({ id: item.id, name: item.name, category: item.category, isBasic: item.is_basic, isActive: item.is_active }));
    const effectiveFrom = new Date(`${packageEffectiveFrom}T00:00:00.000Z`);
    const credentials: Credential[] = [];
    // The first admin owns every generated package (created, submitted, and applied by them).
    const userIds = people.map(() => randomUUID());
    const owner = userIds[0];

    const batchSize = 400;
    for (let offset = 0; offset < people.length; offset += batchSize) {
      const batch = people.slice(offset, offset + batchSize);
      const passwords = batch.map(() => temporaryPassword());
      const hashes = await Promise.all(passwords.map((password) => hashPassword(password)));
      const users: Prisma.userCreateManyInput[] = [];
      const accounts: Prisma.accountCreateManyInput[] = [];
      const members: Prisma.memberCreateManyInput[] = [];
      const employees: Prisma.employeeCreateManyInput[] = [];
      const packages: Prisma.employee_compensationCreateManyInput[] = [];
      const items: Prisma.employee_compensation_itemCreateManyInput[] = [];
      batch.forEach(({ person, role }, index) => {
        const userId = userIds[offset + index];
        const employeeId = randomUUID();
        const packageId = randomUUID();
        users.push({ id: userId, name: person.displayName, email: person.email, emailVerified: false, mustChangePassword: true, createdAt: now, updatedAt: now });
        accounts.push({ id: randomUUID(), accountId: userId, providerId: 'credential', userId, password: hashes[index], createdAt: now, updatedAt: now });
        members.push({ id: randomUUID(), organizationId, userId, role, createdAt: now });
        employees.push({ id: employeeId, userId, organizationId, displayName: person.displayName, email: person.email, employeeCode: person.code, departmentId: departments.get(person.department)!.id, countryCode: person.country, jobTitle: person.jobTitle, jobLevel: person.level, employmentStatus: person.employmentStatus, hireDate: new Date(`${person.hireDate}T00:00:00.000Z`) });
        const currency = currencies.get(person.currency)!;
        const result = calculateCompensation({
          currency: { code: currency.code, decimalPlaces: currency.decimal_places, isActive: currency.is_active },
          definitions: calculatorDefinitions,
          items: person.rules.map((rule) => ({ componentDefinitionId: definitionByCode.get(rule.code)!.id, calculationType: rule.calculationType, fixedAmount: rule.fixedAmount, percentage: rule.percentage, frequency: rule.frequency })),
        });
        packages.push({ id: packageId, organization_id: organizationId, employee_id: employeeId, currency_code: currency.code, status: 'DRAFT', effective_from: effectiveFrom, created_by: owner, submitted_by: owner, submitted_at: effectiveFrom, decided_by: owner, decided_at: effectiveFrom });
        for (const item of result.items) items.push({ id: randomUUID(), compensation_id: packageId, component_definition_id: item.componentDefinitionId, calculation_type: item.calculationType, fixed_amount: item.fixedAmount ?? null, percentage: item.percentage ?? null, resolved_monthly_amount: item.resolvedMonthlyAmount, frequency: item.frequency, resolved_amount: item.resolvedAmount, annual_amount: item.annualAmount });
        credentials.push({ name: person.displayName, email: person.email, role, password: passwords[index], employeeCode: person.code, department: departments.get(person.department)!.name, country: person.country, jobTitle: person.jobTitle });
      });
      // The package owner must exist before any package references it, so the first batch writes users first.
      await prisma.$transaction(async (tx) => {
        await tx.user.createMany({ data: users });
        await tx.account.createMany({ data: accounts });
        await tx.member.createMany({ data: members });
        await tx.employee.createMany({ data: employees });
        await tx.employee_compensation.createMany({ data: packages });
        await tx.employee_compensation_item.createMany({ data: items });
        const applied = await tx.$executeRaw`UPDATE employee_compensation SET status = 'ACTIVE', updated_at = now() WHERE id = ANY(${packages.map((row) => row.id)}::uuid[])`;
        if (applied !== packages.length) throw new ProvisioningError('Not every package could be applied');
      }, { timeout: 120_000, maxWait: 30_000 });
      onProgress({ phase: 'accounts', done: Math.min(offset + batchSize, people.length), total });
    }

    onProgress({ phase: 'verifying', done: total, total });
    const [check] = await prisma.$queryRaw<{ members: number; employees: number; active: number }[]>`
      SELECT (SELECT count(*) FROM member WHERE "organizationId" = ${organizationId})::int AS members,
        (SELECT count(*) FROM employee WHERE "organizationId" = ${organizationId} AND "userId" IS NOT NULL)::int AS employees,
        (SELECT count(*) FROM employee_compensation WHERE organization_id = ${organizationId} AND status = 'ACTIVE')::int AS active`;
    if (check.members !== total || check.employees !== total || check.active !== total) throw new ProvisioningError(`Verification failed: ${JSON.stringify(check)}`);
    onProgress({ phase: 'done', done: total, total });
    return { organizationId, slug: input.slug, credentials };
  } catch (error) {
    // Leave nothing half-built: remove the organization and every account it created.
    await removeOrganization(prisma, organizationId).catch(() => undefined);
    throw error;
  }
}

/** Deletes an organization with all its people and logins. Applied packages are immutable by trigger, so this truncates around them. */
async function removeOrganization(prisma: PrismaClient, organizationId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`ALTER TABLE employee_compensation DISABLE TRIGGER compensation_package_update_delete`;
    await tx.$executeRaw`DELETE FROM employee_compensation_item WHERE compensation_id IN (SELECT id FROM employee_compensation WHERE organization_id = ${organizationId})`;
    await tx.$executeRaw`DELETE FROM employee_compensation WHERE organization_id = ${organizationId}`;
    await tx.$executeRaw`ALTER TABLE employee_compensation ENABLE TRIGGER compensation_package_update_delete`;
    await tx.$executeRaw`DELETE FROM "user" WHERE id IN (SELECT "userId" FROM member WHERE "organizationId" = ${organizationId})`;
    await tx.$executeRaw`DELETE FROM employee WHERE "organizationId" = ${organizationId}`;
    await tx.$executeRaw`ALTER TABLE compensation_component_definition DISABLE TRIGGER compensation_definition_delete`;
    await tx.$executeRaw`DELETE FROM compensation_component_definition WHERE organization_id = ${organizationId}`;
    await tx.$executeRaw`ALTER TABLE compensation_component_definition ENABLE TRIGGER compensation_definition_delete`;
    await tx.$executeRaw`DELETE FROM organization WHERE id = ${organizationId}`;
  }, { timeout: 120_000 });
}


/** CSV of first-login credentials. Cells that look like formulas are neutralized for spreadsheets. */
export function credentialsCsv(credentials: Credential[], loginUrl: string): string {
  const header = ['name', 'email', 'role', 'temporary_password', 'employee_code', 'department', 'country', 'job_title', 'login_url'];
  const rows = credentials.map((row) => [row.name, row.email, row.role, row.password, row.employeeCode, row.department, row.country, row.jobTitle, loginUrl]);
  return toCsv(header, rows);
}
