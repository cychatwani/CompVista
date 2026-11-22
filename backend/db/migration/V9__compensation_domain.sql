-- Compensation amounts are canonical monthly values. Applied packages are immutable.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE compensation_category AS ENUM ('EARNING', 'EMPLOYER_CONTRIBUTION', 'EMPLOYEE_DEDUCTION');
CREATE TYPE compensation_status AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');
CREATE TYPE compensation_calculation_type AS ENUM ('FIXED', 'PERCENTAGE_OF_BASE');

CREATE TABLE currency (
  code CHAR(3) PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimal_places SMALLINT NOT NULL CHECK (decimal_places BETWEEN 0 AND 4),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO currency (code, name, symbol, decimal_places) VALUES
  ('INR', 'Indian Rupee', '₹', 2), ('USD', 'US Dollar', '$', 2),
  ('EUR', 'Euro', '€', 2), ('GBP', 'Pound Sterling', '£', 2),
  ('AED', 'UAE Dirham', 'د.إ', 2), ('SGD', 'Singapore Dollar', 'S$', 2),
  ('AUD', 'Australian Dollar', 'A$', 2), ('CAD', 'Canadian Dollar', 'C$', 2);

ALTER TABLE employee ADD CONSTRAINT employee_id_organization_key UNIQUE (id, "organizationId");

CREATE TABLE compensation_component_definition (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  category compensation_category NOT NULL,
  is_basic BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  UNIQUE (id, organization_id),
  CHECK (NOT is_basic OR category = 'EARNING')
);
CREATE UNIQUE INDEX one_basic_definition_per_organization
  ON compensation_component_definition (organization_id) WHERE is_basic;

CREATE TABLE employee_compensation (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
  employee_id TEXT NOT NULL,
  currency_code CHAR(3) NOT NULL REFERENCES currency(code) ON DELETE RESTRICT,
  status compensation_status NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by TEXT NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (employee_id, organization_id) REFERENCES employee(id, "organizationId") ON DELETE RESTRICT,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
CREATE INDEX employee_compensation_employee_idx ON employee_compensation (organization_id, employee_id, created_at DESC);
CREATE UNIQUE INDEX one_active_compensation_per_employee ON employee_compensation (employee_id) WHERE status = 'ACTIVE';
ALTER TABLE employee_compensation ADD CONSTRAINT no_overlapping_applied_compensation
  EXCLUDE USING gist (employee_id WITH =, daterange(effective_from, effective_to, '[]') WITH &&)
  WHERE (status IN ('ACTIVE', 'SUPERSEDED'));

CREATE TABLE employee_compensation_item (
  id UUID PRIMARY KEY,
  compensation_id UUID NOT NULL REFERENCES employee_compensation(id) ON DELETE CASCADE,
  component_definition_id UUID NOT NULL REFERENCES compensation_component_definition(id) ON DELETE RESTRICT,
  calculation_type compensation_calculation_type NOT NULL,
  fixed_amount NUMERIC(20,4),
  percentage NUMERIC(9,4),
  resolved_monthly_amount NUMERIC(20,4) NOT NULL CHECK (resolved_monthly_amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (compensation_id, component_definition_id),
  CHECK ((calculation_type = 'FIXED' AND fixed_amount IS NOT NULL AND fixed_amount >= 0 AND percentage IS NULL)
    OR (calculation_type = 'PERCENTAGE_OF_BASE' AND percentage IS NOT NULL AND percentage BETWEEN 0 AND 1000 AND fixed_amount IS NULL))
);

CREATE FUNCTION compensation_item_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE package_status compensation_status; package_org TEXT; definition_org TEXT; definition_basic BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND (SELECT status FROM employee_compensation WHERE id = OLD.compensation_id) <> 'DRAFT' THEN
    RAISE EXCEPTION 'Applied compensation is immutable';
  END IF;
  SELECT status, organization_id INTO package_status, package_org FROM employee_compensation WHERE id = NEW.compensation_id FOR UPDATE;
  IF package_status <> 'DRAFT' THEN RAISE EXCEPTION 'Applied compensation is immutable'; END IF;
  SELECT organization_id, is_basic INTO definition_org, definition_basic FROM compensation_component_definition WHERE id = NEW.component_definition_id;
  IF package_org <> definition_org THEN RAISE EXCEPTION 'Component belongs to another organization'; END IF;
  IF definition_basic AND (NEW.calculation_type <> 'FIXED' OR NEW.fixed_amount <= 0) THEN
    RAISE EXCEPTION 'Basic Salary must be positive and fixed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compensation_item_insert_update BEFORE INSERT OR UPDATE ON employee_compensation_item
  FOR EACH ROW EXECUTE FUNCTION compensation_item_guard();

CREATE FUNCTION compensation_item_delete_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT status FROM employee_compensation WHERE id = OLD.compensation_id) <> 'DRAFT' THEN
    RAISE EXCEPTION 'Applied compensation is immutable';
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER compensation_item_delete BEFORE DELETE ON employee_compensation_item
  FOR EACH ROW EXECUTE FUNCTION compensation_item_delete_guard();

CREATE FUNCTION compensation_package_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Applied compensation is immutable'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.organization_id <> OLD.organization_id OR NEW.employee_id <> OLD.employee_id OR NEW.created_by <> OLD.created_by) THEN
    RAISE EXCEPTION 'Package ownership is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compensation_package_update_delete BEFORE UPDATE OR DELETE ON employee_compensation
  FOR EACH ROW EXECUTE FUNCTION compensation_package_guard();

CREATE FUNCTION active_package_requires_basic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM employee_compensation_item item
    JOIN compensation_component_definition definition ON definition.id = item.component_definition_id
    WHERE item.compensation_id = NEW.id AND definition.is_basic
      AND item.calculation_type = 'FIXED' AND item.fixed_amount > 0
  ) THEN RAISE EXCEPTION 'Active compensation requires a positive fixed Basic Salary'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER compensation_activation_check AFTER INSERT OR UPDATE OF status ON employee_compensation
  FOR EACH ROW WHEN (NEW.status = 'ACTIVE') EXECUTE FUNCTION active_package_requires_basic();

-- Existing seeded organizations receive the initial catalog; seed:dev handles later-created ones.
INSERT INTO compensation_component_definition (id, organization_id, code, name, category, is_basic)
SELECT gen_random_uuid(), o.id, v.code, v.name, v.category::compensation_category, v.is_basic
FROM organization o CROSS JOIN (VALUES
  ('BASIC', 'Basic Salary', 'EARNING', TRUE),
  ('HRA', 'House Rent Allowance', 'EARNING', FALSE),
  ('SPECIAL', 'Special Allowance', 'EARNING', FALSE),
  ('EMPLOYER_PF', 'Employer PF', 'EMPLOYER_CONTRIBUTION', FALSE),
  ('EMPLOYEE_PF', 'Employee PF', 'EMPLOYEE_DEDUCTION', FALSE)
) AS v(code, name, category, is_basic)
WHERE o.slug = 'bandwidth-holdings'
ON CONFLICT (organization_id, code) DO NOTHING;
