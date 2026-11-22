-- How a component is normally paid. Packages copy it as the starting value and can override it per item.
ALTER TABLE compensation_component_definition
  ADD COLUMN default_frequency compensation_frequency NOT NULL DEFAULT 'MONTHLY',
  ADD CONSTRAINT basic_definition_is_monthly CHECK (NOT is_basic OR default_frequency = 'MONTHLY'),
  ADD CONSTRAINT deduction_definition_recurring CHECK (category <> 'EMPLOYEE_DEDUCTION' OR default_frequency <> 'ONE_TIME');
