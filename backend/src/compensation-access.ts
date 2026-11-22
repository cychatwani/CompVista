export type CompensationMember = {
  organizationId: string;
  role: string;
  organization_role: { organization_role_permissions: { canViewAllComp: boolean; canProposeOthersComp: boolean; canViewOwnComp?: boolean; canApproveComp?: boolean } | null } | null;
};

// Management access (organization-wide read and any write). The employee role never qualifies,
// regardless of how its permission row is configured.
export function canAccessCompensation(member: CompensationMember | null, activeOrganizationId: string | null | undefined, kind: 'read' | 'write' | 'approve'): boolean {
  if (!member || (activeOrganizationId && activeOrganizationId !== member.organizationId)) return false;
  if (member.role === 'admin') return true;
  if (member.role === 'employee') return false;
  const flags = member.organization_role?.organization_role_permissions;
  if (kind === 'approve') return !!flags?.canApproveComp;
  return kind === 'read' ? !!flags?.canViewAllComp : !!flags?.canProposeOthersComp;
}

// Self-service read of the caller's own applied compensation. Employees always may view their own.
export function canViewOwnCompensation(member: CompensationMember | null, activeOrganizationId: string | null | undefined): boolean {
  if (!member || (activeOrganizationId && activeOrganizationId !== member.organizationId)) return false;
  if (member.role === 'admin' || member.role === 'employee') return true;
  return member.organization_role?.organization_role_permissions?.canViewOwnComp !== false;
}
