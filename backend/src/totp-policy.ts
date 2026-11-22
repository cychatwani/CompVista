import type { PrismaService } from './prisma/prisma.service.js';

export type EnrollmentDecision = 'PENDING' | 'SKIPPED' | 'ENABLED';
export type AuthStep = 'RESET_PASSWORD' | 'VERIFY_EMAIL' | 'SETUP_TOTP' | 'AUTHENTICATED';

export type TotpState = {
  id: string;
  mustChangePassword: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean | null;
  decision: EnrollmentDecision;
  requireTotp: boolean;
};

export function nextAuthStep(state: TotpState): AuthStep {
  if (state.mustChangePassword) return 'RESET_PASSWORD';
  if (!state.emailVerified) return 'VERIFY_EMAIL';
  if (state.twoFactorEnabled && state.decision === 'ENABLED') return 'AUTHENTICATED';
  if (state.decision === 'SKIPPED' && !state.requireTotp && !state.twoFactorEnabled) return 'AUTHENTICATED';
  return 'SETUP_TOTP';
}

export async function loadTotpState(prisma: PrismaService, userId: string): Promise<TotpState | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, mustChangePassword: true, emailVerified: true, twoFactorEnabled: true,
      totpEnrollmentDecision: { select: { decision: true } },
      member: { select: { organization_role: { select: { organization_role_permissions: { select: { requireTotp: true } } } } } },
    },
  });
  if (!user) return null;
  const recorded = user.totpEnrollmentDecision?.decision;
  return {
    id: user.id, mustChangePassword: user.mustChangePassword, emailVerified: user.emailVerified,
    twoFactorEnabled: user.twoFactorEnabled,
    decision: recorded === 'SKIPPED' || recorded === 'ENABLED' ? recorded : 'PENDING',
    requireTotp: user.member?.organization_role?.organization_role_permissions?.requireTotp ?? false,
  };
}
