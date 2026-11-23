-- Organizational structure: global countries (each with a default currency) and
-- organization-owned departments, plus the employee attributes the directory and
-- analytics need. Employee profiles no longer require a login: most of a large
-- workforce exists only as domain records.

CREATE TABLE country (
  code CHAR(2) PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),
  name TEXT NOT NULL UNIQUE,
  currency_code CHAR(3) NOT NULL REFERENCES currency(code) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO country (code, name, currency_code) VALUES
  ('IN', 'India', 'INR'), ('US', 'United States', 'USD'), ('GB', 'United Kingdom', 'GBP'),
  ('DE', 'Germany', 'EUR'), ('AE', 'United Arab Emirates', 'AED'), ('SG', 'Singapore', 'SGD');

CREATE TABLE department (
  id UUID PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  code TEXT NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{1,31}$'),
  description TEXT CHECK (description IS NULL OR length(description) <= 500),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code),
  -- Target of the employee composite key, so a department always belongs to the employee's organization.
  UNIQUE (id, organization_id)
);
CREATE UNIQUE INDEX department_org_name_key ON department (organization_id, lower(name));

-- Every existing organization starts with the standard six departments.
INSERT INTO department (id, organization_id, name, code)
SELECT gen_random_uuid(), o.id, d.name, d.code
FROM organization o CROSS JOIN (VALUES
  ('Engineering', 'ENGINEERING'), ('Product', 'PRODUCT'), ('Sales & Marketing', 'SALES_MARKETING'),
  ('Finance', 'FINANCE'), ('Human Resources', 'HUMAN_RESOURCES'), ('Operations', 'OPERATIONS')
) AS d(name, code);

ALTER TABLE employee ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE employee
  ADD COLUMN "employeeCode" TEXT CHECK ("employeeCode" IS NULL OR "employeeCode" ~ '^[A-Z0-9-]{3,32}$'),
  ADD COLUMN email TEXT CHECK (email IS NULL OR (length(email) <= 254 AND email ~ '^[^@\s]+@[^@\s]+$')),
  ADD COLUMN "departmentId" UUID,
  ADD COLUMN "countryCode" CHAR(2) REFERENCES country(code) ON DELETE RESTRICT,
  ADD COLUMN "jobTitle" TEXT CHECK ("jobTitle" IS NULL OR length(btrim("jobTitle")) BETWEEN 1 AND 120),
  ADD COLUMN "jobLevel" TEXT CHECK ("jobLevel" IS NULL OR "jobLevel" IN ('JUNIOR', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR')),
  ADD COLUMN "employmentStatus" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("employmentStatus" IN ('ACTIVE', 'PROBATION', 'ON_LEAVE', 'NOTICE_PERIOD')),
  ADD COLUMN "hireDate" DATE,
  ADD CONSTRAINT employee_department_same_org FOREIGN KEY ("departmentId", "organizationId")
    REFERENCES department (id, organization_id) ON DELETE RESTRICT;

-- Existing profiles: country defaults to India (every existing package is INR); the login email is copied.
UPDATE employee e SET "countryCode" = 'IN', email = u.email FROM "user" u WHERE u.id = e."userId";
UPDATE employee SET "countryCode" = 'IN' WHERE "countryCode" IS NULL;
ALTER TABLE employee ALTER COLUMN "countryCode" SET NOT NULL;

CREATE UNIQUE INDEX employee_org_code_key ON employee ("organizationId", "employeeCode") WHERE "employeeCode" IS NOT NULL;
CREATE UNIQUE INDEX employee_org_email_key ON employee ("organizationId", lower(email)) WHERE email IS NOT NULL;
CREATE INDEX employee_org_department_idx ON employee ("organizationId", "departmentId");
CREATE INDEX employee_org_country_idx ON employee ("organizationId", "countryCode");

-- Analytics and the directory read one ACTIVE package per employee, filtered by currency.
CREATE INDEX employee_compensation_active_idx ON employee_compensation (organization_id, currency_code, employee_id) WHERE status = 'ACTIVE';
CREATE INDEX employee_compensation_pending_idx ON employee_compensation (organization_id, submitted_at) WHERE status = 'PENDING_APPROVAL';
