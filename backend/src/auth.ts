import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { organization, twoFactor } from 'better-auth/plugins';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { config } from 'dotenv';
import { organizationAccess, organizationRoles } from './organization-roles.js';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env' });
if (!process.env.COMPVISTA_ENV_FILE) config({ path: '../.env.local' });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

export const auth = betterAuth({
  appName: 'CompVista',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:4000',
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.FRONTEND_URL ?? 'http://localhost:3000'],
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, disableSignUp: process.env.COMPVISTA_SEED !== '1' },
  // Every browser request reaches this API through the Next.js server, so Better Auth cannot
  // see a trusted client IP and keeps one shared bucket per path. Its default sign-in rule
  // (3 per 10 s) would then lock out everyone after three logins by anyone. Allow a pace that
  // suits a shared bucket; strong passwords and TOTP remain the main brute-force defence.
  rateLimit: { customRules: { '/sign-in/*': { window: 60, max: 60 } } },
  disabledPaths: process.env.COMPVISTA_SEED === '1' ? [] : [
    '/sign-up/email',
    '/organization/create',
    '/organization/invite-member',
    '/organization/accept-invitation',
    '/organization/reject-invitation',
    '/organization/cancel-invitation',
  ],
  plugins: [
    organization({
      ac: organizationAccess,
      roles: organizationRoles,
      allowUserToCreateOrganization: process.env.COMPVISTA_SEED === '1',
      organizationLimit: 1,
      creatorRole: 'admin',
    }),
    twoFactor(),
  ],
});
