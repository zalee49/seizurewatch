import type { Seizure } from "@/lib/data/seizures";
import { dayKey } from "@/lib/time";

export type Day = { key: string; dayOfMonth: number; inMonth: boolean; count: number };

const DAY_MS = 24 * 60 * 60 * 1000;

// Calendar dates are counted in UTC so no zone or daylight-saving change can shift them.
function keyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthLength(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

// Seizures per household day key.
function countByDay(seizures: Seizure[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const seizure of seizures) {
    const key = dayKey(seizure.startedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// Full Sunday-to-Saturday weeks covering the month; days from the neighbouring months have `inMonth: false`.
export function buildMonthGrid(year: number, month1to12: number, seizures: Seizure[]): { weeks: Day[][] } {
  const counts = countByDay(seizures);
  const first = Date.UTC(year, month1to12 - 1, 1);
  const last = Date.UTC(year, month1to12 - 1, monthLength(year, month1to12));
  const gridStart = first - new Date(first).getUTCDay() * DAY_MS;
  const gridEnd = last + (6 - new Date(last).getUTCDay()) * DAY_MS;

  const weeks: Day[][] = [];
  for (let time = gridStart; time <= gridEnd; time += DAY_MS) {
    const date = new Date(time);
    const key = keyOf(date);
    if (date.getUTCDay() === 0) weeks.push([]);
    weeks[weeks.length - 1].push({
      key,
      dayOfMonth: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month1to12 - 1,
      count: counts.get(key) ?? 0,
    });
  }
  return { weeks };
}

// `seizures` are the month's own (one household month). `longestGapDays` is the longest run of
// seizure-free days among days 1..`daysInMonth`, so a stretch crossing a month boundary counts in
// each month separately; with no seizures it is `daysInMonth`.
export function monthStats(seizures: Seizure[], daysInMonth: number): { count: number; longestGapDays: number } {
  const seizureDays = new Set(seizures.map((seizure) => Number(dayKey(seizure.startedAt).slice(8, 10))));
  let longestGapDays = 0;
  let run = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    run = seizureDays.has(day) ? 0 : run + 1;
    longestGapDays = Math.max(longestGapDays, run);
  }
  return { count: seizures.length, longestGapDays };
}
