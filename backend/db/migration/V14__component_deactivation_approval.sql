-- Maker-checker for deactivating a component that live packages still use.
-- A "live" package is ACTIVE or PENDING_APPROVAL. Such a component can only be deactivated
-- in the same transaction that approves a deactivation request (decided_at = now()).
CREATE TABLE component_deactivation_request (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
  component_definition_id UUID NOT NULL,
  requested_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  decided_by TEXT REFERENCES "user"(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ,
  decision_note TEXT CHECK (decision_note IS NULL OR length(decision_note) <= 1000),
  FOREIGN KEY (component_definition_id, organization_id) REFERENCES compensation_component_definition(id, organization_id) ON DELETE CASCADE,
  CHECK ((status = 'PENDING') = (decided_by IS NULL)),
  CHECK (status = 'PENDING' OR decided_by <> requested_by)
);
CREATE UNIQUE INDEX one_pending_deactivation_per_component
  ON component_deactivation_request (component_definition_id) WHERE status = 'PENDING';

CREATE OR REPLACE FUNCTION compensation_definition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id OR NEW.code <> OLD.code
    OR NEW.category <> OLD.category OR NEW.is_basic <> OLD.is_basic THEN
    RAISE EXCEPTION 'Compensation definition identity is immutable';
  END IF;
  IF OLD.is_basic AND NOT NEW.is_active THEN
    RAISE EXCEPTION 'Basic Salary cannot be deactivated';
  END IF;
  IF OLD.is_active AND NOT NEW.is_active
    AND EXISTS (
      SELECT 1 FROM employee_compensation_item item
      JOIN employee_compensation package ON package.id = item.compensation_id
      WHERE item.component_definition_id = NEW.id AND package.status::text IN ('ACTIVE', 'PENDING_APPROVAL'))
    AND NOT EXISTS (
      SELECT 1 FROM component_deactivation_request request
      WHERE request.component_definition_id = NEW.id AND request.status = 'APPROVED' AND request.decided_at = now()) THEN
    RAISE EXCEPTION 'Component is used by live packages and needs an approved deactivation request';
  END IF;
  RETURN NEW;
END $$;
