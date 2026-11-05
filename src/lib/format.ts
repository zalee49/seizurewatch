import { HOUSEHOLD_TIME_ZONE } from "./time";

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: HOUSEHOLD_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});

const dateOptions: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
};
const instantDateFormat = new Intl.DateTimeFormat("en-US", {
  ...dateOptions,
  timeZone: HOUSEHOLD_TIME_ZONE,
});
// A YYYY-MM-DD key is a calendar date, not an instant: format it in UTC so no zone can shift it.
const keyDateFormat = new Intl.DateTimeFormat("en-US", { ...dateOptions, timeZone: "UTC" });

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

// "1 min 45 s", "45 s", "2 min", "1 h 5 min", "1 h". Seconds are dropped from an hour up.
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  if (minutes > 0) return secs > 0 ? `${minutes} min ${secs} s` : `${minutes} min`;
  return `${secs} s`;
}

// "2:14 PM" in household time. (Newer ICU puts a narrow no-break space before PM; use a plain one.)
export function formatTime(instant: Date): string {
  return timeFormat.format(instant).replace(/[  ]/g, " ");
}

// "Wed, Nov 4, 2026" for an instant (household day) or a YYYY-MM-DD day key.
export function formatDate(value: Date | string): string {
  if (value instanceof Date) return instantDateFormat.format(value);
  const match = DAY_KEY.exec(value);
  if (!match) return value;
  const [year, month, day] = match.slice(1).map(Number);
  return keyDateFormat.format(new Date(Date.UTC(year, month - 1, day)));
}

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

// "November 2026" for a calendar month.
export function formatMonth(year: number, month1to12: number): string {
  return monthFormat.format(new Date(Date.UTC(year, month1to12 - 1, 1)));
}

// "500 mg morning, 625 mg evening", or "60 mg twice daily" for one time.
export function formatDoses(doses: { amount: number; when: string }[], unit: string): string {
  if (doses.length === 0) return "Dose not recorded";
  return doses.map((dose) => `${dose.amount} ${unit} ${dose.when}`).join(", ");
}
