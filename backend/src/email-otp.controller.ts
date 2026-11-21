import { Body, Controller, ForbiddenException, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { auth } from './auth.js';
import { EmailOtpService } from './email-otp.service.js';
import { PrismaService } from './prisma/prisma.service.js';

@Controller('api/email-otp')
export class EmailOtpController {
  constructor(private readonly prisma: PrismaService, private readonly otp: EmailOtpService) {}

  private async user(request: { headers: { cookie?: string } }) {
    const session = await auth.api.getSession({ headers: new Headers({ cookie: request.headers.cookie ?? '' }) });
    if (!session?.user) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, email: true, emailVerified: true, mustChangePassword: true, twoFactorEnabled: true } });
    if (!user) throw new UnauthorizedException();
    if (user.mustChangePassword || user.emailVerified) throw new ForbiddenException('Email verification is not available for this session');
    return user;
  }

  @Get('status')
  async status(@Req() request: { headers: { cookie?: string } }) {
    const user = await this.user(request);
    const code = await this.prisma.email_verification_otp.findUnique({ where: { userId: user.id } });
    const now = Date.now();
    return { email: user.email, hasIssuedCode: !!code, hasActiveCode: !!code && code.email === user.email && code.expiresAt.getTime() > now && code.attempts < 5,
      retryAfterSeconds: code ? Math.max(0, Math.ceil((code.sentAt.getTime() + 60_000 - now) / 1000)) : 0 };
  }

  @Post('send')
  async send(@Req() request: { headers: { cookie?: string } }) { return this.otp.issue(await this.user(request)); }

  @Post('resend')
  async resend(@Req() request: { headers: { cookie?: string } }) { return this.otp.issue(await this.user(request), true); }

  @Post('verify')
  async verify(@Req() request: { headers: { cookie?: string } }, @Body() body: { code?: string }) {
    return this.otp.verify(await this.user(request), body.code ?? '');
  }
}
