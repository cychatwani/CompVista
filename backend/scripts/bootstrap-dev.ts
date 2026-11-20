import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env' });
if (process.env.NODE_ENV === 'production') throw new Error('Development bootstrap cannot run in production mode');
const email = process.env.DEV_OWNER_EMAIL?.trim().toLowerCase();
const name = process.env.DEV_OWNER_NAME?.trim();
const password = process.env.DEV_OWNER_PASSWORD;
if (!email || !name || !password) throw new Error('DEV_OWNER_EMAIL, DEV_OWNER_NAME and DEV_OWNER_PASSWORD are required');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

process.env.COMPVISTA_BOOTSTRAP = '1';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main(): Promise<void> {
  const { auth } = await import('../src/auth.js');
  try {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await auth.api.signUpEmail({ body: { email, name, password } });
      user = await prisma.user.findUniqueOrThrow({ where: { email } });
    }
    let org = await prisma.organization.findUnique({ where: { slug: 'compvista-demo' } });
    if (!org) {
      await auth.api.createOrganization({
        body: { name: 'CompVista Demo', slug: 'compvista-demo', userId: user.id },
      });
      org = await prisma.organization.findUniqueOrThrow({ where: { slug: 'compvista-demo' } });
    }
    const member = await prisma.member.findUnique({ where: { userId: user.id } });
    if (!member || member.organizationId !== org.id || member.role !== 'owner') {
      throw new Error('Bootstrap owner membership does not match the expected organization and role');
    }
    console.log('CompVista Demo owner verified');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
