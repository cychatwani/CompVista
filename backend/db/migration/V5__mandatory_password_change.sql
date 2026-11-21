ALTER TABLE "user" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE;
-- Existing credential accounts in this development-only seed architecture have temporary passwords.
UPDATE "user" SET "mustChangePassword" = TRUE
WHERE EXISTS (SELECT 1 FROM "account" WHERE "account"."userId" = "user"."id" AND "account"."providerId" = 'credential');
