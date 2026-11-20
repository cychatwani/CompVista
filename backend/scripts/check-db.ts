import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: '.env' });
config({ path: '../.env.local' });

if (!process.env.DATABASE_URL) throw new Error('Missing DATABASE_URL');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('Database connection successful');
} finally {
  await prisma.$disconnect();
}
