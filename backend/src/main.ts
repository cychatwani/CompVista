import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use('/api/auth', toNodeHandler(auth));
  app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });
  await app.listen(Number(process.env.PORT ?? 4000));
}

void bootstrap();
