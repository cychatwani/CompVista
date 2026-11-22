ALTER TABLE "organization_role_permissions"
  ADD COLUMN "requireTotp" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "totp_enrollment_decision" (
  "userId" TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "decision" TEXT NOT NULL CHECK ("decision" IN ('PENDING', 'SKIPPED', 'ENABLED')),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Preserve existing verified authenticators when rolling out explicit decisions.
INSERT INTO "totp_enrollment_decision" ("userId", "decision")
SELECT "id", 'ENABLED' FROM "user" WHERE "twoFactorEnabled" = TRUE;
