CREATE TABLE "email_verification_otp" (
  "userId" TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "sentAt" TIMESTAMPTZ NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0 AND "attempts" <= 5)
);
