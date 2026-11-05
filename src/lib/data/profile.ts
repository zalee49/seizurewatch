import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { profile } from "@/lib/db/schema";
import { fieldErrorsFrom } from "@/lib/validation/seizure";
import { profileSchema, type ProfileInput, type WeightUnit } from "@/lib/validation/profile";
import { CONFLICT_MESSAGE, type SaveResult } from "./result";

export type Profile = {
  name: string | null;
  breed: string | null;
  birthday: string | null;
  weightAmount: number | null;
  weightUnit: WeightUnit | null;
  diagnosis: string | null;
  firstSeizureDate: string | null;
  vetName: string | null;
  vetPhone: string | null;
  emergencyVetName: string | null;
  emergencyVetPhone: string | null;
  allergies: string | null;
  notes: string | null;
  updatedAt: Date;
};

const NOTHING_SAVED = "Nothing was saved.";
// The profile is a single row.
const PROFILE_ID = 1;

type ProfileRow = typeof profile.$inferSelect;

function refuse(
  error: "invalid" | "not_found" | "conflict",
  message: string,
  fieldErrors?: Record<string, string>,
): SaveResult<never> {
  return fieldErrors
    ? { ok: false, error, message: `${message} ${NOTHING_SAVED}`, fieldErrors }
    : { ok: false, error, message: `${message} ${NOTHING_SAVED}` };
}

const conflict = (): SaveResult<never> => ({
  ok: false,
  error: "conflict",
  message: `${CONFLICT_MESSAGE} ${NOTHING_SAVED}`,
});

function toProfile(row: ProfileRow): Profile {
  return {
    name: row.name,
    breed: row.breed,
    birthday: row.birthday,
    weightAmount: row.weightAmount === null ? null : Number(row.weightAmount),
    // Mapped by hand: the column is checked, but anything else reads as no unit, never an error.
    weightUnit: row.weightUnit === "lb" || row.weightUnit === "kg" ? row.weightUnit : null,
    diagnosis: row.diagnosis,
    firstSeizureDate: row.firstSeizureDate,
    vetName: row.vetName,
    vetPhone: row.vetPhone,
    emergencyVetName: row.emergencyVetName,
    emergencyVetPhone: row.emergencyVetPhone,
    allergies: row.allergies,
    notes: row.notes,
    updatedAt: row.updatedAt,
  };
}

export async function getProfile(db: Db): Promise<Profile | null> {
  const [row] = await db.select().from(profile).where(eq(profile.id, PROFILE_ID));
  return row ? toProfile(row) : null;
}

// `expectedUpdatedAt` is the version the form loaded; null when the form loaded no profile yet.
// Either way the write only happens if nobody saved in between, otherwise it is a `conflict`.
export async function saveProfile(
  db: Db,
  expectedUpdatedAt: Date | null,
  input: ProfileInput,
): Promise<SaveResult<Profile>> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return refuse("invalid", "Check the fields marked below.", fieldErrorsFrom(parsed.error));
  if (expectedUpdatedAt !== null && Number.isNaN(expectedUpdatedAt.getTime())) return conflict();
  const details = parsed.data;
  const values = {
    ...details,
    weightAmount: details.weightAmount === null ? null : String(details.weightAmount),
  };
  const now = new Date();

  // Never `on conflict do update`: that would overwrite the other person's first save.
  const [row] =
    expectedUpdatedAt === null
      ? await db
          .insert(profile)
          .values({ id: PROFILE_ID, ...values, createdAt: now, updatedAt: now })
          .onConflictDoNothing({ target: profile.id })
          .returning()
      : await db
          .update(profile)
          .set({ ...values, updatedAt: now })
          .where(and(eq(profile.id, PROFILE_ID), eq(profile.updatedAt, expectedUpdatedAt)))
          .returning();
  return row ? { ok: true, value: toProfile(row) } : conflict();
}
