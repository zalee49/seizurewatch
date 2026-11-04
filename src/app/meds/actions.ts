"use server";

import { revalidatePath } from "next/cache";
import {
  changeMedication,
  correctPeriod,
  deletePeriod,
  startMedication,
  stopMedication,
} from "@/lib/data/medications";
import type { MedicationPeriod } from "@/lib/data/medications";
import type { SaveResult } from "@/lib/data/result";
import { getDb } from "@/lib/db/client";
import { idSchema } from "@/lib/validation/seizure";

// Form fields: hidden `id` and `expectedUpdatedAt` (ISO) on every edit form; `drugName`, `role`,
// `doseAmount`, `doseUnit`, `schedule`, `startDate`, `endDate`, `note`, `effectiveDate`, `stopDate`
// (dates as YYYY-MM-DD from `<input type="date">`).

type PeriodResult = SaveResult<MedicationPeriod>;

const NOT_SAVED = "Nothing was saved.";

function outOfDate(): SaveResult<never> {
  return { ok: false, error: "invalid", message: `This form is out of date. Reload the page. ${NOT_SAVED}` };
}

function done<T>(result: SaveResult<T>): SaveResult<T> {
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

// A blank field is "not entered" (undefined); the schema decides what that means.
function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function number(formData: FormData, name: string): number | undefined {
  const value = text(formData, name);
  return value === undefined ? undefined : Number(value);
}

// The record being edited: hidden `id` and the `expectedUpdatedAt` its form loaded.
function editTarget(formData: FormData): { id: string; expectedUpdatedAt: Date } | null {
  const id = formData.get("id");
  const expected = formData.get("expectedUpdatedAt");
  if (typeof id !== "string" || !idSchema.safeParse(id).success || typeof expected !== "string") return null;
  const expectedUpdatedAt = new Date(expected);
  return Number.isNaN(expectedUpdatedAt.getTime()) ? null : { id, expectedUpdatedAt };
}

// Missing fields pass through as undefined; the data layer's schema refuses them with a field error.
function dose(formData: FormData) {
  return {
    doseAmount: number(formData, "doseAmount") as number,
    doseUnit: text(formData, "doseUnit") as string,
    schedule: text(formData, "schedule") as string,
    note: text(formData, "note"),
  };
}

export async function startMedicationAction(_prev: PeriodResult | null, formData: FormData): Promise<PeriodResult> {
  return done(
    await startMedication(getDb(), {
      ...dose(formData),
      drugName: text(formData, "drugName") as string,
      role: text(formData, "role") as "maintenance" | "rescue",
      startDate: text(formData, "startDate") as string,
    }),
  );
}

export async function changeMedicationAction(_prev: PeriodResult | null, formData: FormData): Promise<PeriodResult> {
  const target = editTarget(formData);
  if (!target) return outOfDate();
  return done(
    await changeMedication(
      getDb(),
      target.id,
      target.expectedUpdatedAt,
      text(formData, "effectiveDate") ?? "",
      dose(formData),
    ),
  );
}

export async function stopMedicationAction(_prev: PeriodResult | null, formData: FormData): Promise<PeriodResult> {
  const target = editTarget(formData);
  if (!target) return outOfDate();
  return done(await stopMedication(getDb(), target.id, target.expectedUpdatedAt, text(formData, "stopDate") ?? ""));
}

export async function correctPeriodAction(_prev: PeriodResult | null, formData: FormData): Promise<PeriodResult> {
  const target = editTarget(formData);
  if (!target) return outOfDate();
  return done(
    await correctPeriod(getDb(), target.id, target.expectedUpdatedAt, {
      ...dose(formData),
      drugName: text(formData, "drugName") as string,
      role: text(formData, "role") as "maintenance" | "rescue",
      startDate: text(formData, "startDate") as string,
      endDate: text(formData, "endDate"),
    }),
  );
}

export async function deletePeriodAction(id: string): Promise<SaveResult<{ id: string }>> {
  return done(await deletePeriod(getDb(), id));
}
