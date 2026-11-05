import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { DoseLine } from "@/lib/validation/medication";

// created_at / updated_at have no SQL default: the data functions always set
// them from a JS `new Date()` so the `updatedAt` a form sends back compares
// equal at millisecond precision.
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
};

const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const profile = pgTable(
  "profile",
  {
    id: integer("id").primaryKey(),
    name: text("name"),
    breed: text("breed"),
    diagnosis: text("diagnosis"),
    vetName: text("vet_name"),
    vetPhone: text("vet_phone"),
    emergencyVetName: text("emergency_vet_name"),
    emergencyVetPhone: text("emergency_vet_phone"),
    allergies: text("allergies"),
    notes: text("notes"),
    birthday: date("birthday", { mode: "string" }),
    firstSeizureDate: date("first_seizure_date", { mode: "string" }),
    weightAmount: numeric("weight_amount", { precision: 6, scale: 2 }),
    weightUnit: text("weight_unit"),
    ...timestamps,
  },
  (table) => [
    check("profile_id_check", sql`${table.id} = 1`),
    check("profile_weight_unit_check", sql`${table.weightUnit} in ('lb', 'kg')`),
  ],
);

// `id` is supplied by the client (V2.1), so it has no database default.
export const seizures = pgTable(
  "seizures",
  {
    id: uuid("id").primaryKey(),
    startedAt: timestamptz("started_at").notNull(),
    endedAt: timestamptz("ended_at"),
    seizureType: text("seizure_type"),
    severity: text("severity"),
    beforeSymptoms: text("before_symptoms"),
    afterSymptoms: text("after_symptoms"),
    triggers: text("triggers"),
    notes: text("notes"),
    recoveryMinutes: integer("recovery_minutes"),
    ...timestamps,
  },
  (table) => [
    check("seizures_ended_after_started_check", sql`${table.endedAt} > ${table.startedAt}`),
    check(
      "seizures_seizure_type_check",
      sql`${table.seizureType} in ('generalized', 'focal', 'focal_to_generalized', 'unsure')`,
    ),
    check(
      "seizures_severity_check",
      sql`${table.severity} in ('mild', 'moderate', 'severe')`,
    ),
    index("seizures_started_at_idx").on(table.startedAt),
  ],
);

export const seizureResponses = pgTable(
  "seizure_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seizureId: uuid("seizure_id")
      .notNull()
      .references(() => seizures.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    medicationName: text("medication_name"),
    doseAmount: numeric("dose_amount", { precision: 10, scale: 3 }),
    doseUnit: text("dose_unit"),
    givenAt: timestamptz("given_at"),
    description: text("description"),
    ...timestamps,
  },
  (table) => [
    check("seizure_responses_kind_check", sql`${table.kind} in ('rescue_med', 'other')`),
  ],
);

export const medicationPeriods = pgTable(
  "medication_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drugName: text("drug_name").notNull(),
    role: text("role").notNull(),
    // One or more doses, each at its own time of day, in the order entered; all in `doseUnit`.
    doses: jsonb("doses").$type<DoseLine[]>().notNull(),
    doseUnit: text("dose_unit").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    // Exclusive; null = ongoing.
    endDate: date("end_date", { mode: "string" }),
    note: text("note"),
    ...timestamps,
  },
  (table) => [
    check("medication_periods_role_check", sql`${table.role} in ('maintenance', 'rescue')`),
    check("medication_periods_end_after_start_check", sql`${table.endDate} > ${table.startDate}`),
    check(
      "medication_periods_doses_check",
      sql`jsonb_typeof(${table.doses}) = 'array' and jsonb_array_length(${table.doses}) >= 1`,
    ),
  ],
);

export const bloodDraws = pgTable("blood_draws", {
  id: uuid("id").primaryKey().defaultRandom(),
  drawnAt: timestamptz("drawn_at").notNull(),
  lab: text("lab"),
  notes: text("notes"),
  ...timestamps,
});

export const bloodResults = pgTable("blood_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  drawId: uuid("draw_id")
    .notNull()
    .references(() => bloodDraws.id, { onDelete: "cascade" }),
  testName: text("test_name").notNull(),
  value: numeric("value", { precision: 12, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  rangeLow: numeric("range_low", { precision: 12, scale: 4 }),
  rangeHigh: numeric("range_high", { precision: 12, scale: 4 }),
  sortOrder: integer("sort_order").notNull(),
});
