-- Every existing period becomes one dose line: its amount at its schedule ("60" at "twice daily").
UPDATE "medication_periods"
SET "doses" = jsonb_build_array(jsonb_build_object('amount', trim_scale("dose_amount"), 'when', "schedule"))
WHERE "doses" IS NULL;
