-- Replace text permission rows with one fixed boolean permission row per role.
CREATE TABLE "organization_role_permissions" (
  "roleId" TEXT PRIMARY KEY REFERENCES "organization_role"("id") ON DELETE CASCADE,
  "canViewAllComp" BOOLEAN NOT NULL DEFAULT FALSE,
  "canViewOwnComp" BOOLEAN NOT NULL DEFAULT FALSE,
  "canProposeOthersComp" BOOLEAN NOT NULL DEFAULT FALSE,
  "canProposeOwnComp" BOOLEAN NOT NULL DEFAULT FALSE,
  "canApproveComp" BOOLEAN NOT NULL DEFAULT FALSE,
  "canApproveOwnComp" BOOLEAN NOT NULL DEFAULT FALSE,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO "organization_role_permissions" (
  "roleId", "canViewAllComp", "canViewOwnComp", "canProposeOthersComp",
  "canProposeOwnComp", "canApproveComp", "canApproveOwnComp", "requiresApproval"
)
SELECT role."id",
  EXISTS (SELECT 1 FROM "organization_role_permission" p WHERE p."roleId" = role."id" AND p."permission" = 'compensation.view_all'),
  EXISTS (SELECT 1 FROM "organization_role_permission" p WHERE p."roleId" = role."id" AND p."permission" = 'compensation.view_self'),
  EXISTS (SELECT 1 FROM "organization_role_permission" p WHERE p."roleId" = role."id" AND p."permission" = 'compensation.propose_others'),
  EXISTS (SELECT 1 FROM "organization_role_permission" p WHERE p."roleId" = role."id" AND p."permission" = 'compensation.propose_self'),
  EXISTS (SELECT 1 FROM "organization_role_permission" p WHERE p."roleId" = role."id" AND p."permission" = 'compensation.approve'),
  EXISTS (SELECT 1 FROM "organization_role_permission" p WHERE p."roleId" = role."id" AND p."permission" = 'compensation.approve_self'),
  role."requiresApproval"
FROM "organization_role" role;

DROP TABLE "organization_role_permission";
ALTER TABLE "organization_role" DROP COLUMN "requiresApproval";
