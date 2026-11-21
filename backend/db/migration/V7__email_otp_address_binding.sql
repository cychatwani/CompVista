ALTER TABLE "email_verification_otp" ADD COLUMN "email" TEXT NOT NULL DEFAULT '';
ALTER TABLE "email_verification_otp" ALTER COLUMN "email" DROP DEFAULT;
