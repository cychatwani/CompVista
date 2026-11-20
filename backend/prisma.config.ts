import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

config({ path: process.env.COMPVISTA_ENV_FILE ?? '.env' });
if (!process.env.COMPVISTA_ENV_FILE) config({ path: '../.env.local' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: process.env.DIRECT_URL ?? '' },
});
