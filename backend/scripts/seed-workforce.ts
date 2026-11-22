// Development/demo only: grows one organization to exactly 10,000 employees with departments,
// countries, and an active compensation package each. Deterministic and idempotent: existing
// people and packages are kept, and only missing roster entries are inserted.
//
//   COMPVISTA_DEV_SEED=YES npm run seed:workforce -- [--org compvista-demo]
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client.js';
import { calculateCompensation } from '../src/compensation-calculation.js';
import { defaultComponentCatalog } from './seed-plan.js';
import {
  cellKey, departmentCatalog, packageEffectiveFrom, profileForRole, rosterCodePattern, workforceComponents, workforcePlan, workforceTarget,
  type CountryCode, type DepartmentCode, type PlannedEmployee,
} from '../src/workforce-plan.js';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env' });
if (process.env.NODE_ENV === 'production') throw new Error('Refusing development seed in production mode');
if (process.env.COMPVISTA_DEV_SEED !== 'YES') throw new Error('Set COMPVISTA_DEV_SEED=YES to run the development seed');
if (!process.env.DATABASE_URL || !process.env.NEON_BRANCH) throw new Error('Neon DATABASE_URL and NEON_BRANCH are required');

const args = process.argv.slice(2);
const orgFlag = args.indexOf('--org');
const slug = orgFlag >= 0 ? args[orgFlag + 1] : 'compvista-demo';
if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error('Usage: npm run seed:workforce -- [--org <organization-slug>]');
const batchSize = 500;
const emailDomain = `${slug}.example`;

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main(): Promise<void> {
  const started = Date.now();
  const org = await prisma.organization.findUnique({ where: { slug } });
  if (!org) throw new Error(`Organization ${slug} not found. Run npm run seed:dev first.`);
  const admin = await prisma.member.findFirst({ where: { organizationId: org.id, role: 'admin' }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error(`${slug} has no admin to own generated packages`);

  // 1. Reference data: departments and component definitions (created only when missing).
  await prisma.department.createMany({ data: departmentCatalog.map((item) => ({ id: randomUUID(), organization_id: org.id, ...item })), skipDuplicates: true });
  const departments = new Map((await prisma.department.findMany({ where: { organization_id: org.id } })).map((item) => [item.code, item]));
  for (const item of departmentCatalog) if (!departments.get(item.code)?.is_active) throw new Error(`Department ${item.code} is missing or inactive in ${slug}`);
  const catalog = [...defaultComponentCatalog.map((item) => ({ ...item, default_frequency: 'MONTHLY' as const })), ...workforceComponents.map((item) => ({ ...item, is_basic: false }))];
  await prisma.compensation_component_definition.createMany({ data: catalog.map((item) => ({ id: randomUUID(), organization_id: org.id, ...item })), skipDuplicates: true });
  const definitions = await prisma.compensation_component_definition.findMany({ where: { organization_id: org.id } });
  const definitionByCode = new Map(definitions.map((item) => [item.code, item]));
  for (const item of catalog) if (!definitionByCode.get(item.code)?.is_active) throw new Error(`Component ${item.code} is missing or inactive in ${slug}`);
  const currencies = new Map((await prisma.currency.findMany()).map((item) => [item.code, item]));

  // 2. People seeded before the roster (login accounts): fill only blank profile fields.
  const existing = await prisma.employee.findMany({ where: { organizationId: org.id }, select: { id: true, userId: true, employeeCode: true, departmentId: true, countryCode: true, jobTitle: true, jobLevel: true, hireDate: true, createdAt: true, user: { select: { member: { select: { role: true } } } } }, orderBy: { createdAt: 'asc' } });
  const nonRoster = existing.filter((item) => !item.employeeCode || !rosterCodePattern.test(item.employeeCode));
  const usedCodes = new Set(existing.map((item) => item.employeeCode).filter(Boolean));
  let staffSequence = 0;
  const nextStaffCode = () => { let code; do code = `CV-S${String(++staffSequence).padStart(3, '0')}`; while (usedCodes.has(code)); usedCodes.add(code); return code; };
  let profilesBackfilled = 0;
  for (const person of nonRoster) {
    const role = (person.user?.member?.role ?? 'employee') as keyof typeof profileForRole;
    const profile = profileForRole[role] ?? profileForRole.employee;
    const data: Prisma.employeeUncheckedUpdateInput = {};
    if (!person.employeeCode) data.employeeCode = nextStaffCode();
    if (!person.departmentId) data.departmentId = departments.get(profile.department)!.id;
    if (!person.jobTitle) data.jobTitle = profile.jobTitle;
    if (!person.jobLevel) data.jobLevel = profile.level;
    if (!person.hireDate) data.hireDate = person.createdAt;
    if (Object.keys(data).length) { await prisma.employee.update({ where: { id: person.id }, data }); profilesBackfilled++; }
  }
  const departmentCode = new Map([...departments.values()].map((item) => [item.id, item.code as DepartmentCode]));
  const refreshed = await prisma.employee.findMany({ where: { id: { in: nonRoster.map((item) => item.id) } }, select: { departmentId: true, countryCode: true } });
  const occupied = new Map<string, number>();
  for (const person of refreshed) {
    const department = person.departmentId ? departmentCode.get(person.departmentId) : undefined;
    if (!department) continue;
    const key = cellKey({ country: person.countryCode as CountryCode, department });
    occupied.set(key, (occupied.get(key) ?? 0) + 1);
  }

  // 3. The roster: the same plan every run; insert only codes that do not exist yet.
  const plan = workforcePlan(occupied, emailDomain);
  const missing = plan.filter((person) => !usedCodes.has(person.code));
  let inserted = 0;
  for (let offset = 0; offset < missing.length; offset += batchSize) {
    await insertBatch(missing.slice(offset, offset + batchSize));
    inserted += Math.min(batchSize, missing.length - offset);
    process.stdout.write(`\rInserted ${inserted}/${missing.length} employees with packages`);
  }
  if (missing.length) process.stdout.write('\n');

  async function insertBatch(people: PlannedEmployee[]) {
    const employees: Prisma.employeeCreateManyInput[] = [];
    const packages: Prisma.employee_compensationCreateManyInput[] = [];
    const items: Prisma.employee_compensation_itemCreateManyInput[] = [];
    for (const person of people) {
      const currency = currencies.get(person.currency)!;
      const employeeId = randomUUID();
      const packageId = randomUUID();
      const result = calculateCompensation({
        currency: { code: currency.code, decimalPlaces: currency.decimal_places, isActive: currency.is_active },
        definitions: definitions.map((item) => ({ id: item.id, name: item.name, category: item.category, isBasic: item.is_basic, isActive: item.is_active })),
        items: person.rules.map((rule) => ({ componentDefinitionId: definitionByCode.get(rule.code)!.id, calculationType: rule.calculationType, fixedAmount: rule.fixedAmount, percentage: rule.percentage, frequency: rule.frequency })),
      });
      employees.push({ id: employeeId, organizationId: org!.id, displayName: person.displayName, email: person.email, employeeCode: person.code, departmentId: departments.get(person.department)!.id, countryCode: person.country, jobTitle: person.jobTitle, jobLevel: person.level, employmentStatus: person.employmentStatus, hireDate: new Date(`${person.hireDate}T00:00:00.000Z`) });
      packages.push({ id: packageId, organization_id: org!.id, employee_id: employeeId, currency_code: currency.code, status: 'DRAFT', effective_from: new Date(`${packageEffectiveFrom}T00:00:00.000Z`), created_by: admin!.userId, submitted_by: admin!.userId, submitted_at: new Date(`${packageEffectiveFrom}T00:00:00.000Z`), decided_by: admin!.userId, decided_at: new Date(`${packageEffectiveFrom}T00:00:00.000Z`) });
      for (const item of result.items) items.push({ id: randomUUID(), compensation_id: packageId, component_definition_id: item.componentDefinitionId, calculation_type: item.calculationType, fixed_amount: item.fixedAmount ?? null, percentage: item.percentage ?? null, resolved_monthly_amount: item.resolvedMonthlyAmount, frequency: item.frequency, resolved_amount: item.resolvedAmount, annual_amount: item.annualAmount });
    }
    // Packages are written as drafts (item triggers only accept draft packages), then applied together.
    await prisma.$transaction(async (tx) => {
      await tx.employee.createMany({ data: employees });
      await tx.employee_compensation.createMany({ data: packages });
      await tx.employee_compensation_item.createMany({ data: items });
      const applied = await tx.$executeRaw`UPDATE employee_compensation SET status = 'ACTIVE', updated_at = now() WHERE id = ANY(${packages.map((row) => row.id)}::uuid[])`;
      if (applied !== packages.length) throw new Error('Not every generated package could be applied');
    }, { timeout: 120_000, maxWait: 30_000 });
  }

  // 4. Validation report.
  const [summary] = await prisma.$queryRaw<{ employees: number; with_active: number; packages: number; items: number; missing_department: number; missing_package: number; foreign_department: number }[]>`
    SELECT
      (SELECT count(*) FROM employee WHERE "organizationId" = ${org.id})::int AS employees,
      (SELECT count(DISTINCT employee_id) FROM employee_compensation WHERE organization_id = ${org.id} AND status = 'ACTIVE')::int AS with_active,
      (SELECT count(*) FROM employee_compensation WHERE organization_id = ${org.id})::int AS packages,
      (SELECT count(*) FROM employee_compensation_item i JOIN employee_compensation c ON c.id = i.compensation_id WHERE c.organization_id = ${org.id})::int AS items,
      (SELECT count(*) FROM employee WHERE "organizationId" = ${org.id} AND "departmentId" IS NULL)::int AS missing_department,
      (SELECT count(*) FROM employee e WHERE e."organizationId" = ${org.id} AND NOT EXISTS (SELECT 1 FROM employee_compensation c WHERE c.employee_id = e.id AND c.status = 'ACTIVE'))::int AS missing_package,
      (SELECT count(*) FROM employee e JOIN department d ON d.id = e."departmentId" WHERE e."organizationId" = ${org.id} AND d.organization_id <> e."organizationId")::int AS foreign_department`;
  const byCountry = await prisma.$queryRaw<{ country: string; employees: number }[]>`SELECT "countryCode" AS country, count(*)::int AS employees FROM employee WHERE "organizationId" = ${org.id} GROUP BY 1 ORDER BY 2 DESC`;
  const byDepartment = await prisma.$queryRaw<{ department: string; employees: number }[]>`SELECT COALESCE(d.name, 'Unassigned') AS department, count(*)::int AS employees FROM employee e LEFT JOIN department d ON d.id = e."departmentId" WHERE e."organizationId" = ${org.id} GROUP BY 1 ORDER BY 2 DESC`;
  console.log(JSON.stringify({
    organization: slug, target: workforceTarget, employees: summary.employees, inserted, profilesBackfilled, rosterPlanned: plan.length,
    employeesWithActiveCompensation: summary.with_active, compensationPackages: summary.packages, compensationItems: summary.items,
    byCountry: Object.fromEntries(byCountry.map((row) => [row.country, row.employees])),
    byDepartment: Object.fromEntries(byDepartment.map((row) => [row.department, row.employees])),
    invalid: { missingDepartment: summary.missing_department, missingActivePackage: summary.missing_package, crossOrganizationDepartment: summary.foreign_department },
    durationSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
  }, null, 2));
  if (summary.employees !== workforceTarget) console.warn(`Warning: ${slug} has ${summary.employees} employees, not ${workforceTarget}. People added outside the seed are kept, never deleted.`);
  if (summary.missing_package || summary.foreign_department) throw new Error('Validation failed; see the report above');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
