import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpException, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { auth } from './auth.js';
import { getSessionFromCookie } from './auth-session.js';
import { PrismaService } from './prisma/prisma.service.js';
import { loadTotpState, nextAuthStep } from './totp-policy.js';

type RequestWithCookie = { headers: { cookie?: string } };
type CookieResponse = { setHeader(name: string, value: string[]): void };

async function requireSuccess(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new HttpException(typeof body.message === 'string' ? body.message : 'Authenticator request failed', response.status);
  return body;
}

@Controller('api/totp')
export class TotpController {
  constructor(private readonly prisma: PrismaService) {}

  private async current(request: RequestWithCookie) {
    const session = await getSessionFromCookie(request.headers.cookie);
    if (!session?.user) throw new UnauthorizedException();
    const state = await loadTotpState(this.prisma, session.user.id);
    if (!state) throw new UnauthorizedException();
    if (state.mustChangePassword || !state.emailVerified) throw new ForbiddenException('Complete earlier sign-in steps first');
    return state;
  }

  @Get('status')
  async status(@Req() request: RequestWithCookie) {
    const state = await this.current(request);
    return { decision: state.decision, requireTotp: state.requireTotp, canSkip: state.decision !== 'ENABLED' && !state.twoFactorEnabled && !state.requireTotp, nextStep: nextAuthStep(state) };
  }

  @Post('begin')
  async begin(@Req() request: RequestWithCookie, @Body() body: { password?: string }) {
    const state = await this.current(request);
    if (nextAuthStep(state) !== 'SETUP_TOTP' || state.twoFactorEnabled) throw new ForbiddenException('Authenticator enrollment is not available');
    if (!body?.password) throw new BadRequestException('Current password is required');
    const result = await requireSuccess(await auth.api.enableTwoFactor({ body: { password: body.password, method: 'totp' }, headers: new Headers({ cookie: request.headers.cookie ?? '' }), asResponse: true }));
    if (result.method !== 'totp' || typeof result.totpURI !== 'string' || !Array.isArray(result.backupCodes)) throw new Error('Unexpected authenticator response');
    return { totpURI: result.totpURI, backupCodes: result.backupCodes };
  }

  @Post('verify')
  async verify(@Req() request: RequestWithCookie, @Res({ passthrough: true }) response: CookieResponse, @Body() body: { code?: string }) {
    const state = await this.current(request);
    if (nextAuthStep(state) !== 'SETUP_TOTP' || state.twoFactorEnabled) throw new ForbiddenException('Authenticator enrollment is not available');
    if (!/^\d{6}$/.test(body?.code ?? '')) throw new BadRequestException('Enter a six-digit code');
    const verified = await auth.api.verifyTOTP({ body: { code: body.code!, trustDevice: false }, headers: new Headers({ cookie: request.headers.cookie ?? '' }), asResponse: true });
    await requireSuccess(verified);
    const updated = await this.prisma.user.findUniqueOrThrow({ where: { id: state.id }, select: { twoFactorEnabled: true } });
    if (!updated.twoFactorEnabled) throw new Error('Authenticator was not enabled');
    await this.prisma.totp_enrollment_decision.upsert({
      where: { userId: state.id },
      create: { userId: state.id, decision: 'ENABLED' },
      update: { decision: 'ENABLED', updatedAt: new Date() },
    });
    const cookies = verified.headers.getSetCookie();
    if (cookies.length) response.setHeader('Set-Cookie', cookies);
    return { decision: 'ENABLED', nextStep: 'AUTHENTICATED' };
  }

  @Post('skip')
  async skip(@Req() request: RequestWithCookie) {
    const state = await this.current(request);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "user" WHERE id = ${state.id} FOR UPDATE`;
      const current = await loadTotpState(tx as unknown as PrismaService, state.id);
      if (!current || current.mustChangePassword || !current.emailVerified || current.requireTotp || current.twoFactorEnabled || current.decision === 'ENABLED') {
        throw new ForbiddenException('Skipping authenticator setup is not allowed');
      }
      await tx.totp_enrollment_decision.upsert({ where: { userId: state.id }, create: { userId: state.id, decision: 'SKIPPED' }, update: { decision: 'SKIPPED', updatedAt: new Date() } });
    });
    return { decision: 'SKIPPED', nextStep: 'AUTHENTICATED' };
  }

  @Post('challenge')
  async challenge(@Req() request: RequestWithCookie, @Res({ passthrough: true }) response: CookieResponse, @Body() body: { code?: string }) {
    if (!/^\d{6}$/.test(body?.code ?? '')) throw new BadRequestException('Enter a six-digit code');
    if (await getSessionFromCookie(request.headers.cookie)) throw new ForbiddenException('Use the enrollment flow for this session');
    const verified = await auth.api.verifyTOTP({ body: { code: body.code!, trustDevice: false }, headers: new Headers({ cookie: request.headers.cookie ?? '' }), asResponse: true });
    await requireSuccess(verified);
    const cookies = verified.headers.getSetCookie();
    if (cookies.length) response.setHeader('Set-Cookie', cookies);
    return { nextStep: 'AUTHENTICATED' };
  }
}
