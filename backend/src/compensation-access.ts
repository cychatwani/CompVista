export type CompensationMember = {
  organizationId: string;
  role: string;
  organization_role: { organization_role_permissions: { canViewAllComp: boolean; canProposeOthersComp: boolean } | null } | null;
};

export function canAccessCompensation(member: CompensationMember | null, activeOrganizationId: string | null | undefined, kind: 'read' | 'write'): boolean {
  if (!member || (activeOrganizationId && activeOrganizationId !== member.organizationId)) return false;
  if (member.role === 'admin') return true;
  const flags = member.organization_role?.organization_role_permissions;
  return kind === 'read' ? !!flags?.canViewAllComp : !!flags?.canProposeOthersComp;
}
