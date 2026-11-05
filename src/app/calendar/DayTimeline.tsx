"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Icon from "@/components/Icon";
import type { DayTimeline as DayTimelineData } from "@/lib/dayTimeline";
import { formatDuration } from "@/lib/format";
import {
  ZOOM_SPANS,
  centeredWindow,
  minuteAtX,
  overlapsWindow,
  shiftWindow,
  windowTicks,
  zoomIn,
  type ZoomWindow,
} from "@/lib/timelineZoom";

const MEDS_ROW = 2;
const SEIZURES_ROW = 1;
const DOSE_GUIDES = [360, 1080];
const FULL_DAY: ZoomWindow = { start: 0, span: 1440 };

// The plot's edges, shared by the chart props and the tap-to-zoom mapping so they can't drift apart.
const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 };
const Y_AXIS_WIDTH = 68;
const X_AXIS_HEIGHT = 30;
const X_PADDING = { left: 12, right: 12 };

const SPAN_TEXT: Record<number, string> = { 1440: "24 h", 360: "6 h", 60: "1 h", 15: "15 min" };
const ROW_TEXT: Record<number, string> = { [MEDS_ROW]: "Meds", [SEIZURES_ROW]: "Seizures" };

// `lines` are shown one per row in the tooltip, after the time.
type TimelinePoint = { minute: number; row: number; lines: string[] };
type ChartData = {
  meds: TimelinePoint[];
  rescue: TimelinePoint[];
  seizures: TimelinePoint[];
  bands: { start: number; end: number }[];
};

// "6:00 AM" from minutes after midnight; `short` gives "6 AM" on the hour. 1440 is the closing midnight.
function clockText(minute: number, short = false): string {
  const hour = Math.floor((minute % 1440) / 60);
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minutes = minute % 60;
  const time = short && minutes === 0 ? `${hour12}` : `${hour12}:${String(minutes).padStart(2, "0")}`;
  return `${time} ${hour < 12 ? "AM" : "PM"}`;
}

const doseText = (amount: number | null, unit: string | null) =>
  amount === null ? "" : ` ${amount}${unit ? ` ${unit}` : ""}`;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const scheduledText = (dose: DayTimelineData["scheduled"][number]) =>
  `${dose.drugName} ${dose.amount} ${dose.doseUnit} (${dose.when.trim().toLowerCase()})`;
const rescueText = (dose: DayTimelineData["rescue"][number]) =>
  `Rescue: ${dose.medicationName}${doseText(dose.doseAmount, dose.doseUnit)}`;
const seizureText = (seizure: DayTimelineData["seizures"][number]) =>
  `Seizure${seizure.severity ? `, ${seizure.severity}` : ""}`;

function chartData(timeline: DayTimelineData): ChartData {
  // Daily doses at the same time (6 AM has several) share one dot, so the tooltip lists them all.
  const byMinute = new Map<number, string[]>();
  for (const dose of timeline.scheduled) {
    byMinute.set(dose.minute, [...(byMinute.get(dose.minute) ?? []), scheduledText(dose)]);
  }
  return {
    meds: [...byMinute].map(([minute, lines]) => ({ minute, row: MEDS_ROW, lines })),
    rescue: timeline.rescue.map((dose) => ({ minute: dose.minute, row: MEDS_ROW, lines: [rescueText(dose)] })),
    seizures: timeline.seizures.map((seizure) => ({
      minute: seizure.minute,
      row: SEIZURES_ROW,
      lines: [seizureText(seizure)],
    })),
    // A seizure that runs past midnight stops at the end of its start day.
    bands: timeline.seizures
      .filter((seizure) => seizure.durationSeconds !== null)
      .map((seizure) => ({
        start: seizure.minute,
        end: Math.min(seizure.minute + seizure.durationSeconds! / 60, 1440),
      })),
  };
}

