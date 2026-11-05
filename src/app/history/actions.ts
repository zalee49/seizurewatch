"use server";

import { revalidatePath } from "next/cache";
import { saveProfile } from "@/lib/data/profile";
import type { Profile } from "@/lib/data/profile";
import type { SaveResult } from "@/lib/data/result";
import { getDb } from "@/lib/db/client";

// Form fields: hidden `expectedUpdatedAt` (ISO; empty when no profile exists yet), `name`, `breed`,
// `birthday`, `weightAmount`, `weightUnit`, `diagnosis`, `firstSeizureDate`, `vetName`, `vetPhone`,
// `emergencyVetName`, `emergencyVetPhone`, `allergies`, `notes` (dates as YYYY-MM-DD).

type ProfileResult = SaveResult<Profile>;

const NOT_SAVED = "Nothing was saved.";

function outOfDate(): SaveResult<never> {
  return { ok: false, error: "invalid", message: `This form is out of date. Reload the page. ${NOT_SAVED}` };
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

export async function saveProfileAction(_prev: ProfileResult | null, formData: FormData): Promise<ProfileResult> {
  const expected = formData.get("expectedUpdatedAt");
  if (typeof expected !== "string") return outOfDate();
  let expectedUpdatedAt: Date | null = null;
  if (expected !== "") {
    expectedUpdatedAt = new Date(expected);
    if (Number.isNaN(expectedUpdatedAt.getTime())) return outOfDate();
  }

  const result = await saveProfile(getDb(), expectedUpdatedAt, {
    name: text(formData, "name"),
    breed: text(formData, "breed"),
    birthday: text(formData, "birthday"),
    weightAmount: number(formData, "weightAmount"),
    weightUnit: text(formData, "weightUnit") as "lb" | "kg" | undefined,
    diagnosis: text(formData, "diagnosis"),
    firstSeizureDate: text(formData, "firstSeizureDate"),
    vetName: text(formData, "vetName"),
    vetPhone: text(formData, "vetPhone"),
    emergencyVetName: text(formData, "emergencyVetName"),
    emergencyVetPhone: text(formData, "emergencyVetPhone"),
    allergies: text(formData, "allergies"),
    notes: text(formData, "notes"),
  });
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
