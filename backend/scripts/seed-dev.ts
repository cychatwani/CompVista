import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { calculateCompensation } from '../src/compensation-calculation.js';
import { defaultComponentCatalog, defaultPermissions, loadSeedPlan, plannedCompensation, seedCompensationCurrency, seedCompensationEffectiveFrom, type PlannedPerson } from './seed-plan.js';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env' });
if (process.env.NODE_ENV === 'production') throw new Error('Refusing development seed in production mode');
if (process.env.COMPVISTA_DEV_SEED !== 'YES') throw new Error('Set COMPVISTA_DEV_SEED=YES to run the development seed');
if (!process.env.DATABASE_URL || !process.env.NEON_BRANCH) throw new Error('Neon DATABASE_URL and NEON_BRANCH are required');
process.env.COMPVISTA_SEED = '1';

const args = process.argv.slice(2);
const resetPasswords = args.includes('--reset-passwords');
const inputArgs = args.filter((arg) => arg !== '--reset-passwords');
if (inputArgs.length && (inputArgs.length !== 2 || inputArgs[0] !== '--input')) throw new Error('Usage: npm run seed:dev -- [--input seed/plan.json] [--reset-passwords]');
const plan = loadSeedPlan(inputArgs[1] ?? 'seed/demo.json');
const people = plan.people;
const credentialPath = resolve('seed/generated', plan.organization.slug, 'credentials.json');
const legacyCredentialPath = resolve('.local/dev-seed-credentials.json');

function restrictFile(path: string, created: boolean): void {
  if (process.platform !== 'win32') return;
  const script = created
    ? '$p=$env:COMPVISTA_CREDENTIAL_PATH; $a=Get-Acl -LiteralPath $p; $a.SetAccessRuleProtection($true,$false); foreach($r in @($a.Access)){$a.RemoveAccessRule($r)|Out-Null}; $id=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($id,"FullControl","Allow"); $a.AddAccessRule($rule); Set-Acl -LiteralPath $p -AclObject $a'
    : '$a=Get-Acl -LiteralPath $env:COMPVISTA_CREDENTIAL_PATH; $id=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $rules=@($a.Access); if(-not $a.AreAccessRulesProtected -or $rules.Count -ne 1 -or $rules[0].IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $id -or $rules[0].AccessControlType -ne "Allow"){exit 1}';
  const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, COMPVISTA_CREDENTIAL_PATH: path }, encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error('Local credential file ACL is not restricted to the current user; no database changes were made');
}

