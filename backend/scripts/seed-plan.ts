import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type SeedRole = 'admin' | 'hr' | 'employee';
export type PlannedPerson = { email: string; name: string; role: SeedRole; generated: boolean };
export type SeedPlan = { organization: { name: string; slug: string }; people: PlannedPerson[] };

type RawPlan = {
  organization?: { name?: unknown; slug?: unknown };
  users?: { email?: unknown; name?: unknown; role?: unknown }[];
  generatedEmployees?: { count?: unknown; emailPrefix?: unknown; namesFile?: unknown; names?: { first_names?: unknown; last_names?: unknown } };
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
  return { organization: { name, slug }, people };
}

export function loadSeedPlan(file: string): SeedPlan {
  return parseSeedPlan(JSON.parse(readFileSync(resolve(file), 'utf8')) as unknown);
}
