import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements, memberAc, ownerAc } from 'better-auth/plugins/organization/access';

export const organizationAccess = createAccessControl(defaultStatements);

export const organizationRoles = {
  admin: organizationAccess.newRole(ownerAc.statements),
  hr: organizationAccess.newRole(memberAc.statements),
  employee: organizationAccess.newRole(memberAc.statements),
};
