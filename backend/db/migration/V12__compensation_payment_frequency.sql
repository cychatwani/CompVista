-- Payment frequency per package item. fixed_amount / percentage are per payment.
--   resolved_amount          amount of each payment
--   annual_amount            resolved_amount x payments per year (0 for ONE_TIME)
--   resolved_monthly_amount  monthly equivalent (annual_amount / 12); kept for reporting
-- ONE_TIME payments sit outside recurring CTC. Basic Salary is always MONTHLY.
CREATE TYPE compensation_frequency AS ENUM ('MONTHLY', 'QUARTERLY', 'TRIANNUAL', 'HALF_YEARLY', 'ANNUAL', 'ONE_TIME');

ALTER TABLE employee_compensation_item
  ADD COLUMN frequency compensation_frequency NOT NULL DEFAULT 'MONTHLY',
  ADD COLUMN resolved_amount NUMERIC(20,4),
  ADD COLUMN annual_amount NUMERIC(20,4);

-- Every existing item is monthly. The immutability trigger is paused only for this backfill.
ALTER TABLE employee_compensation_item DISABLE TRIGGER compensation_item_insert_update;
UPDATE employee_compensation_item
  SET resolved_amount = resolved_monthly_amount, annual_amount = resolved_monthly_amount * 12;
ALTER TABLE employee_compensation_item ENABLE TRIGGER compensation_item_insert_update;

ALTER TABLE employee_compensation_item
  ALTER COLUMN resolved_amount SET NOT NULL,
  ALTER COLUMN annual_amount SET NOT NULL,
  ADD CONSTRAINT compensation_item_amounts_nonnegative CHECK (resolved_amount >= 0 AND annual_amount >= 0);

-- V10 guard plus: Basic Salary must be monthly.
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
  IF definition_basic AND (NEW.calculation_type <> 'FIXED' OR NEW.fixed_amount <= 0 OR NEW.frequency <> 'MONTHLY') THEN
    RAISE EXCEPTION 'Basic Salary must be positive, fixed, and monthly';
  END IF;
  RETURN NEW;
END $$;
