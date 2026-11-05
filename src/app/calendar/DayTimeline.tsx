"use client";

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import Icon from "@/components/Icon";
import type { DayTimeline as DayTimelineData } from "@/lib/dayTimeline";
import { formatDuration, formatMinuteOfDay } from "@/lib/format";
import {
  ZOOM_SPANS,
  centeredWindow,
  dragWindow,
  minuteAtX,
  nearestPointIndex,
  shiftWindow,
  snapWindow,
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
// A horizontal move this far (px) is a swipe, never a tap.
const DRAG_PX = 8;

const SPAN_TEXT: Record<number, string> = { 1440: "24 h", 360: "6 h", 60: "1 h", 15: "15 min" };
const ROW_TEXT: Record<number, string> = { [MEDS_ROW]: "Meds", [SEIZURES_ROW]: "Seizures" };

// `lines` are shown one per row in the details panel, after the time. `index` is the point's place in
// `ChartData.points`, which a tapped dot carries as `data-point`.
type TimelinePoint = { index: number; minute: number; row: number; lines: string[]; seizureId?: string };
type ChartData = {
  meds: TimelinePoint[];
  rescue: TimelinePoint[];
  seizures: TimelinePoint[];
  points: TimelinePoint[];
  bands: { start: number; end: number }[];
};

const doseText = (amount: number | null, unit: string | null) =>
  amount === null ? "" : ` ${amount}${unit ? ` ${unit}` : ""}`;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const scheduledText = (dose: DayTimelineData["scheduled"][number]) =>
  `${dose.drugName} ${dose.amount} ${dose.doseUnit} (${dose.when.trim().toLowerCase()})`;
const rescueText = (dose: DayTimelineData["rescue"][number]) =>
  `Rescue: ${dose.medicationName}${doseText(dose.doseAmount, dose.doseUnit)}`;
const seizureText = (seizure: DayTimelineData["seizures"][number]) =>
  `Seizure${seizure.severity ? `, ${seizure.severity}` : ""}${
    seizure.durationSeconds === null ? "" : ` · ${formatDuration(seizure.durationSeconds)}`
  }`;

function chartData(timeline: DayTimelineData): ChartData {
  // Daily doses at the same time (6 AM has several) share one dot, so the details list them all.
  const byMinute = new Map<number, string[]>();
  for (const dose of timeline.scheduled) {
    byMinute.set(dose.minute, [...(byMinute.get(dose.minute) ?? []), scheduledText(dose)]);
  }
  let index = 0;
  const meds = [...byMinute].map(([minute, lines]) => ({ index: index++, minute, row: MEDS_ROW, lines }));
  const rescue = timeline.rescue.map((dose) => ({
    index: index++,
    minute: dose.minute,
    row: MEDS_ROW,
    lines: [rescueText(dose)],
  }));
  const seizures = timeline.seizures.map((seizure) => ({
    index: index++,
    minute: seizure.minute,
    row: SEIZURES_ROW,
    lines: [seizureText(seizure)],
    seizureId: seizure.id,
  }));
  return {
    meds,
    rescue,
    seizures,
    points: [...meds, ...rescue, ...seizures],
    // A seizure that runs past midnight stops at the end of its start day.
    bands: timeline.seizures
      .filter((seizure) => seizure.durationSeconds !== null)
      .map((seizure) => ({
        start: seizure.minute,
        end: Math.min(seizure.minute + seizure.durationSeconds! / 60, 1440),
      })),
  };
}

// Points at the same minute on the same row share one spot, so a rescue dose given at 6:00 PM sits
// on the 6 PM daily doses: selecting one selects them all.
const sameSpot = (a: TimelinePoint, b: TimelinePoint) => a.minute === b.minute && a.row === b.row;

// Circle for doses and seizures, diamond for rescue doses, so the shape tells them apart as well as the colour.
// On the full-screen chart each dot sits on a larger invisible target carrying `data-point`, so a
// tap near it selects it instead of zooming.
function Marker({
  cx,
  cy,
  payload,
  fill,
  diamond,
  radius = 7,
  interactive = false,
  selected = null,
}: {
  cx?: number;
  cy?: number;
  payload?: TimelinePoint;
  fill: string;
  diamond?: boolean;
  radius?: number;
  interactive?: boolean;
  selected?: TimelinePoint | null;
}) {
  if (cx === undefined || cy === undefined) return <g />;
  const reach = radius + 2;
  const shape = diamond ? (
    <polygon
      points={`${cx},${cy - reach} ${cx + reach},${cy} ${cx},${cy + reach} ${cx - reach},${cy}`}
      fill={fill}
      stroke="var(--sw-surface)"
      strokeWidth={2}
    />
  ) : (
    <circle cx={cx} cy={cy} r={radius} fill={fill} stroke="var(--sw-surface)" strokeWidth={2} />
  );
  if (!interactive || !payload) return shape;
  return (
    <g data-point={payload.index} className="cursor-pointer">
      {selected && sameSpot(selected, payload) && (
        <circle cx={cx} cy={cy} r={reach + 5} fill="none" stroke="var(--sw-foreground)" strokeWidth={2.5} />
      )}
      <circle cx={cx} cy={cy} r={22} fill="transparent" />
      {shape}
    </g>
  );
}

// Filter points and cut bands to the window here, keeping edge dots free of Recharts' clipping.
// `interactive` is the full-screen chart: bigger dots with tap targets, and a ring on the selected one.
function TimelineChart({
  data,
  view,
  interactive = false,
  selected = null,
}: {
  data: ChartData;
  view: ZoomWindow;
  interactive?: boolean;
  selected?: TimelinePoint | null;
}) {
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
  const radius = !interactive ? 7 : view.span === 1440 ? 8 : 11;
  const markerProps = { radius, interactive, selected };
  // The range above the chart carries AM/PM, so zoomed-in ticks drop it and stay apart.
  const tickText = (minute: number) =>
    view.span >= 360 ? formatMinuteOfDay(minute, true) : formatMinuteOfDay(minute).replace(/ [AP]M$/, "");

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
          tickFormatter={tickText}
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
        <Scatter data={meds} shape={<Marker fill="var(--sw-brand)" {...markerProps} />} isAnimationActive={false} />
        <Scatter
          data={rescue}
          shape={<Marker fill="var(--sw-accent)" diamond {...markerProps} />}
          isAnimationActive={false}
        />
        <Scatter data={seizures} shape={<Marker fill="var(--sw-alert)" {...markerProps} />} isAnimationActive={false} />
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

const OVERVIEW_MARK: Record<string, string> = {
  meds: "rounded-full bg-brand",
  rescue: "rotate-45 bg-accent",
  seizures: "rounded-full bg-alert",
};

// The whole day under the chart, with the visible stretch boxed. A tap jumps there.
function Overview({ data, view, onJump }: { data: ChartData; view: ZoomWindow; onJump: (minute: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const percent = (minute: number) => `${(minute / 1440) * 100}%`;

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    const minute = ((event.clientX - box.left) / box.width) * 1440;
    onJump(Math.min(1440, Math.max(0, minute)));
  }

  return (
    <div role="img" aria-label="Where the chart is in the day" onClick={handleClick} className="h-10 cursor-pointer px-2">
      <div ref={trackRef} className="relative h-6">
        <div
          className="absolute inset-y-0 min-w-1.5 rounded-md border-2 border-brand"
          style={{
            left: percent(view.start),
            width: percent(view.span),
            background: "color-mix(in srgb, var(--sw-brand) 14%, transparent)",
          }}
        />
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-border" />
        {(["meds", "rescue", "seizures"] as const).flatMap((kind) =>
          data[kind].map((point) => (
            <span
              key={point.index}
              className={`absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 ${OVERVIEW_MARK[kind]}`}
              style={{ left: percent(point.minute) }}
            />
          )),
        )}
      </div>
      <div className="relative h-4 text-xs text-muted">
        <span className="absolute left-0">12 AM</span>
        <span className="absolute left-1/2 -translate-x-1/2">12 PM</span>
        <span className="absolute right-0">12 AM</span>
      </div>
    </div>
  );
}

// Everything at the selected dot's spot, with a link to each seizure there.
function Details({ data, selected }: { data: ChartData; selected: TimelinePoint | null }) {
  if (!selected) {
    return (
      <div aria-live="polite" className="flex min-h-19 items-center rounded-xl border-2 border-border p-3 text-base text-muted">
        Tap a dot to see what happened then.
      </div>
    );
  }
  return (
    <div aria-live="polite" className="flex min-h-19 flex-col gap-1 rounded-xl border-2 border-border p-3 text-base">
      <p className="font-semibold">{formatMinuteOfDay(selected.minute)}</p>
      <ul className="flex flex-col gap-1">
        {data.points
          .filter((point) => sameSpot(point, selected))
          .map((point) => (
            <li key={point.index}>
              {point.lines.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
              {point.seizureId && (
                <Link href={`/seizures/${point.seizureId}`} className="inline-flex min-h-11 items-center font-semibold text-brand">
                  Open this seizure ›
                </Link>
              )}
            </li>
          ))}
      </ul>
    </div>
  );
}

// The plot area inside a chart wrapper, in px from the wrapper's left edge.
function plotEdges(element: Element) {
  const box = element.getBoundingClientRect();
  const plotLeft = CHART_MARGIN.left + Y_AXIS_WIDTH + X_PADDING.left;
  return { box, plotLeft, plotWidth: box.width - plotLeft - X_PADDING.right - CHART_MARGIN.right };
}

// The minute under a point on the plot, or null for one in the axis margins.
function plotMinute(element: Element, clientX: number, clientY: number, view: ZoomWindow): number | null {
  const { box, plotLeft, plotWidth } = plotEdges(element);
  const y = clientY - box.top;
  if (y < CHART_MARGIN.top || y > box.height - CHART_MARGIN.bottom - X_AXIS_HEIGHT) return null;
  return minuteAtX(clientX - box.left, plotLeft, plotWidth, view);
}

// Scroll the day list (DayAgenda, in the same card) to the row nearest the tapped time and flash it.
function jumpToNearestRow(event: MouseEvent<HTMLDivElement>) {
  const minute = plotMinute(event.currentTarget, event.clientX, event.clientY, FULL_DAY);
  const card = event.currentTarget.closest("section");
  if (minute === null || !card) return;
  let nearest: HTMLElement | null = null;
  let nearestDistance = Infinity;
  for (const row of card.querySelectorAll<HTMLElement>("[data-agenda-minute]")) {
    const distance = Math.abs(Number(row.dataset.agendaMinute) - minute);
    if (distance < nearestDistance) [nearest, nearestDistance] = [row, distance];
  }
  if (!nearest) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  nearest.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  // Restart the flash if the same row is tapped twice.
  nearest.classList.remove("sw-flash");
  void nearest.offsetWidth;
  nearest.classList.add("sw-flash");
}

const controlClass =
  "hover:border-brand hover:text-brand flex min-h-12 items-center justify-center rounded-xl border-2 border-border bg-surface text-base font-semibold disabled:pointer-events-none disabled:opacity-40";

export function DayTimeline({ timeline, dateLabel }: { timeline: DayTimelineData; dateLabel: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ZoomWindow>(FULL_DAY);
  const [selected, setSelected] = useState<TimelinePoint | null>(null);
  // The pointer gesture under way on the chart: one pointer at a time, a tap until it moves DRAG_PX sideways.
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    start: number;
    dragging: boolean;
    point: number | null;
  } | null>(null);
  const data = chartData(timeline);
  const end = view.start + view.span;
  // A swipe in progress leaves the window between steps; show the times rounded.
  const rangeText =
    view.span === 1440
      ? "Whole day"
      : `${formatMinuteOfDay(Math.round(view.start))} – ${formatMinuteOfDay(Math.round(end))}`;

  // Following a seizure link keeps this page alive but hidden; an open modal left behind would
  // block the next page, so close it whenever this component is hidden or unmounted.
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => dialog?.close();
  }, []);

  const counts = `${data.seizures.length === 0 ? "No seizures" : plural(data.seizures.length, "seizure")} · ${plural(data.rescue.length, "rescue dose")}`;
  const summary = `${plural(timeline.scheduled.length, "scheduled dose")}, ${plural(data.rescue.length, "rescue dose")}, ${plural(data.seizures.length, "seizure")}`;

  function openDialog() {
    setView(FULL_DAY);
    setSelected(null);
    gesture.current = null;
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current || (event.pointerType === "mouse" && event.button !== 0)) return;
    const points = Array.from(event.currentTarget.querySelectorAll<SVGGElement>("[data-point]")).map((point) => {
      const box = point.getBoundingClientRect();
      return { index: Number(point.dataset.point), x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: view.start,
      dragging: false,
      point: nearestPointIndex(points, event.clientX, event.clientY),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const dx = event.clientX - current.x;
    if (!current.dragging && Math.abs(dx) < DRAG_PX) return;
    current.dragging = true;
    // The whole day has nowhere to move to.
    if (view.span === 1440) return;
    const { plotWidth } = plotEdges(event.currentTarget);
    if (plotWidth <= 0) return;
    setView(dragWindow({ start: current.start, span: view.span }, (-dx / plotWidth) * view.span));
  }

  // A tap selects the dot it started on, zooms in on empty plot, and does nothing in the axis margins.
  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    gesture.current = null;
    if (current.dragging) {
      setView(snapWindow);
    } else if (current.point !== null) {
      setSelected(data.points[current.point] ?? null);
    } else {
      const minute = plotMinute(event.currentTarget, current.x, current.y, view);
      if (minute !== null) setView(zoomIn(view, minute));
    }
  }

  // The browser took the gesture (a page scroll, say): land the window where it is.
  function handlePointerCancel(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointerId) return;
    gesture.current = null;
    setView(snapWindow);
  }

  function jumpTo(minute: number) {
    setView(centeredWindow(minute, view.span === 1440 ? 60 : view.span));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="day-heading" className="text-xl font-semibold">
          {dateLabel}
        </h2>
        <button type="button" onClick={openDialog} aria-haspopup="dialog" className={`${controlClass} gap-1.5 px-3.5`}>
          <Icon name="chart" className="size-5" />
          Chart
        </button>
      </div>
      <p className="text-base text-muted">{counts}</p>
      <div>
        <div role="img" aria-label={summary} onClick={jumpToNearestRow} className="h-[140px] w-full cursor-pointer">
          <TimelineChart data={data} view={FULL_DAY} />
        </div>
        <p className="mt-1 text-sm text-muted">Tap the strip to jump to a time.</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          <Legend />
        </p>
      </div>

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
              <p aria-live="polite" className="text-center text-lg font-semibold tabular-nums">
                {rangeText}
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

            <div className="sw-card flex flex-col gap-2 p-3">
              <div
                role="img"
                aria-label={`Timeline, ${view.span === 1440 ? "whole day" : rangeText.replace(" – ", " to ")}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onLostPointerCapture={handlePointerCancel}
                className="h-[230px] w-full touch-pan-y select-none [&_*:focus]:outline-none"
              >
                <TimelineChart data={data} view={view} interactive selected={selected} />
              </div>
              <Overview data={data} view={view} onJump={jumpTo} />
              <p className="text-sm text-muted">Swipe to move · tap empty space to zoom in · tap a dot for details</p>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                <Legend />
              </p>
            </div>

            <Details data={data} selected={selected} />
          </div>
        )}
      </dialog>
    </div>
  );
}
