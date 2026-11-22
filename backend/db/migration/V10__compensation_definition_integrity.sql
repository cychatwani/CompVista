-- Keep catalog identifiers stable and close the deactivation/write race.
CREATE FUNCTION compensation_definition_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id <> OLD.organization_id OR NEW.code <> OLD.code
    OR NEW.category <> OLD.category OR NEW.is_basic <> OLD.is_basic THEN
    RAISE EXCEPTION 'Compensation definition identity is immutable';
  END IF;
  IF OLD.is_basic AND NOT NEW.is_active THEN
    RAISE EXCEPTION 'Basic Salary cannot be deactivated';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compensation_definition_update BEFORE UPDATE ON compensation_component_definition
  FOR EACH ROW EXECUTE FUNCTION compensation_definition_guard();

CREATE OR REPLACE FUNCTION compensation_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE package_status compensation_status; package_org TEXT; definition_org TEXT; definition_basic BOOLEAN; definition_active BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND (SELECT status FROM employee_compensation WHERE id = OLD.compensation_id) <> 'DRAFT' THEN
    RAISE EXCEPTION 'Applied compensation is immutable';
  END IF;
  SELECT status, organization_id INTO package_status, package_org FROM employee_compensation WHERE id = NEW.compensation_id FOR UPDATE;
  IF package_status <> 'DRAFT' THEN RAISE EXCEPTION 'Applied compensation is immutable'; END IF;
  SELECT organization_id, is_basic, is_active INTO definition_org, definition_basic, definition_active
    FROM compensation_component_definition WHERE id = NEW.component_definition_id FOR SHARE;
  IF package_org <> definition_org THEN RAISE EXCEPTION 'Component belongs to another organization'; END IF;
  IF NOT definition_active THEN RAISE EXCEPTION 'Inactive component cannot be added to a package'; END IF;
  IF definition_basic AND (NEW.calculation_type <> 'FIXED' OR NEW.fixed_amount <= 0) THEN
    RAISE EXCEPTION 'Basic Salary must be positive and fixed';
  END IF;
  RETURN NEW;
END $$;
