-- Upcoming packages. Rules:
--   * at most one SCHEDULED package per employee
--   * SCHEDULED content is frozen; it may only become ACTIVE (on its effective date) or be
--     deleted (cancelled by an approver)
--   * PENDING_APPROVAL may now also be approved straight to SCHEDULED
CREATE UNIQUE INDEX one_upcoming_compensation_per_employee ON employee_compensation (employee_id) WHERE status = 'SCHEDULED';

CREATE OR REPLACE FUNCTION compensation_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status::text NOT IN ('DRAFT', 'SCHEDULED') THEN RAISE EXCEPTION 'Applied compensation is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.organization_id <> OLD.organization_id OR NEW.employee_id <> OLD.employee_id OR NEW.created_by <> OLD.created_by THEN
    RAISE EXCEPTION 'Package ownership is immutable';
  END IF;
  IF OLD.status::text = 'DRAFT' THEN RETURN NEW; END IF;
  IF OLD.status::text IN ('PENDING_APPROVAL', 'SCHEDULED') THEN
    IF (OLD.status::text = 'PENDING_APPROVAL' AND NEW.status::text NOT IN ('DRAFT', 'PENDING_APPROVAL', 'SCHEDULED', 'ACTIVE'))
      OR (OLD.status::text = 'SCHEDULED' AND NEW.status::text NOT IN ('SCHEDULED', 'ACTIVE'))
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

DROP TRIGGER compensation_activation_check ON employee_compensation;
CREATE TRIGGER compensation_activation_check AFTER INSERT OR UPDATE OF status ON employee_compensation
  FOR EACH ROW WHEN (NEW.status::text IN ('ACTIVE', 'SCHEDULED')) EXECUTE FUNCTION active_package_requires_basic();
CREATE OR REPLACE FUNCTION active_package_requires_basic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status::text IN ('ACTIVE', 'SCHEDULED') AND NOT EXISTS (
    SELECT 1 FROM employee_compensation_item item
    JOIN compensation_component_definition definition ON definition.id = item.component_definition_id
    WHERE item.compensation_id = NEW.id AND definition.is_basic
      AND item.calculation_type = 'FIXED' AND item.fixed_amount > 0
  ) THEN RAISE EXCEPTION 'Active compensation requires a positive fixed Basic Salary'; END IF;
  RETURN NEW;
END $$;

-- Components used by an upcoming package are live too.
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
    WHERE item.component_definition_id = NEW.id AND package.status::text IN ('ACTIVE', 'PENDING_APPROVAL', 'SCHEDULED')) THEN
    RAISE EXCEPTION 'Component is used by live packages and cannot be deactivated';
  END IF;
  RETURN NEW;
END $$;

-- Repair packages that were applied early: a future-dated ACTIVE package becomes SCHEDULED and
-- the package it superseded is reopened as ACTIVE. If several future packages were stacked,
-- only the earliest stays upcoming; later ones go back to DRAFT for a fresh submission.
ALTER TABLE employee_compensation DISABLE TRIGGER compensation_package_update_delete;

CREATE TEMP TABLE early_package ON COMMIT DROP AS
SELECT id, employee_id, effective_from FROM employee_compensation
WHERE status::text IN ('ACTIVE', 'SUPERSEDED') AND effective_from > current_date;

UPDATE employee_compensation SET status = 'DRAFT', effective_to = NULL, submitted_by = NULL, submitted_at = NULL, decided_by = NULL, decided_at = NULL, updated_at = now()
WHERE id IN (SELECT id FROM early_package e WHERE e.effective_from > (SELECT min(f.effective_from) FROM early_package f WHERE f.employee_id = e.employee_id));
UPDATE employee_compensation SET status = 'SCHEDULED', updated_at = now()
WHERE id IN (SELECT id FROM early_package e WHERE e.effective_from = (SELECT min(f.effective_from) FROM early_package f WHERE f.employee_id = e.employee_id));
UPDATE employee_compensation c SET status = 'ACTIVE', effective_to = NULL, updated_at = now()
WHERE c.status::text = 'SUPERSEDED' AND c.effective_from <= current_date
  AND EXISTS (SELECT 1 FROM early_package e WHERE e.employee_id = c.employee_id AND c.effective_to = e.effective_from - 1)
  AND NOT EXISTS (SELECT 1 FROM employee_compensation a WHERE a.employee_id = c.employee_id AND a.status::text = 'ACTIVE');

ALTER TABLE employee_compensation ENABLE TRIGGER compensation_package_update_delete;
