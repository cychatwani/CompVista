-- Simpler lifecycle, replacing V14's maker-checker:
--   deactivate: only when no ACTIVE or PENDING_APPROVAL package uses the component
--   delete:     only when inactive; components referenced by past packages are hidden
--               (deleted_at) instead of removed, so history stays intact
DROP TABLE component_deactivation_request;

ALTER TABLE compensation_component_definition ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE compensation_component_definition
  ADD CONSTRAINT deleted_component_is_inactive CHECK (deleted_at IS NULL OR NOT is_active);

CREATE OR REPLACE FUNCTION compensation_definition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id OR NEW.code <> OLD.code
    OR NEW.category <> OLD.category OR NEW.is_basic <> OLD.is_basic THEN
    RAISE EXCEPTION 'Compensation definition identity is immutable';
  END IF;
  IF OLD.is_basic AND NOT NEW.is_active THEN
    RAISE EXCEPTION 'Basic Salary cannot be deactivated';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.is_active THEN
    RAISE EXCEPTION 'Deleted component cannot be reactivated';
  END IF;
  IF OLD.is_active AND NOT NEW.is_active AND EXISTS (
    SELECT 1 FROM employee_compensation_item item
    JOIN employee_compensation package ON package.id = item.compensation_id
    WHERE item.component_definition_id = NEW.id AND package.status::text IN ('ACTIVE', 'PENDING_APPROVAL')) THEN
    RAISE EXCEPTION 'Component is used by live packages and cannot be deactivated';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION compensation_definition_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_active THEN RAISE EXCEPTION 'Deactivate a component before deleting it'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER compensation_definition_delete BEFORE DELETE ON compensation_component_definition
  FOR EACH ROW EXECUTE FUNCTION compensation_definition_delete_guard();
