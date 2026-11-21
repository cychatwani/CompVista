-- Role keys are stable Better Auth organization roles; display names are per organization.
CREATE TABLE "organization_role" (
  "id" TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL REFERENCES "organization"("id") ON DELETE CASCADE,
  "key" TEXT NOT NULL CHECK ("key" IN ('admin', 'hr', 'employee')),
  "displayName" TEXT NOT NULL,
  "requiresApproval" BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE ("organizationId", "key"),
  UNIQUE ("id", "organizationId")
);

CREATE TABLE "organization_role_permission" (
  "roleId" TEXT NOT NULL REFERENCES "organization_role"("id") ON DELETE CASCADE,
  "permission" TEXT NOT NULL,
  PRIMARY KEY ("roleId", "permission")
);

-- Better Auth continues to own member.role. The role reference tracks its key.
-- Nullable for the legacy development owner until the explicit seed reconciles it.
ALTER TABLE "member" ADD COLUMN "roleId" TEXT;
ALTER TABLE "member" ADD CONSTRAINT "member_role_org_fk"
  FOREIGN KEY ("roleId", "organizationId")
  REFERENCES "organization_role"("id", "organizationId");

CREATE FUNCTION sync_member_role_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT "id" INTO NEW."roleId"
  FROM "organization_role"
  WHERE "organizationId" = NEW."organizationId" AND "key" = NEW."role";

  IF NEW."roleId" IS NULL AND EXISTS (
    SELECT 1 FROM "organization_role" WHERE "organizationId" = NEW."organizationId"
  ) THEN
    RAISE EXCEPTION 'Organization role is not configured for this membership';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "member_role_sync"
  BEFORE INSERT OR UPDATE OF "role", "organizationId" ON "member"
  FOR EACH ROW EXECUTE FUNCTION sync_member_role_id();