function credentials(targets: PlannedPerson[]): Record<string, string> {
  mkdirSync(resolve('seed/generated', plan.organization.slug), { recursive: true, mode: 0o700 });
  let values: Record<string, string>;
  let created = false;
  try {
    values = JSON.parse(readFileSync(credentialPath, 'utf8')) as Record<string, string>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    let legacy: Record<string, string> = {};
    try { legacy = JSON.parse(readFileSync(legacyCredentialPath, 'utf8')) as Record<string, string>; }
    catch (legacyError) { if ((legacyError as NodeJS.ErrnoException).code !== 'ENOENT') throw legacyError; }
    values = Object.fromEntries(targets.map((person) => [person.email, legacy[person.email] ?? randomBytes(24).toString('base64url')]));
    writeFileSync(credentialPath, JSON.stringify(values, null, 2), { flag: 'wx', mode: 0o600 });
    created = true;
  }
  restrictFile(credentialPath, created);
  let extended = false;
  for (const person of targets) {
    if (!values[person.email]) {
      values[person.email] = randomBytes(24).toString('base64url');
      extended = true;
    }
  }
  if (extended) writeFileSync(credentialPath, JSON.stringify(values, null, 2));
  for (const person of targets) {
    if (!values[person.email] || values[person.email].length < 24) throw new Error(`Missing stored credential for ${person.email}`);
  }
  return values;
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const counts = { organizationsCreated: 0, organizationsSkipped: 0, rolesCreated: 0, rolesSkipped: 0, permissionsUpdated: 0, usersCreated: 0, usersSkipped: 0, membershipsCreated: 0, membershipsSkipped: 0, profilesCreated: 0, profilesSkipped: 0, namesUpdated: 0, passwordsReset: 0, componentsCreated: 0, compensationCreated: 0, compensationSkipped: 0 };

async function main(): Promise<void> {
  const passwords = credentials(people);
  const { auth } = await import('../src/auth.js');
  try {
    const orgs = await prisma.organization.findMany({ where: { slug: plan.organization.slug } });
    if (orgs.length > 1) throw new Error('Duplicate demo organizations found');
    let org = orgs[0];
    if (org && org.name !== plan.organization.name) throw new Error('Organization slug belongs to a different name');
    const currentMembers = org ? await prisma.member.findMany({ where: { organizationId: org.id }, include: { user: true } }) : [];
    const intended = new Set(people.map((person) => person.email));
    if (currentMembers.some((member) => !intended.has(member.user.email))) throw new Error('Organization has a member outside the seed plan');
    for (const person of people) {
      const existing = await prisma.user.findUnique({ where: { email: person.email }, include: { member: true } });
      if (existing?.member && (existing.member.role !== person.role || (org && existing.member.organizationId !== org.id))) {
        throw new Error(`Existing membership contradicts desired role or organization for ${person.email}`);
      }
      if (existing && !(await prisma.account.findFirst({ where: { userId: existing.id, providerId: 'credential' } }))) {
        throw new Error(`Existing user lacks a Better Auth credential account: ${person.email}`);
      }
    }

    for (const person of people) {
      const existingUser = await prisma.user.findUnique({ where: { email: person.email } });
      if (existingUser) {
        counts.usersSkipped++;
        if (resetPasswords) {
          const newPassword = randomBytes(24).toString('base64url');
          const account = await prisma.account.findFirstOrThrow({ where: { userId: existingUser.id, providerId: 'credential' } });
          await prisma.account.update({ where: { id: account.id }, data: { password: await hashPassword(newPassword) } });
          await prisma.user.update({ where: { id: existingUser.id }, data: { mustChangePassword: true } });
          passwords[person.email] = newPassword;
          writeFileSync(credentialPath, JSON.stringify(passwords, null, 2));
          counts.passwordsReset++;
        }
        continue;
      }
      await auth.api.signUpEmail({ body: { email: person.email, name: person.name, password: passwords[person.email] } });
      await prisma.user.update({ where: { email: person.email }, data: { mustChangePassword: true } });
      counts.usersCreated++;
    }
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: people.find((person) => person.role === 'admin')!.email } });
    if (!org) {
      await auth.api.createOrganization({ body: { name: plan.organization.name, slug: plan.organization.slug, userId: admin.id } });
      org = await prisma.organization.findUniqueOrThrow({ where: { slug: plan.organization.slug } });
      counts.organizationsCreated++;
    } else counts.organizationsSkipped++;

    for (const component of defaultComponentCatalog) {
      const existing = await prisma.compensation_component_definition.findUnique({ where: { organization_id_code: { organization_id: org.id, code: component.code } } });
      if (existing) continue;
      if (component.is_basic && await prisma.compensation_component_definition.findFirst({ where: { organization_id: org.id, is_basic: true } })) throw new Error('Organization already has a different Basic Salary definition');
      await prisma.compensation_component_definition.create({ data: { id: randomUUID(), organization_id: org.id, ...component } });
      counts.componentsCreated++;
    }

    for (const key of ['admin', 'hr', 'employee'] as const) {
      const requested = plan.roles[key];
      const flags = { ...defaultPermissions[key], ...requested?.permissions };
      let role = await prisma.organization_role.findUnique({ where: { organizationId_key: { organizationId: org.id, key } }, include: { organization_role_permissions: true } });
      if (!role) {
        role = await prisma.organization_role.create({ data: { id: randomUUID(), organizationId: org.id, key, displayName: requested?.displayName ?? (key === 'hr' ? 'HR' : key[0].toUpperCase() + key.slice(1)), organization_role_permissions: { create: flags } }, include: { organization_role_permissions: true } });
        counts.rolesCreated++;
      } else {
        if (!role.organization_role_permissions) {
          await prisma.organization_role_permissions.create({ data: { roleId: role.id, ...flags } });
          counts.permissionsUpdated++;
        } else if (requested?.permissions && Object.entries(flags).some(([flag, enabled]) => (role!.organization_role_permissions as unknown as Record<string, unknown>)[flag] !== enabled)) {
          await prisma.organization_role_permissions.update({ where: { roleId: role.id }, data: flags });
          counts.permissionsUpdated++;
        }
        if (requested?.displayName && requested.displayName !== role.displayName) await prisma.organization_role.update({ where: { id: role.id }, data: { displayName: requested.displayName } });
        counts.rolesSkipped++;
      }
    }

    for (const person of people) {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: person.email } });
      let member = await prisma.member.findUnique({ where: { userId: user.id } });
      if (!member) {
        await auth.api.addMember({ body: { userId: user.id, role: person.role, organizationId: org.id } });
        member = await prisma.member.findUniqueOrThrow({ where: { userId: user.id } });
        counts.membershipsCreated++;
      } else counts.membershipsSkipped++;
      if (member.organizationId !== org.id || member.role !== person.role) throw new Error(`Membership mismatch for ${person.email}`);
      const role = await prisma.organization_role.findUniqueOrThrow({ where: { organizationId_key: { organizationId: org.id, key: person.role } } });
      if (!member.roleId) await prisma.member.update({ where: { id: member.id }, data: { roleId: role.id } });
      if (member.roleId && member.roleId !== role.id) throw new Error(`Role reference mismatch for ${person.email}`);
      const profile = await prisma.employee.findUnique({ where: { userId: user.id } });
      if (!profile) {
        await prisma.employee.create({ data: { id: randomUUID(), userId: user.id, organizationId: org.id, displayName: person.name, email: person.email, countryCode: 'IN' } });
        counts.profilesCreated++;
      } else {
        if (profile.organizationId !== org.id) throw new Error(`Employee profile organization mismatch for ${person.email}`);
        counts.profilesSkipped++;
        if (person.generated && /^Demo Employee \d+$/.test(user.name) && profile.displayName === user.name) {
          await prisma.$transaction([
            prisma.user.update({ where: { id: user.id }, data: { name: person.name } }),
            prisma.employee.update({ where: { id: profile.id }, data: { displayName: person.name } }),
          ]);
          counts.namesUpdated++;
        }
      }
    }

    // Every seeded person, including admin and HR, receives an initial active package.
    const definitions = await prisma.compensation_component_definition.findMany({ where: { organization_id: org.id } });
    const currency = await prisma.currency.findUniqueOrThrow({ where: { code: seedCompensationCurrency } });
    for (const person of people) {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: person.email } });
      const profile = await prisma.employee.findUniqueOrThrow({ where: { userId: user.id } });
      if (await prisma.employee_compensation.count({ where: { employee_id: profile.id, status: { in: ['ACTIVE', 'SUPERSEDED'] } } })) { counts.compensationSkipped++; continue; }
      const rules = plannedCompensation(org.slug, person).map((rule) => {
        const definition = definitions.find((item) => item.code === rule.code);
        if (!definition?.is_active) throw new Error(`Component ${rule.code} is missing or inactive in ${org!.slug}`);
        return { componentDefinitionId: definition.id, calculationType: rule.calculationType, fixedAmount: rule.fixedAmount, percentage: rule.percentage };
      });
      const result = calculateCompensation({
        currency: { code: currency.code, decimalPlaces: currency.decimal_places, isActive: currency.is_active },
        definitions: definitions.map((item) => ({ id: item.id, category: item.category, isBasic: item.is_basic, isActive: item.is_active })),
        items: rules,
      });
      await prisma.$transaction(async (tx) => {
        const row = await tx.employee_compensation.create({ data: { id: randomUUID(), organization_id: org!.id, employee_id: profile.id, currency_code: currency.code, status: 'DRAFT', effective_from: new Date(`${seedCompensationEffectiveFrom}T00:00:00.000Z`), created_by: admin.id } });
        await tx.employee_compensation_item.createMany({ data: result.items.map((item) => ({ id: randomUUID(), compensation_id: row.id, component_definition_id: item.componentDefinitionId, calculation_type: item.calculationType, fixed_amount: item.fixedAmount, percentage: item.percentage, resolved_monthly_amount: item.resolvedMonthlyAmount, frequency: item.frequency, resolved_amount: item.resolvedAmount, annual_amount: item.annualAmount })) });
        await tx.employee_compensation.update({ where: { id: row.id }, data: { status: 'ACTIVE', updated_at: new Date() } });
      });
      counts.compensationCreated++;
    }
    const withoutCompensation = await prisma.employee.count({ where: { organizationId: org.id, compensation: { none: { status: 'ACTIVE' } } } });
    if (withoutCompensation) throw new Error(`${withoutCompensation} employee profile(s) lack active compensation`);

    const seededMembers = await prisma.member.findMany({ where: { organizationId: org.id }, include: { user: true } });
    if (seededMembers.length !== people.length || seededMembers.some((member) => !member.roleId || !intended.has(member.user.email))) throw new Error('Final membership verification failed');
    if (await prisma.organization.count({ where: { slug: plan.organization.slug } }) !== 1) throw new Error('Organization count mismatch');
    console.log(JSON.stringify(counts));
    console.log(`Credentials stored in backend/seed/generated/${plan.organization.slug}/credentials.json; values hidden`);
  } catch (error) {
    console.error('Seed stopped after partial progress; rerun after resolving the error. Completed counts:', JSON.stringify(counts));
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
