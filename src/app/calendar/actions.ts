"use server";

import { revalidatePath } from "next/cache";
import { setDoseTime } from "@/lib/data/doseTimes";
import type { SaveResult } from "@/lib/data/result";
import { getDb } from "@/lib/db/client";

type DoseTimeResult = SaveResult<{ day: string; usualMinute: number; givenMinute: number }>;

// "HH:mm" from `<input type="time">` as minutes after midnight; anything else becomes NaN, which is refused.
function minuteFromTime(value: FormDataEntryValue | null): number {
  const match = typeof value === "string" ? /^(\d{2}):(\d{2})$/.exec(value) : null;
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

// Form fields: hidden `day` (YYYY-MM-DD) and `usualMinute`, and `givenTime` ("HH:mm").
export async function setDoseTimeAction(_prev: DoseTimeResult | null, formData: FormData): Promise<DoseTimeResult> {
  const day = formData.get("day");
  const usualMinute = formData.get("usualMinute");
  const result = await setDoseTime(
    getDb(),
    typeof day === "string" ? day : "",
    typeof usualMinute === "string" && usualMinute !== "" ? Number(usualMinute) : Number.NaN,
    minuteFromTime(formData.get("givenTime")),
  );
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
