-- Approval workflow. A proposer whose role has requiresApproval submits packages as
-- PENDING_APPROVAL; an approver applies them (ACTIVE) or returns them to DRAFT with a note.
-- Applying a revision supersedes the current ACTIVE package the day before it takes effect.
ALTER TYPE compensation_status ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';

ALTER TABLE employee_compensation
  ADD COLUMN submitted_by TEXT REFERENCES "user"(id) ON DELETE RESTRICT,
  ADD COLUMN submitted_at TIMESTAMPTZ,
  ADD COLUMN decided_by TEXT REFERENCES "user"(id) ON DELETE RESTRICT,
  ADD COLUMN decided_at TIMESTAMPTZ,
  ADD COLUMN decision_note TEXT CHECK (decision_note IS NULL OR length(decision_note) <= 1000);

-- Replaces the V9 guard. Transitions now allowed:
--   DRAFT            -> anything except ownership changes (unchanged)
--   PENDING_APPROVAL -> DRAFT (rejected) or ACTIVE (approved); content stays frozen
--   ACTIVE           -> SUPERSEDED, only by closing effective_to
--   SUPERSEDED       -> immutable
-- Only drafts may be deleted.
CREATE OR REPLACE FUNCTION compensation_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status::text <> 'DRAFT' THEN RAISE EXCEPTION 'Applied compensation is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.employee_id <> OLD.employee_id OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'Package ownership is immutable';
  END IF;
  IF OLD.status::text = 'DRAFT' THEN RETURN NEW; END IF;
  IF OLD.status::text = 'PENDING_APPROVAL' THEN
    IF NEW.status::text NOT IN ('DRAFT', 'ACTIVE', 'PENDING_APPROVAL')
      OR NEW.currency_code <> OLD.currency_code OR NEW.effective_from <> OLD.effective_from
      OR NEW.effective_to IS DISTINCT FROM OLD.effective_to THEN
      RAISE EXCEPTION 'Pending compensation can only be approved or returned to draft';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status::text = 'ACTIVE' AND NEW.status::text = 'SUPERSEDED'
    AND NEW.currency_code = OLD.currency_code AND NEW.effective_from = OLD.effective_from
    AND NEW.effective_to IS NOT NULL AND NEW.effective_to >= OLD.effective_from THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Applied compensation is immutable';
END $$;