// Circle for doses and seizures, diamond for rescue doses, so the shape tells them apart as well as the colour.
// `data-point` lets a tap on a dot open its tooltip instead of zooming.
function Marker({ cx, cy, fill, diamond }: { cx?: number; cy?: number; fill: string; diamond?: boolean }) {
  if (cx === undefined || cy === undefined) return <g />;
  if (diamond) {
    return (
      <polygon
        data-point=""
        points={`${cx},${cy - 9} ${cx + 9},${cy} ${cx},${cy + 9} ${cx - 9},${cy}`}
        fill={fill}
        stroke="var(--sw-surface)"
        strokeWidth={2}
      />
    );
  }
  return <circle data-point="" cx={cx} cy={cy} r={7} fill={fill} stroke="var(--sw-surface)" strokeWidth={2} />;
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

// Filter points and cut bands to the window here, keeping edge dots free of Recharts' clipping.
function TimelineChart({ data, view, tooltips }: { data: ChartData; view: ZoomWindow; tooltips: boolean }) {
  const end = view.start + view.span;
  const inView = (point: TimelinePoint) => point.minute >= view.start && point.minute <= end;
  const meds = data.meds.filter(inView);
  const rescue = data.rescue.filter(inView);
  const seizures = data.seizures.filter(inView);
  // With no dots, Recharts cannot infer either axis domain. Fix the domains explicitly in that
  // case so ticks and any continuing duration bands survive; dots keep their unclipped edges.
  const noPoints = meds.length + rescue.length + seizures.length === 0;
  // Bands are cut to the window by hand so none spills into the axis padding.
  const bands = data.bands
    .map((band) => ({ start: Math.max(band.start, view.start), end: Math.min(band.end, end) }))
    .filter((band) => band.start < band.end);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={CHART_MARGIN} accessibilityLayer={false}>
        <CartesianGrid stroke="var(--sw-border)" horizontal={false} vertical={false} />
        <XAxis
          dataKey="minute"
          type="number"
          domain={[view.start, end]}
          allowDataOverflow={noPoints}
          ticks={windowTicks(view)}
          interval="equidistantPreserveStart"
          tickFormatter={(minute: number) => clockText(minute, view.span >= 360)}
          padding={X_PADDING}
          height={X_AXIS_HEIGHT}
          tick={{ fill: "var(--sw-muted)", fontSize: 13 }}
          stroke="var(--sw-border)"
        />
        <YAxis
          dataKey="row"
          type="number"
          domain={[0, 3]}
          allowDataOverflow={noPoints}
          ticks={[SEIZURES_ROW, MEDS_ROW]}
          tickFormatter={(row: number) => ROW_TEXT[row] ?? ""}
          width={Y_AXIS_WIDTH}
          tick={{ fill: "var(--sw-muted)", fontSize: 13 }}
          stroke="var(--sw-border)"
        />
        {DOSE_GUIDES.filter((minute) => minute >= view.start && minute <= end).map((minute) => (
          <ReferenceLine key={minute} x={minute} stroke="var(--sw-border)" strokeWidth={2} />
        ))}
        {bands.map((band, index) => (
          <ReferenceArea
            key={index}
            x1={band.start}
            x2={band.end}
            y1={SEIZURES_ROW - 0.2}
            y2={SEIZURES_ROW + 0.2}
            fill="var(--sw-alert)"
            fillOpacity={0.3}
            stroke="none"
          />
        ))}
        <Scatter data={meds} shape={<Marker fill="var(--sw-brand)" />} isAnimationActive={false} />
        <Scatter data={rescue} shape={<Marker fill="var(--sw-accent)" diamond />} isAnimationActive={false} />
        <Scatter data={seizures} shape={<Marker fill="var(--sw-alert)" />} isAnimationActive={false} />
        {tooltips && (
          <Tooltip
            trigger="click"
            content={<PointTooltip points={[...meds, ...rescue, ...seizures]} />}
            cursor={false}
            wrapperStyle={{ zIndex: 10 }}
            isAnimationActive={false}
          />
        )}
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function Legend() {
  return (
    <>
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
    </>
  );
}

type ListItem = { key: string; minute: number; endMinute?: number; text: string; href?: string };

// Include seizures continuing into the window as well as the dots that start in it.
function windowItems(timeline: DayTimelineData, view: ZoomWindow): ListItem[] {
  const items: ListItem[] = [
    ...timeline.scheduled.map((dose, index) => ({
      key: `dose-${index}`,
      minute: dose.minute,
      text: scheduledText(dose),
    })),
    ...timeline.rescue.map((dose, index) => ({ key: `rescue-${index}`, minute: dose.minute, text: rescueText(dose) })),
    ...timeline.seizures.map((seizure) => ({
      key: seizure.id,
      minute: seizure.minute,
      endMinute: Math.min(seizure.minute + (seizure.durationSeconds ?? 0) / 60, 1440),
      text: `${seizureText(seizure)}${seizure.durationSeconds === null ? "" : ` · ${formatDuration(seizure.durationSeconds)}`}`,
      href: `/seizures/${seizure.id}`,
    })),
  ];
  return items
    .filter((item) => overlapsWindow(item.minute, item.endMinute ?? item.minute, view))
    .sort((a, b) => a.minute - b.minute);
}

const controlClass =
  "hover:border-brand hover:text-brand flex min-h-12 items-center justify-center rounded-xl border-2 border-border bg-surface text-base font-semibold disabled:pointer-events-none disabled:opacity-40";

export function DayTimeline({ timeline, dateLabel }: { timeline: DayTimelineData; dateLabel: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ZoomWindow>(FULL_DAY);
  const data = chartData(timeline);
  const end = view.start + view.span;

  // Following a seizure link keeps this page alive but hidden; an open modal left behind would
  // block the next page, so close it whenever this component is hidden or unmounted.
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => dialog?.close();
  }, []);

  const summary = `${plural(timeline.scheduled.length, "scheduled dose")}, ${plural(data.rescue.length, "rescue dose")}, ${plural(data.seizures.length, "seizure")}`;

  function openDialog() {
    setView(FULL_DAY);
    setOpen(true);
    dialogRef.current?.showModal();
  }

  // A tap on empty plot zooms in there; taps on a dot, the tooltip or the axes are left alone.
  function handleChartClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as Element;
    if (target.closest("[data-point], .recharts-tooltip-wrapper")) return;
    const box = event.currentTarget.getBoundingClientRect();
    const y = event.clientY - box.top;
    if (y < CHART_MARGIN.top || y > box.height - CHART_MARGIN.bottom - X_AXIS_HEIGHT) return;
    const plotLeft = CHART_MARGIN.left + Y_AXIS_WIDTH + X_PADDING.left;
    const plotWidth = box.width - plotLeft - X_PADDING.right - CHART_MARGIN.right;
    const minute = minuteAtX(event.clientX - box.left, plotLeft, plotWidth, view);
    if (minute !== null) setView(zoomIn(view, minute));
  }

  const items = open ? windowItems(timeline, view) : [];

  return (
    <div>
      <button
        type="button"
        onClick={openDialog}
        aria-label="Open the day's timeline"
        aria-describedby="day-timeline-summary"
        className="block w-full cursor-pointer rounded-xl text-left"
      >
        <span className="block h-[140px] w-full">
          <TimelineChart data={data} view={FULL_DAY} tooltips={false} />
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <Legend />
          <span className="ml-auto font-semibold text-brand">Zoom</span>
        </span>
      </button>
      <span id="day-timeline-summary" className="sr-only">
        {summary}
      </span>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="day-timeline-heading"
        className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-background p-0 text-foreground"
      >
        {open && (
          <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-3">
              <h2 id="day-timeline-heading" className="text-xl font-semibold">
                {dateLabel}
              </h2>
              <button type="button" onClick={() => dialogRef.current?.close()} className={`${controlClass} px-4`}>
                Close
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setView(shiftWindow(view, -1))}
                disabled={view.start <= 0}
                aria-label="Earlier"
                className={`${controlClass} size-12`}
              >
                <Icon name="left" />
              </button>
              <p aria-live="polite" className="text-center text-lg font-semibold">
                {view.span === 1440 ? "Whole day" : `${clockText(view.start)} – ${clockText(end)}`}
              </p>
              <button
                type="button"
                onClick={() => setView(shiftWindow(view, 1))}
                disabled={end >= 1440}
                aria-label="Later"
                className={`${controlClass} size-12`}
              >
                <Icon name="right" />
              </button>
            </div>

            <div role="group" aria-label="Zoom" className="grid grid-cols-4 gap-1 rounded-xl border-2 border-border bg-surface p-1">
              {ZOOM_SPANS.map((span) => (
                <button
                  key={span}
                  type="button"
                  aria-pressed={view.span === span}
                  onClick={() => setView(centeredWindow(view.start + view.span / 2, span))}
                  className={`min-h-11 rounded-lg text-base font-semibold ${
                    view.span === span ? "bg-brand text-brand-foreground" : "hover:text-brand"
                  }`}
                >
                  {SPAN_TEXT[span]}
                </button>
              ))}
            </div>

            <div className="sw-card flex flex-col gap-1 p-3">
              {/* Remounted per window so an open tooltip never points at a dot that moved away. */}
              <div
                key={`${view.start}-${view.span}`}
                role="img"
                aria-label={`Timeline, ${view.span === 1440 ? "whole day" : `${clockText(view.start)} to ${clockText(end)}`}`}
                onClick={handleChartClick}
                className="h-[260px] w-full [&_*:focus]:outline-none"
              >
                <TimelineChart data={data} view={view} tooltips />
              </div>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <Legend />
              </p>
            </div>

            {items.length === 0 ? (
              <p className="text-base text-muted">Nothing in this stretch</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((item) => {
                  const line = `${clockText(item.minute)} · ${item.text}`;
                  return (
                    <li key={item.key}>
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="flex min-h-12 items-center rounded-xl border-2 border-border bg-surface px-4 py-2 text-base font-medium"
                        >
                          {line}
                        </Link>
                      ) : (
                        <p className="px-4 py-1 text-base">{line}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </dialog>
    </div>
  );
}
