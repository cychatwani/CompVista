import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service.js';
import { EmailService } from './email.service.js';

const EXPIRY_MS = 10 * 60 * 1000;
const COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export type OtpUser = { id: string; email: string; mustChangePassword: boolean; emailVerified: boolean; twoFactorEnabled: boolean | null };

@Injectable()
export class EmailOtpService {
  constructor(private readonly prisma: PrismaService, private readonly mail: EmailService, private readonly config: ConfigService) {}

  private requireEligible(user: OtpUser): void {
    if (user.mustChangePassword || user.emailVerified) throw new ForbiddenException('Email verification is not available for this session');
  }

  private hash(userId: string, code: string): string {
    const secret = this.config.get<string>('BETTER_AUTH_SECRET');
    if (!secret) throw new Error('BETTER_AUTH_SECRET is required for OTP hashing');
    return createHmac('sha256', secret).update(`email-otp:${userId}:${code}`).digest('hex');
  }

  async issue(user: OtpUser, resend = false): Promise<{ email: string; sent: boolean; retryAfterSeconds: number; expiresInSeconds: number }> {
    this.requireEligible(user);
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${user.id} FOR UPDATE`;
      const currentUser = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, emailVerified: true, mustChangePassword: true } });
      if (currentUser.emailVerified || currentUser.mustChangePassword) throw new ForbiddenException('Email verification is not available for this session');
      const previous = await tx.email_verification_otp.findUnique({ where: { userId: user.id } });
      const cooldown = previous ? Math.max(0, COOLDOWN_MS - (now.getTime() - previous.sentAt.getTime())) : 0;
      // A page mount may ensure the first code, but only an explicit resend may replace any previous issue.
      if (!resend && previous) {
        return { email: currentUser.email, sent: false, retryAfterSeconds: Math.ceil(cooldown / 1000), expiresInSeconds: Math.max(0, Math.ceil((previous.expiresAt.getTime() - now.getTime()) / 1000)) };
      }
      if (cooldown > 0) throw new HttpException('Wait before requesting another code', 429);
      const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const codeHash = this.hash(user.id, code);
      await tx.email_verification_otp.upsert({
        where: { userId: user.id },
        create: { userId: user.id, email: currentUser.email, codeHash, sentAt: now, expiresAt: new Date(now.getTime() + EXPIRY_MS), attempts: 0 },
        update: { email: currentUser.email, codeHash, sentAt: now, expiresAt: new Date(now.getTime() + EXPIRY_MS), attempts: 0 },
      });
      return { email: currentUser.email, sent: true, retryAfterSeconds: 60, expiresInSeconds: 600, code, codeHash };
    });
    if (result.sent && 'code' in result) {
      try {
        await this.mail.send({ to: result.email, subject: 'Your CompVista verification code', text: `Your CompVista verification code is ${result.code}. It expires in 10 minutes.` });
      } catch (error) {
        await this.prisma.email_verification_otp.updateMany({ where: { userId: user.id, codeHash: result.codeHash }, data: { attempts: MAX_ATTEMPTS } });
        throw error;
      }
    }
    return { email: result.email, sent: result.sent, retryAfterSeconds: result.retryAfterSeconds, expiresInSeconds: result.expiresInSeconds };
  }

  async verify(user: OtpUser, code: string): Promise<{ nextStep: 'SETUP_TOTP' | 'AUTHENTICATED' }> {
    this.requireEligible(user);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${user.id} FOR UPDATE`;
      const currentUser = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true, emailVerified: true, mustChangePassword: true, twoFactorEnabled: true } });
      if (currentUser.emailVerified || currentUser.mustChangePassword) throw new ForbiddenException('Email verification is not available for this session');
      const current = await tx.email_verification_otp.findUnique({ where: { userId: user.id } });
      if (!current || current.email !== currentUser.email || current.expiresAt <= new Date() || current.attempts >= MAX_ATTEMPTS) throw new BadRequestException('Code is invalid or expired');
      const submitted = this.hash(user.id, typeof code === 'string' ? code : '');
      const valid = /^\d{6}$/.test(code) && timingSafeEqual(Buffer.from(submitted, 'hex'), Buffer.from(current.codeHash, 'hex'));
      if (!valid) {
        await tx.email_verification_otp.update({ where: { userId: user.id }, data: { attempts: { increment: 1 } } });
        return { valid: false as const };
      }
      await tx.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      await tx.email_verification_otp.delete({ where: { userId: user.id } });
      return { valid: true as const, nextStep: currentUser.twoFactorEnabled ? 'AUTHENTICATED' as const : 'SETUP_TOTP' as const };
    });
    if (!result.valid) throw new BadRequestException('Code is invalid or expired');
    return { nextStep: result.nextStep };
  }
}
