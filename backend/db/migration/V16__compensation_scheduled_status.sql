-- An approved package whose effective date is still in the future waits as SCHEDULED
-- ("upcoming") until the nightly job promotes it to ACTIVE. Added on its own because a new
-- enum value cannot be used in the transaction that creates it.
ALTER TYPE compensation_status ADD VALUE IF NOT EXISTS 'SCHEDULED';
