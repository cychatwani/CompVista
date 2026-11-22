-- Granular "return for changes": an approver can flag individual components (or the effective
-- date) with a note each. Stored on the package as a JSON array of
--   { "target": "component" | "effectiveFrom", "componentDefinitionId": uuid | null, "label": text, "note": text }
-- and cleared when the draft is submitted again.
ALTER TABLE employee_compensation ADD COLUMN change_requests JSONB
  CHECK (change_requests IS NULL OR (jsonb_typeof(change_requests) = 'array' AND jsonb_array_length(change_requests) <= 50));
