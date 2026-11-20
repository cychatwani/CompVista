import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HelloController } from './hello.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env.local'],
      validate: (config: Record<string, string | undefined>) => {
        for (const key of ['DATABASE_URL', 'DIRECT_URL', 'FRONTEND_URL']) {
          if (!config[key]) throw new Error(`Missing required environment variable: ${key}`);
        }
        const port = Number(config.PORT ?? 4000);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
        return { ...config, PORT: port };
      },
    }),
    PrismaModule,
  ],
  controllers: [HelloController],
})
export class AppModule {}
