CREATE TABLE "blood_draws" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drawn_at" timestamp with time zone NOT NULL,
	"lab" text,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blood_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"draw_id" uuid NOT NULL,
	"test_name" text NOT NULL,
	"value" numeric(12, 4) NOT NULL,
	"unit" text NOT NULL,
	"range_low" numeric(12, 4),
	"range_high" numeric(12, 4),
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drug_name" text NOT NULL,
	"role" text NOT NULL,
	"dose_amount" numeric(10, 3) NOT NULL,
	"dose_unit" text NOT NULL,
	"schedule" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "medication_periods_role_check" CHECK ("medication_periods"."role" in ('maintenance', 'rescue')),
	CONSTRAINT "medication_periods_end_after_start_check" CHECK ("medication_periods"."end_date" > "medication_periods"."start_date")
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text,
	"breed" text,
	"diagnosis" text,
	"vet_name" text,
	"vet_phone" text,
	"emergency_vet_name" text,
	"emergency_vet_phone" text,
	"allergies" text,
	"notes" text,
	"birthday" date,
	"first_seizure_date" date,
	"weight_amount" numeric(6, 2),
	"weight_unit" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_id_check" CHECK ("profile"."id" = 1),
	CONSTRAINT "profile_weight_unit_check" CHECK ("profile"."weight_unit" in ('lb', 'kg'))
);
--> statement-breakpoint
CREATE TABLE "seizure_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seizure_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"medication_name" text,
	"dose_amount" numeric(10, 3),
	"dose_unit" text,
	"given_at" timestamp with time zone,
	"description" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "seizure_responses_kind_check" CHECK ("seizure_responses"."kind" in ('rescue_med', 'other'))
);
--> statement-breakpoint
CREATE TABLE "seizures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"seizure_type" text,
	"severity" text,
	"before_symptoms" text,
	"after_symptoms" text,
	"triggers" text,
	"notes" text,
	"recovery_minutes" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "seizures_ended_after_started_check" CHECK ("seizures"."ended_at" > "seizures"."started_at"),
	CONSTRAINT "seizures_seizure_type_check" CHECK ("seizures"."seizure_type" in ('generalized', 'focal', 'focal_to_generalized', 'unsure')),
	CONSTRAINT "seizures_severity_check" CHECK ("seizures"."severity" in ('mild', 'moderate', 'severe'))
);
--> statement-breakpoint
ALTER TABLE "blood_results" ADD CONSTRAINT "blood_results_draw_id_blood_draws_id_fk" FOREIGN KEY ("draw_id") REFERENCES "public"."blood_draws"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seizure_responses" ADD CONSTRAINT "seizure_responses_seizure_id_seizures_id_fk" FOREIGN KEY ("seizure_id") REFERENCES "public"."seizures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seizures_started_at_idx" ON "seizures" USING btree ("started_at");