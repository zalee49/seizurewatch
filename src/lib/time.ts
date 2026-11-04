import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export const HOUSEHOLD_TIME_ZONE = "America/New_York";

const DAY_MS = 24 * 60 * 60 * 1000;

// The household calendar day (YYYY-MM-DD) an instant falls on.
export function dayKey(instant: Date): string {
  return format(new TZDate(instant, HOUSEHOLD_TIME_ZONE), "yyyy-MM-dd");
}

export function todayKey(now: Date = new Date()): string {
  return dayKey(now);
}

// Whole days from one YYYY-MM-DD key to another (negative if `toKey` is earlier).
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

// UTC instants of the household month's first midnight and the next month's first midnight.
export function monthBounds(year: number, month1to12: number): { from: Date; to: Date } {
  const from = new TZDate(year, month1to12 - 1, 1, HOUSEHOLD_TIME_ZONE);
  const to = new TZDate(year, month1to12, 1, HOUSEHOLD_TIME_ZONE);
  return { from: new Date(from.getTime()), to: new Date(to.getTime()) };
}

// Parses a `datetime-local` value ("YYYY-MM-DDTHH:mm", optional seconds) as household wall time.
export function parseHouseholdDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0));
  const parsed = new TZDate(year, month - 1, day, hour, minute, second, HOUSEHOLD_TIME_ZONE);
  // Reject values that rolled over (month 13, Feb 30, hour 25, ...).
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute
  ) {
    return null;
  }
  return new Date(parsed.getTime());
}
