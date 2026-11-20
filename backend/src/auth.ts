import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { organization, twoFactor } from 'better-auth/plugins';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { config } from 'dotenv';

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
  emailAndPassword: { enabled: true, disableSignUp: process.env.COMPVISTA_BOOTSTRAP !== '1' },
  plugins: [
    organization({ allowUserToCreateOrganization: process.env.COMPVISTA_BOOTSTRAP === '1', organizationLimit: 1 }),
    twoFactor(),
  ],
});
