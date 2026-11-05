import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string({ error: "Enter text" })
    .max(max, { error: `Keep this under ${max} characters` })
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed ? trimmed : null;
    });

// numeric(12,4): four decimal places, under 100 million. More places would be silently rounded
// by the column, so refuse them instead of storing a value different from the one typed.
const labNumber = z
  .number({ error: "Enter a number" })
  .refine(Number.isFinite, { error: "Enter a number" })
  .refine((value) => Math.abs(value) < 100_000_000, { error: "This number is too large" })
  // Exact: a typed value with at most 4 places is the same double as its ten-thousandths divided by 10000.
  .refine((value) => Math.round(value * 10_000) / 10_000 === value, { error: "Enter at most 4 decimal places" });

// One result row as the form sent it: any field may be blank (null or undefined).
const resultRowSchema = z.object({
  testName: optionalText(200),
  value: labNumber.nullish().transform((value) => value ?? null),
  unit: optionalText(50),
  rangeLow: labNumber.nullish().transform((value) => value ?? null),
  rangeHigh: labNumber.nullish().transform((value) => value ?? null),
});
export type BloodResultInput = z.input<typeof resultRowSchema>;
type ResultRow = z.output<typeof resultRowSchema>;

function isEmptyRow(row: ResultRow): boolean {
  return Object.values(row).every((value) => value === null);
}

// Two results are the same test when name and unit match ignoring case and surrounding spaces.
export function trendKey(testName: string, unit: string): string {
  return `${testName.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;
}

export const bloodDrawSchema = z
  .object({
    drawnAt: z.date({ error: "Enter the date and time drawn" }),
    lab: optionalText(200),
    notes: optionalText(5000),
    results: z.array(resultRowSchema, { error: "Add at least one result" }).max(200, { error: "Too many result rows" }),
  })
  .superRefine((draw, ctx) => {
    const seen = new Map<string, number>();
    draw.results.forEach((row, index) => {
      if (isEmptyRow(row)) return;
      const issue = (field: string, message: string) => ctx.addIssue({ code: "custom", path: ["results", index, field], message });
      if (row.testName === null) issue("testName", "Enter the test name");
      if (row.value === null) issue("value", "Enter the value");
      if (row.unit === null) issue("unit", "Enter the unit");
      if (row.rangeLow !== null && row.rangeHigh !== null && row.rangeLow > row.rangeHigh) {
        issue("rangeLow", "The low end of the range is above the high end");
      }
      if (row.testName !== null && row.unit !== null) {
        const key = trendKey(row.testName, row.unit);
        const first = seen.get(key);
        if (first === undefined) seen.set(key, index);
        else issue("testName", `This test is already in row ${first + 1}`);
      }
    });
    if (draw.results.every(isEmptyRow)) {
      ctx.addIssue({ code: "custom", path: ["results"], message: "Add at least one result" });
    }
  })
  // Fully empty rows are dropped; what's left is stored in this order.
  .transform((draw) => ({
    ...draw,
    results: draw.results
      .filter((row) => !isEmptyRow(row))
      .map((row) => ({ ...row, testName: row.testName as string, value: row.value as number, unit: row.unit as string })),
  }));
export type BloodDrawInput = z.input<typeof bloodDrawSchema>;
export type ParsedDraw = z.output<typeof bloodDrawSchema>;

// First message per field. A result row's field is keyed `results.<row index>.<field>`, with the
// index of the row as the form sent it (empty rows included), so the form can mark that row.
export function bloodworkFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const [first, index, field] = issue.path;
    const key = first === "results" && typeof index === "number" && field !== undefined
      ? `results.${index}.${String(field)}`
      : String(first ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}

// "Check result row 2." when only result rows have problems (naming the first), else the general message.
export function bloodworkErrorMessage(fieldErrors: Record<string, string>): string {
  const keys = Object.keys(fieldErrors);
  const rowKeys = keys.filter((key) => /^results\.\d+\./.test(key));
  if (rowKeys.length > 0 && rowKeys.length === keys.length) {
    const rows = rowKeys.map((key) => Number(key.split(".")[1]));
    return `Check result row ${Math.min(...rows) + 1}.`;
  }
  return "Check the fields marked below.";
}
