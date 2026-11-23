// Development: create an organization with logins for everyone, the same way the
// /provision page does, and write the credentials CSV under seed/generated (git-ignored).
//
//   COMPVISTA_DEV_SEED=YES npm run org:create -- --name "CompVista Demo" --admins 3 --hrs 25 --employees 9972 [--admin-email you@example.com --admin-name "Your Name"] [--email-domain yopmail.com]
import '../src/threadpool.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { credentialsCsv, parseProvisionInput, provisionOrganization } from '../src/provisioning.js';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env' });
if (process.env.NODE_ENV === 'production') throw new Error('Refusing development script in production mode');
if (process.env.COMPVISTA_DEV_SEED !== 'YES') throw new Error('Set COMPVISTA_DEV_SEED=YES to run this development script');

const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
const input = parseProvisionInput({ name: option('name'), slug: option('slug'), admins: option('admins'), hrs: option('hrs'), employees: option('employees'), emailDomain: option('email-domain'), adminEmail: option('admin-email'), adminName: option('admin-name') });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const started = Date.now();
provisionOrganization(prisma, input, (progress) => process.stdout.write(`\r${progress.phase}: ${progress.done}/${progress.total}   `))
  .then((result) => {
    const directory = resolve('seed/generated', result.slug);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = resolve(directory, 'credentials.csv');
    writeFileSync(file, credentialsCsv(result.credentials, `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login`), { mode: 0o600 });
    const roles = result.credentials.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.role]: (acc[row.role] ?? 0) + 1 }), {});
    console.log(`\nCreated ${input.name} (${result.slug}) with ${result.credentials.length} logins ${JSON.stringify(roles)} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(`Credentials: backend/seed/generated/${result.slug}/credentials.csv (git-ignored)`);
  })
  .catch((error) => { console.error('\n', error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
