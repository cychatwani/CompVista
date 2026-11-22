import { Controller, Get, Post, Body, Req, Res, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { auth } from './auth.js';
import { getSessionFromCookie } from './auth-session.js';
import { validNewPassword } from './password-policy.js';
import { PrismaService } from './prisma/prisma.service.js';
import { loadTotpState, nextAuthStep } from './totp-policy.js';

@Controller('api')
export class AccessController {
  constructor(private readonly prisma: PrismaService) {}
  private async state(request: { headers: { cookie?: string } }) {
    const session = await getSessionFromCookie(request.headers.cookie);
    if (!session?.user) throw new UnauthorizedException();
    const user = await loadTotpState(this.prisma, session.user.id);
    if (!user) throw new UnauthorizedException();
    return user;
  }

  @Get('auth-state')
  async authState(@Req() request: { headers: { cookie?: string } }) {
    const user = await this.state(request);
    return { nextStep: nextAuthStep(user) };
  }

  @Post('mandatory-password-change')
  async changePassword(@Req() request: { headers: { cookie?: string } }, @Res({ passthrough: true }) response: { setHeader(name: string, value: string[]): void }, @Body() body: { currentPassword?: string; newPassword?: string; confirmPassword?: string }) {
    const user = await this.state(request);
    if (!user.mustChangePassword) throw new BadRequestException('Password change is not required');
    if (!body.currentPassword || !body.newPassword || body.newPassword !== body.confirmPassword || !validNewPassword(body.newPassword)) throw new BadRequestException('Password does not meet requirements or confirmation does not match');
    const changed = await auth.api.changePassword({ headers: new Headers({ cookie: request.headers.cookie ?? '' }), body: { currentPassword: body.currentPassword, newPassword: body.newPassword, revokeOtherSessions: true }, asResponse: true });
    if (!changed.ok) throw new BadRequestException('Current password is incorrect');
    await this.prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: false } });
    const cookies = changed.headers.getSetCookie();
    if (cookies.length) response.setHeader('Set-Cookie', cookies);
    return { nextStep: nextAuthStep({ ...user, mustChangePassword: false }) };
  }

  @Get('access')
  async check(@Req() request: { headers: { cookie?: string } }): Promise<{ authenticated: true }> {
    const user = await this.state(request);
    if (nextAuthStep(user) !== 'AUTHENTICATED') throw new ForbiddenException('Authentication requirements incomplete');
    return { authenticated: true };
  }
}

