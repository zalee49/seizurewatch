ALTER TABLE "medication_periods" ALTER COLUMN "doses" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "medication_periods" DROP COLUMN "dose_amount";--> statement-breakpoint
ALTER TABLE "medication_periods" DROP COLUMN "schedule";--> statement-breakpoint
ALTER TABLE "medication_periods" ADD CONSTRAINT "medication_periods_doses_check" CHECK (jsonb_typeof("medication_periods"."doses") = 'array' and jsonb_array_length("medication_periods"."doses") >= 1);