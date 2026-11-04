"use server";

import { revalidatePath } from "next/cache";
import { addResponse, createSeizure, deleteResponse, deleteSeizure, stopSeizure, updateSeizure } from "@/lib/data/seizures";
import type { Seizure, SeizureResponse } from "@/lib/data/seizures";
import type { SaveResult } from "@/lib/data/result";
import { getDb } from "@/lib/db/client";
import { parseHouseholdDateTime } from "@/lib/time";
import {
  fieldErrorsFrom,
  idSchema,
  responseSchema,
  seizureDetailsSchema,
  startSeizureSchema,
} from "@/lib/validation/seizure";

const NOT_SAVED = "Nothing was saved.";

function invalid(message: string, fieldErrors?: Record<string, string>): SaveResult<never> {
  return { ok: false, error: "invalid", message: `${message} ${NOT_SAVED}`, fieldErrors };
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

// datetime-local values are household wall time. Malformed becomes an invalid Date, which the schema rejects.
function dateTime(formData: FormData, name: string): Date | undefined {
  const value = text(formData, name);
  return value === undefined ? undefined : (parseHouseholdDateTime(value) ?? new Date(NaN));
}

function isoDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function startSeizureAction(id: string, startedAtIso: string): Promise<SaveResult<Seizure>> {
  const parsed = startSeizureSchema.safeParse({ id, startedAt: isoDate(startedAtIso) });
  if (!parsed.success) return invalid("Check the seizure start.", fieldErrorsFrom(parsed.error));
  return done(await createSeizure(getDb(), parsed.data));
}

export async function stopSeizureAction(id: string, endedAtIso: string): Promise<SaveResult<Seizure>> {
  const endedAt = isoDate(endedAtIso);
  if (!idSchema.safeParse(id).success || !endedAt) return invalid("Check the stop time.");
  return done(await stopSeizure(getDb(), id, endedAt));
}

export async function saveSeizureDetailsAction(
  _prev: SaveResult<Seizure> | null,
  formData: FormData,
): Promise<SaveResult<Seizure>> {
  const id = formData.get("id");
  const expectedUpdatedAt = isoDate(formData.get("expectedUpdatedAt"));
  if (typeof id !== "string" || !idSchema.safeParse(id).success || !expectedUpdatedAt) {
    return invalid("This form is out of date. Reload the page.");
  }

  // The form sends duration as minutes and seconds; the data layer takes total seconds.
  const durationMinutes = number(formData, "durationMinutes");
  const durationSeconds = number(formData, "durationSeconds");
  const parsed = seizureDetailsSchema.safeParse({
    startedAt: dateTime(formData, "startedAt"),
    endedAt: dateTime(formData, "endedAt"),
    durationSeconds:
      durationMinutes === undefined && durationSeconds === undefined
        ? undefined
        : (durationMinutes ?? 0) * 60 + (durationSeconds ?? 0),
    seizureType: text(formData, "seizureType"),
    severity: text(formData, "severity"),
    beforeSymptoms: text(formData, "beforeSymptoms"),
    afterSymptoms: text(formData, "afterSymptoms"),
    triggers: text(formData, "triggers"),
    notes: text(formData, "notes"),
    recoveryMinutes: number(formData, "recoveryMinutes"),
  });
  if (!parsed.success) {
    return invalid("Check the fields marked below.", fieldErrorsFrom(parsed.error));
  }
  return done(await updateSeizure(getDb(), id, expectedUpdatedAt, parsed.data));
}

// The hidden `id` field is the seizure's id.
export async function addResponseAction(
  _prev: SaveResult<SeizureResponse> | null,
  formData: FormData,
): Promise<SaveResult<SeizureResponse>> {
  const id = formData.get("id");
  if (typeof id !== "string" || !idSchema.safeParse(id).success) {
    return invalid("This form is out of date. Reload the page.");
  }
  const parsed = responseSchema.safeParse({
    kind: text(formData, "kind"),
    medicationName: text(formData, "medicationName"),
    doseAmount: number(formData, "doseAmount"),
    doseUnit: text(formData, "doseUnit"),
    givenAt: dateTime(formData, "givenAt"),
    description: text(formData, "description"),
  });
  if (!parsed.success) {
    return invalid("Check the fields marked below.", fieldErrorsFrom(parsed.error));
  }
  return done(await addResponse(getDb(), id, parsed.data));
}

export async function deleteResponseAction(id: string): Promise<SaveResult<{ id: string }>> {
  return done(await deleteResponse(getDb(), id));
}

export async function deleteSeizureAction(id: string): Promise<SaveResult<{ id: string }>> {
  return done(await deleteSeizure(getDb(), id));
}
