// Development only: delete ALL application data (organizations, people, logins, sessions,
// compensation). Keeps the schema, Flyway history, and reference data (currencies, countries).
//
//   COMPVISTA_DEV_SEED=YES npm run db:reset-dev -- --yes-delete-everything
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env' });
if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset in production mode');
if (process.env.COMPVISTA_DEV_SEED !== 'YES') throw new Error('Set COMPVISTA_DEV_SEED=YES to run this development script');
if (!process.argv.includes('--yes-delete-everything')) throw new Error('This deletes every organization, user, and package. Pass --yes-delete-everything to confirm.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
async function main() {
  const before = await prisma.$queryRaw<{ organizations: number; users: number; employees: number }[]>`SELECT (SELECT count(*) FROM organization)::int AS organizations, (SELECT count(*) FROM "user")::int AS users, (SELECT count(*) FROM employee)::int AS employees`;
  // TRUNCATE skips the row-level immutability triggers on applied compensation; CASCADE reaches every dependent table.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE organization, "user", verification RESTART IDENTITY CASCADE');
  const after = await prisma.$queryRaw<{ organizations: number; users: number; employees: number; packages: number; currencies: number; countries: number }[]>`SELECT (SELECT count(*) FROM organization)::int AS organizations, (SELECT count(*) FROM "user")::int AS users, (SELECT count(*) FROM employee)::int AS employees, (SELECT count(*) FROM employee_compensation)::int AS packages, (SELECT count(*) FROM currency)::int AS currencies, (SELECT count(*) FROM country)::int AS countries`;
  console.log(JSON.stringify({ deleted: before[0], remaining: after[0] }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
