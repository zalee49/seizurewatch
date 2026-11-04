import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { buildMonthGrid, monthLength, monthStats, type Day } from "@/lib/calendar";
import { listSeizuresBetween, type Seizure } from "@/lib/data/seizures";
import { getDb } from "@/lib/db/client";
import { formatDate, formatDuration, formatMonth, formatTime } from "@/lib/format";
import { dayKey, monthBounds, todayKey } from "@/lib/time";
import { MAX_SEIZURE_SECONDS, type Severity } from "@/lib/validation/seizure";

type Month = { year: number; month: number };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SEVERITY_LABELS: Record<Severity, string> = { mild: "Mild", moderate: "Moderate", severe: "Severe" };

// Navigation, not data: anything malformed or out of range is ignored.
function parseMonth(value: unknown): Month | null {
  const match = typeof value === "string" ? /^(\d{4})-(\d{2})$/.exec(value) : null;
  if (!match) return null;
  const [year, month] = [Number(match[1]), Number(match[2])];
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12 ? { year, month } : null;
}

function parseDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  if (!parseMonth(value.slice(0, 7))) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) ? value : null;
}

const monthParam = ({ year, month }: Month) => `${year}-${String(month).padStart(2, "0")}`;
const shiftMonth = ({ year, month }: Month, by: 1 | -1): Month => {
  const index = year * 12 + (month - 1) + by;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// The current month only counts the days so far, and a future month has none to count.
function statsText(seizures: Seizure[], shown: Month, today: string): string {
  const todayMonth = parseMonth(today.slice(0, 7))!;
  const shownKey = monthParam(shown);
  const isCurrent = shownKey === monthParam(todayMonth);
  const daysSoFar = isCurrent
    ? Number(today.slice(8, 10))
    : shownKey < monthParam(todayMonth)
      ? monthLength(shown.year, shown.month)
      : 0;
  const { count, longestGapDays } = monthStats(seizures, daysSoFar);
  const countText = count === 0 ? "No seizures this month" : `${plural(count, "seizure")} this month`;
  if (daysSoFar === 0) return countText;
  return `${countText} · longest stretch without one${isCurrent ? " so far" : ""}: ${plural(longestGapDays, "day")}`;
}

// Read at request time (after `connection()`): an unstopped seizure stays "still going" for 2 hours.
function durationText(seizure: Seizure): string {
  if (seizure.endedAt) return formatDuration((seizure.endedAt.getTime() - seizure.startedAt.getTime()) / 1000);
  if (Date.now() - seizure.startedAt.getTime() <= MAX_SEIZURE_SECONDS * 1000) return "Still going";
  return "Duration not recorded";
}

// Shaded by count (1, 2, 3 or more), with the count written in the cell so color isn't the only cue.
function shade(count: number): string {
  if (count === 0) return "bg-surface";
  if (count === 1) return "bg-alert/20";
  if (count === 2) return "bg-alert/45";
  return "bg-alert text-alert-foreground";
}

function DayCell({ day, month, today, selected }: { day: Day; month: Month; today: string; selected: boolean }) {
  if (!day.inMonth) {
    return (
      <div aria-hidden="true" className="flex min-h-14 items-start justify-center pt-1.5 text-sm text-muted/50">
        {day.dayOfMonth}
      </div>
    );
  }
  const label = `${formatDate(day.key)}${day.key === today ? ", today" : ""}: ${
    day.count === 0 ? "no seizures" : plural(day.count, "seizure")
  }`;
  return (
    <Link
      href={`/calendar?month=${monthParam(month)}&day=${day.key}`}
      scroll={false}
      aria-label={label}
      aria-current={selected ? "date" : undefined}
      className={`flex min-h-14 flex-col items-center rounded-xl pt-1.5 ${shade(day.count)} ${
        day.key === today ? "border-2 border-foreground" : "border border-border"
      } ${selected ? "outline-3 outline-offset-2 outline-brand" : ""}`}
    >
      <span className="text-sm font-semibold leading-tight">{day.dayOfMonth}</span>
      {day.count > 0 && (
        <span
          className={`mt-1 min-w-6 rounded-full px-1.5 text-center text-xs font-bold leading-5 ${
            day.count >= 3 ? "bg-alert-foreground text-alert" : "bg-alert text-alert-foreground"
          }`}
        >
          {day.count}
        </span>
      )}
    </Link>
  );
}

function DayList({ day, seizures }: { day: string; seizures: Seizure[] }) {
  const onDay = seizures.filter((seizure) => dayKey(seizure.startedAt) === day);
  return (
    <section aria-labelledby="day-heading" className="sw-card flex flex-col gap-3 p-5">
      <h2 id="day-heading" className="text-xl font-semibold">
        {formatDate(day)}
      </h2>
      {onDay.length === 0 ? (
        <p className="text-base text-muted">No seizures on this day.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {onDay.map((seizure) => (
            <li key={seizure.id}>
              <Link
                href={`/seizures/${seizure.id}`}
                className="flex min-h-14 items-center justify-between gap-3 rounded-xl border-2 border-border px-4 py-2"
              >
                <span>
                  <span className="block text-lg font-semibold">{formatTime(seizure.startedAt)}</span>
                  <span className="block text-sm text-muted">
                    {durationText(seizure)}
                    {seizure.severity && ` · ${SEVERITY_LABELS[seizure.severity]}`}
                  </span>
                </span>
                <span aria-hidden="true" className="text-xl text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function CalendarContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const params = await searchParams;
  const today = todayKey();
  const selectedDay = parseDay(params.day);
  // `?day=` alone (the day-list route) opens that day's month.
  const shown =
    parseMonth(params.month) ?? (selectedDay ? parseMonth(selectedDay.slice(0, 7)) : null) ?? parseMonth(today.slice(0, 7))!;
  const { from, to } = monthBounds(shown.year, shown.month);
  const seizures = await listSeizuresBetween(getDb(), from, to);
  const { weeks } = buildMonthGrid(shown.year, shown.month, seizures);
  const dayInMonth = selectedDay?.startsWith(monthParam(shown)) ? selectedDay : null;

  const arrowClass = "flex size-12 items-center justify-center rounded-xl border-2 border-border bg-surface text-2xl";
  return (
    <>
      <section aria-labelledby="month-heading" className="sw-card flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/calendar?month=${monthParam(shiftMonth(shown, -1))}`} scroll={false} aria-label="Previous month" className={arrowClass}>
            ‹
          </Link>
          <h2 id="month-heading" className="text-2xl font-semibold">
            {formatMonth(shown.year, shown.month)}
          </h2>
          <Link href={`/calendar?month=${monthParam(shiftMonth(shown, 1))}`} scroll={false} aria-label="Next month" className={arrowClass}>
            ›
          </Link>
        </div>
        <p className="text-base font-medium">{statsText(seizures, shown, today)}</p>

        <div className="flex flex-col gap-1">
          {/* Each day link's label names its full date and count, so the headers are visual only. */}
          <div aria-hidden="true" className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((name) => (
              <span key={name} className="text-center text-xs font-semibold text-muted">
                {name}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0].key} className="grid grid-cols-7 gap-1">
              {week.map((day) => (
                <DayCell key={day.key} day={day} month={shown} today={today} selected={day.key === dayInMonth} />
              ))}
            </div>
          ))}
        </div>

        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <span>Seizures per day:</span>
          {[1, 2, 3].map((count) => (
            <span key={count} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-4 rounded border border-border ${shade(count)}`} />
              {count === 3 ? "3+" : count}
            </span>
          ))}
        </p>
      </section>

      {dayInMonth ? (
        <DayList day={dayInMonth} seizures={seizures} />
      ) : (
        <p className="text-center text-base text-muted">Tap a day to see its seizures.</p>
      )}
    </>
  );
}

// The month and day come from the URL at request time, so the grid streams in behind a placeholder.
export default function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-4xl font-semibold">Calendar</h1>
      <Suspense fallback={<p className="mt-2 text-center text-base text-muted">Loading…</p>}>
        <CalendarContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
