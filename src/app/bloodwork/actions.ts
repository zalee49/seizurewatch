"use server";

import { revalidatePath } from "next/cache";
import { createDraw, deleteDraw, updateDraw, type BloodDraw } from "@/lib/data/bloodwork";
import type { SaveResult } from "@/lib/data/result";
import { getDb } from "@/lib/db/client";
import { parseHouseholdDateTime } from "@/lib/time";
import type { BloodDrawInput } from "@/lib/validation/bloodwork";
import { idSchema } from "@/lib/validation/seizure";

// Form fields: `drawnAt` (datetime-local, household time), `lab`, `notes`, and per result row
// `testName`, `value`, `unit`, `rangeLow`, `rangeHigh`, repeated in row order. Every row must
// render all five inputs so the repeated values line up by index. Edit forms add hidden `id` and
// `expectedUpdatedAt` (ISO).

type DrawResult = SaveResult<BloodDraw>;

const NOT_SAVED = "Nothing was saved.";

function outOfDate(): SaveResult<never> {
  return { ok: false, error: "invalid", message: `This form is out of date. Reload the page. ${NOT_SAVED}` };
}

function done<T>(result: SaveResult<T>): SaveResult<T> {
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

// A blank field is "not entered" (undefined); the schema decides what that means.
function blankToUndefined(value: FormDataEntryValue | null | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

// A typed number that doesn't parse becomes NaN, which the schema refuses as "Enter a number".
function toNumber(value: FormDataEntryValue | undefined): number | undefined {
  const text = blankToUndefined(value);
  return text === undefined ? undefined : Number(text);
}

function drawInput(formData: FormData): BloodDrawInput {
  const drawnAt = blankToUndefined(formData.get("drawnAt"));
  const names = formData.getAll("testName");
  const values = formData.getAll("value");
  const units = formData.getAll("unit");
  const lows = formData.getAll("rangeLow");
  const highs = formData.getAll("rangeHigh");
  const rowCount = Math.max(names.length, values.length, units.length, lows.length, highs.length);
  return {
    // Missing or malformed becomes an invalid Date, which the schema refuses with a field error.
    drawnAt: (drawnAt && parseHouseholdDateTime(drawnAt)) || new Date(NaN),
    lab: blankToUndefined(formData.get("lab")),
    notes: blankToUndefined(formData.get("notes")),
    results: Array.from({ length: rowCount }, (_, index) => ({
      testName: blankToUndefined(names[index]),
      value: toNumber(values[index]),
      unit: blankToUndefined(units[index]),
      rangeLow: toNumber(lows[index]),
      rangeHigh: toNumber(highs[index]),
    })),
  };
}

export async function createDrawAction(_prev: DrawResult | null, formData: FormData): Promise<DrawResult> {
  return done(await createDraw(getDb(), drawInput(formData)));
}

export async function updateDrawAction(_prev: DrawResult | null, formData: FormData): Promise<DrawResult> {
  const id = formData.get("id");
  const expected = formData.get("expectedUpdatedAt");
  if (typeof id !== "string" || !idSchema.safeParse(id).success || typeof expected !== "string") return outOfDate();
  const expectedUpdatedAt = new Date(expected);
  if (Number.isNaN(expectedUpdatedAt.getTime())) return outOfDate();
  return done(await updateDraw(getDb(), id, expectedUpdatedAt, drawInput(formData)));
}

export async function deleteDrawAction(id: string): Promise<SaveResult<{ id: string }>> {
  return done(await deleteDraw(getDb(), id));
}
