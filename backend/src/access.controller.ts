import { Controller, Get, Req, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { auth } from './auth.js';
import { PrismaService } from './prisma/prisma.service.js';

@Controller('api/access')
export class AccessController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  async check(@Req() request: { headers: { cookie?: string } }): Promise<{ authenticated: true }> {
    const session = await auth.api.getSession({ headers: new Headers({ cookie: request.headers.cookie ?? '' }) });
    if (!session?.user) throw new UnauthorizedException();
    const user = await this.prisma.user.findUnique({ where: { id: session.user.id }, select: { emailVerified: true, twoFactorEnabled: true } });
    if (!user?.emailVerified || !user.twoFactorEnabled) throw new ForbiddenException('Authentication requirements incomplete');
    return { authenticated: true };
  }
}

