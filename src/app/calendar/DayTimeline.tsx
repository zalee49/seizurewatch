"use client";

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { DayTimeline as DayTimelineData } from "@/lib/dayTimeline";

const MEDS_ROW = 2;
const SEIZURES_ROW = 1;

// `lines` are shown one per row in the tooltip, after the time.
type TimelinePoint = { minute: number; row: number; lines: string[] };

const TICKS = [0, 360, 720, 1080, 1440];
const TICK_TEXT: Record<number, string> = { 0: "12 AM", 360: "6 AM", 720: "12 PM", 1080: "6 PM", 1440: "12 AM" };
const ROW_TEXT: Record<number, string> = { [MEDS_ROW]: "Meds", [SEIZURES_ROW]: "Seizures" };

// "6:00 AM" from minutes after midnight.
function clockText(minute: number): string {
  const hour = Math.floor(minute / 60);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

const doseText = (amount: number | null, unit: string | null) =>
  amount === null ? "" : ` ${amount}${unit ? ` ${unit}` : ""}`;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// Daily doses at the same time (6 AM has several) share one dot, so the tooltip lists them all.
function scheduledPoints(scheduled: DayTimelineData["scheduled"]): TimelinePoint[] {
  const byMinute = new Map<number, string[]>();
  for (const dose of scheduled) {
    const lines = byMinute.get(dose.minute) ?? [];
    lines.push(`${dose.drugName} ${dose.amount} ${dose.doseUnit} (${dose.when.trim().toLowerCase()})`);
    byMinute.set(dose.minute, lines);
  }
  return [...byMinute].map(([minute, lines]) => ({ minute, row: MEDS_ROW, lines }));
}

// Circle for doses and seizures, diamond for rescue doses, so the shape tells them apart as well as the colour.
function Marker({ cx, cy, fill, diamond }: { cx?: number; cy?: number; fill: string; diamond?: boolean }) {
  if (cx === undefined || cy === undefined) return <g />;
  if (diamond) {
    return (
      <polygon
        points={`${cx},${cy - 9} ${cx + 9},${cy} ${cx},${cy + 9} ${cx - 9},${cy}`}
        fill={fill}
        stroke="var(--sw-surface)"
        strokeWidth={2}
      />
    );
  }
  return <circle cx={cx} cy={cy} r={7} fill={fill} stroke="var(--sw-surface)" strokeWidth={2} />;
}

function PointTooltip({
  active,
  payload,
  points,
}: {
  active?: boolean;
  payload?: { payload?: TimelinePoint }[];
  points: TimelinePoint[];
}) {
  const point = payload?.find((item) => item.payload)?.payload;
  if (!active || !point) return null;
  // Points at the same minute on the same row share one spot, so a rescue dose given at 6:00 PM sits
  // on the 6 PM daily doses: list everything there, not only the point that was tapped.
  const lines = points
    .filter((other) => other.minute === point.minute && other.row === point.row)
    .flatMap((other) => other.lines);
  return (
    <div className="sw-card max-w-60 rounded-xl px-3 py-2 text-base">
      <p className="font-semibold">{clockText(point.minute)}</p>
      <ul>
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

export function DayTimeline({ timeline }: { timeline: DayTimelineData }) {
  const meds = scheduledPoints(timeline.scheduled);
  const rescue: TimelinePoint[] = timeline.rescue.map((dose) => ({
    minute: dose.minute,
    row: MEDS_ROW,
    lines: [`Rescue: ${dose.medicationName}${doseText(dose.doseAmount, dose.doseUnit)}`],
  }));
  const seizures: TimelinePoint[] = timeline.seizures.map((seizure) => ({
    minute: seizure.minute,
    row: SEIZURES_ROW,
    lines: [`Seizure${seizure.severity ? `, ${seizure.severity}` : ""}`],
  }));

  const label = `Timeline of the day: ${plural(timeline.scheduled.length, "scheduled dose")}, ${plural(rescue.length, "rescue dose")}, ${plural(seizures.length, "seizure")}`;

  return (
    <div>
      <div role="img" aria-label={label} className="h-[140px] w-full [&_*:focus]:outline-none">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid stroke="var(--sw-border)" horizontal={false} vertical={false} />
            <XAxis
              dataKey="minute"
              type="number"
              domain={[0, 1440]}
              ticks={TICKS}
              tickFormatter={(minute: number) => TICK_TEXT[minute] ?? ""}
              padding={{ left: 12, right: 12 }}
              tick={{ fill: "var(--sw-muted)", fontSize: 13 }}
              stroke="var(--sw-border)"
            />
            <YAxis
              dataKey="row"
              type="number"
              domain={[0, 3]}
              ticks={[SEIZURES_ROW, MEDS_ROW]}
              tickFormatter={(row: number) => ROW_TEXT[row] ?? ""}
              width={68}
              tick={{ fill: "var(--sw-muted)", fontSize: 13 }}
              stroke="var(--sw-border)"
            />
            <ReferenceLine x={360} stroke="var(--sw-border)" strokeWidth={2} />
            <ReferenceLine x={1080} stroke="var(--sw-border)" strokeWidth={2} />
            <Scatter data={meds} shape={<Marker fill="var(--sw-brand)" />} isAnimationActive={false} />
            <Scatter data={rescue} shape={<Marker fill="var(--sw-accent)" diamond />} isAnimationActive={false} />
            <Scatter data={seizures} shape={<Marker fill="var(--sw-alert)" />} isAnimationActive={false} />
            <Tooltip
              trigger="click"
              content={<PointTooltip points={[...meds, ...rescue, ...seizures]} />}
              cursor={false}
              wrapperStyle={{ zIndex: 10 }}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-full bg-brand" />
          Daily dose
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rotate-45 bg-accent" />
          Rescue dose
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-full bg-alert" />
          Seizure
        </span>
      </p>
    </div>
  );
}
