import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { doseTimes } from "@/lib/db/schema";
import { dayKeySchema } from "@/lib/validation/medication";
import type { SaveResult } from "./result";

// Minutes after midnight on the household clock.
function isMinute(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 1439;
}

// The day's moved dose slots: usual minute -> minute it was actually given.
export async function listDoseTimes(db: Db, day: string): Promise<Map<number, number>> {
  const rows = await db.select().from(doseTimes).where(eq(doseTimes.day, day));
  return new Map(rows.map((row) => [row.usualMinute, row.givenMinute]));
}

// Records when the `usualMinute` dose slot was given on `day`. Given at the usual time clears the record.
// Last save wins: both of us setting the same slot at once just keeps the later time.
export async function setDoseTime(
  db: Db,
  day: string,
  usualMinute: number,
  givenMinute: number,
): Promise<SaveResult<{ day: string; usualMinute: number; givenMinute: number }>> {
  if (!dayKeySchema.safeParse(day).success || !isMinute(usualMinute)) {
    return { ok: false, error: "invalid", message: "This form is out of date. Reload the page. Nothing was saved." };
  }
  if (!isMinute(givenMinute)) {
    return {
      ok: false,
      error: "invalid",
      message: "Check the time. Nothing was saved.",
      fieldErrors: { givenTime: "Enter a time" },
    };
  }

  const key = and(eq(doseTimes.day, day), eq(doseTimes.usualMinute, usualMinute));
  if (givenMinute === usualMinute) {
    await db.delete(doseTimes).where(key);
  } else {
    const now = new Date();
    await db
      .insert(doseTimes)
      .values({ day, usualMinute, givenMinute, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: [doseTimes.day, doseTimes.usualMinute], set: { givenMinute, updatedAt: now } });
  }
  return { ok: true, value: { day, usualMinute, givenMinute } };
}
