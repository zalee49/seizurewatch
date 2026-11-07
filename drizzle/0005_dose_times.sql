CREATE TABLE "dose_times" (
	"day" date NOT NULL,
	"usual_minute" integer NOT NULL,
	"given_minute" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "dose_times_day_usual_minute_pk" PRIMARY KEY("day","usual_minute"),
	CONSTRAINT "dose_times_usual_minute_check" CHECK ("dose_times"."usual_minute" between 0 and 1439),
	CONSTRAINT "dose_times_given_minute_check" CHECK ("dose_times"."given_minute" between 0 and 1439)
);
