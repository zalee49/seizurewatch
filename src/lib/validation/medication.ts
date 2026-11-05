import { z } from "zod";

export const MEDICATION_ROLES = ["maintenance", "rescue"] as const;
export type MedicationRole = (typeof MEDICATION_ROLES)[number];

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

// A real calendar date as YYYY-MM-DD (rejects 2026-02-30).
function isDayKey(value: string): boolean {
  const match = DAY_KEY.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export const dayKeySchema = z.string({ error: "Enter a date" }).refine(isDayKey, { error: "Enter a valid date" });

const requiredText = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, { error: message })
    .max(200, { error: "Keep this under 200 characters" });

const optionalNote = z
  .string({ error: "Enter text" })
  .max(5000, { error: "Keep this under 5000 characters" })
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

// numeric(10,3): three decimal places, under 10 million. More places would be silently
// rounded by the column, so refuse them instead of storing a dose different from the one typed.
const doseAmount = z
  .number({ error: "Enter the dose as a number" })
  .min(0.001, { error: "Dose must be more than zero" })
  .max(9_999_999, { error: "Dose is too large" })
  // Exact: a typed value with at most 3 places is the same double as its thousandths divided by 1000.
  .refine((value) => Math.round(value * 1000) / 1000 === value, {
    error: "Enter at most 3 decimal places",
  });

export const MAX_DOSE_TIMES = 8;

// One dose row as the form sent it: either field may be blank (null or undefined).
const doseRowSchema = z.object({
  amount: doseAmount.nullish().transform((value) => value ?? null),
  when: z
    .string({ error: "Enter text" })
    .max(200, { error: "Keep this under 200 characters" })
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    }),
});
type DoseRow = z.output<typeof doseRowSchema>;

// One dose given at one time of day, like 500 at "morning" (the unit is the period's).
export type DoseLine = { amount: number; when: string };

const isBlankRow = (row: DoseRow) => row.amount === null && row.when === null;

// Rows are checked by their index as sent (blank rows included), so the form can mark that row.
// Blank rows are then dropped; the rest are stored in this order.
const dosesSchema = z
  .array(doseRowSchema, { error: "Enter the dose" })
  .max(MAX_DOSE_TIMES, { error: `Keep this to ${MAX_DOSE_TIMES} times a day or fewer` })
  .superRefine((rows, ctx) => {
    const seen = new Map<string, number>();
    rows.forEach((row, index) => {
      if (isBlankRow(row)) return;
      const issue = (field: keyof DoseRow, message: string) => ctx.addIssue({ code: "custom", path: [index, field], message });
      if (row.amount === null) issue("amount", "Enter the dose");
      if (row.when === null) {
        issue("when", "Enter when it's given, like morning");
        return;
      }
      const key = row.when.toLowerCase();
      const first = seen.get(key);
      if (first === undefined) seen.set(key, index);
      else issue("when", `This time is already in row ${first + 1}`);
    });
    if (rows.every(isBlankRow)) ctx.addIssue({ code: "custom", path: [0, "amount"], message: "Enter the dose" });
  })
  .transform((rows): DoseLine[] =>
    rows.filter((row) => !isBlankRow(row)).map((row) => ({ amount: row.amount as number, when: row.when as string })),
  );

export const doseSchema = z.object({
  doses: dosesSchema,
  doseUnit: requiredText("Enter the unit, like mg"),
  note: optionalNote,
});
export type DoseInput = z.input<typeof doseSchema>;

export const startMedicationSchema = doseSchema.extend({
  drugName: requiredText("Enter the medication name"),
  role: z.enum(MEDICATION_ROLES, { error: "Choose Daily or Rescue" }),
  startDate: dayKeySchema,
});
export type StartMedicationInput = z.input<typeof startMedicationSchema>;

export const correctPeriodSchema = startMedicationSchema
  .extend({
    endDate: dayKeySchema.nullish().transform((value) => value ?? null),
  })
  .superRefine((value, ctx) => {
    // Day keys compare correctly as strings.
    if (value.endDate !== null && value.endDate <= value.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "The end date must be after the start date" });
    }
  });
export type CorrectPeriodInput = z.input<typeof correctPeriodSchema>;

// First message per field. A dose row's field is keyed `doses.<row index>.<field>`.
export function medicationFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "form";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}
