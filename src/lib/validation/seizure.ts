import { z } from "zod";

export const SEIZURE_TYPES = [
  "generalized",
  "focal",
  "focal_to_generalized",
  "potato_bug",
  "demon",
  "walk_around_blind",
  "unsure",
] as const;
export const SEVERITIES = ["mild", "moderate", "severe"] as const;
export const RESPONSE_KINDS = ["rescue_med", "other"] as const;

export type SeizureType = (typeof SEIZURE_TYPES)[number];
export type Severity = (typeof SEVERITIES)[number];
export type ResponseKind = (typeof RESPONSE_KINDS)[number];

// A seizure can be started up to this far in the future (clock drift between phone and server).
export const MAX_FUTURE_START_MS = 5 * 60 * 1000;
// A seizure longer than this is not recorded; it shows "Duration not recorded" instead.
export const MAX_SEIZURE_SECONDS = 2 * 60 * 60;

// Any 8-4-4-4-12 hex id, like Postgres accepts (zod's `uuid()` also checks version bits).
export const idSchema = z.guid({ error: "Not a valid id" });

const dateTime = (message: string) => z.date({ error: message });
const optionalText = z
  .string({ error: "Enter text" })
  .max(5000, { error: "Keep this under 5000 characters" })
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  });

export const startSeizureSchema = z.object({
  id: idSchema,
  startedAt: dateTime("Enter a valid date and time"),
});

export const seizureDetailsSchema = z.object({
  startedAt: dateTime("Enter a valid date and time").optional(),
  endedAt: dateTime("Enter a valid date and time").nullish(),
  durationSeconds: z
    .number({ error: "Enter a number" })
    .int({ error: "Enter whole seconds" })
    .positive({ error: "Duration must be more than zero" })
    .nullish(),
  seizureType: z.enum(SEIZURE_TYPES, { error: "Choose a type from the list" }).nullish().transform((v) => v ?? null),
  severity: z.enum(SEVERITIES, { error: "Choose a severity from the list" }).nullish().transform((v) => v ?? null),
  beforeSymptoms: optionalText,
  afterSymptoms: optionalText,
  triggers: optionalText,
  notes: optionalText,
  recoveryMinutes: z
    .number({ error: "Enter a number" })
    .int({ error: "Enter whole minutes" })
    .min(0, { error: "Can't be negative" })
    .max(10080, { error: "Enter 10080 minutes (one week) or less" })
    .nullish()
    .transform((v) => v ?? null),
});
export type SeizureDetailsInput = z.input<typeof seizureDetailsSchema>;
export type SeizureDetails = z.output<typeof seizureDetailsSchema>;

export const responseSchema = z
  .object({
    kind: z.enum(RESPONSE_KINDS, { error: "Choose Rescue med or Other" }),
    medicationName: optionalText,
    doseAmount: z
      .number({ error: "Enter a number" })
      .positive({ error: "Dose must be more than zero" })
      .max(9_999_999, { error: "Dose is too large" })
      .nullish()
      .transform((v) => v ?? null),
    doseUnit: optionalText,
    givenAt: dateTime("Enter a valid date and time").nullish().transform((v) => v ?? null),
    description: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.kind === "rescue_med" && !value.medicationName) {
      ctx.addIssue({ code: "custom", path: ["medicationName"], message: "Enter the medication name" });
    }
    if (value.kind === "other" && !value.description) {
      ctx.addIssue({ code: "custom", path: ["description"], message: "Describe what you did" });
    }
  });
export type ResponseInput = z.input<typeof responseSchema>;
export type ResponseDetails = z.output<typeof responseSchema>;

// First message per top-level field, for showing next to each input.
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] ??= issue.message;
  }
  return fieldErrors;
}
