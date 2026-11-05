import { z } from "zod";
import { dayKeySchema } from "./medication";

export const WEIGHT_UNITS = ["lb", "kg"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

// Blank is "not entered": stored as null.
const optionalText = (max: number) =>
  z
    .string({ error: "Enter text" })
    .max(max, { error: `Keep this under ${max} characters` })
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    });

const shortText = optionalText(200);
const phone = optionalText(50);
const longText = optionalText(5000);

const optionalDay = dayKeySchema.nullish().transform((value) => value ?? null);

// numeric(6,2): two decimal places, under 10000. More places would be silently rounded by the
// column, so refuse them instead of storing a weight different from the one typed.
const weightAmount = z
  .number({ error: "Enter the weight as a number" })
  .gt(0, { error: "Weight must be more than zero" })
  .lt(10000, { error: "Weight is too large" })
  // Exact: a typed value with at most 2 places is the same double as its hundredths divided by 100.
  .refine((value) => Math.round(value * 100) / 100 === value, {
    error: "Enter at most 2 decimal places",
  })
  .nullish()
  .transform((value) => value ?? null);

export const profileSchema = z
  .object({
    name: shortText,
    breed: shortText,
    birthday: optionalDay,
    weightAmount,
    weightUnit: z
      .enum(WEIGHT_UNITS, { error: "Choose lb or kg" })
      .nullish()
      .transform((value) => value ?? null),
    diagnosis: longText,
    firstSeizureDate: optionalDay,
    vetName: shortText,
    vetPhone: phone,
    emergencyVetName: shortText,
    emergencyVetPhone: phone,
    allergies: longText,
    notes: longText,
  })
  .superRefine((value, ctx) => {
    if (value.weightAmount !== null && value.weightUnit === null) {
      ctx.addIssue({ code: "custom", path: ["weightUnit"], message: "Choose lb or kg" });
    }
  })
  // A unit with no amount means no weight.
  .transform((value) => (value.weightAmount === null ? { ...value, weightUnit: null } : value));
export type ProfileInput = z.input<typeof profileSchema>;
