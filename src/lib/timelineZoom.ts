// Zoom windows on the day timeline, in minutes after household midnight (the day is 0-1440).
export const ZOOM_SPANS = [1440, 360, 60, 15] as const;
export type ZoomSpan = (typeof ZOOM_SPANS)[number];
export type ZoomWindow = { start: number; span: number };

const DAY_MINUTES = 1440;
const TICK_STEPS: Record<ZoomSpan, number> = { 1440: 360, 360: 60, 60: 15, 15: 5 };
// Windows start on round times for their span: the hour at 6 h, the quarter hour at 1 h, 5 minutes at 15 min.
export const SNAP_MINUTES: Record<ZoomSpan, number> = { 1440: 1440, 360: 60, 60: 15, 15: 5 };

// An unlisted span uses the steps of the nearest listed span below it (the smallest if none is).
function listedSpan(span: number): ZoomSpan {
  return ZOOM_SPANS.find((listed) => listed <= span) ?? ZOOM_SPANS[ZOOM_SPANS.length - 1];
}

// Point events include both edges; an earlier interval must still be running when the window starts.
export function overlapsWindow(start: number, end: number, window: ZoomWindow): boolean {
  return start <= window.start + window.span && (start >= window.start || end > window.start);
}

function clampStart(start: number, span: number): number {
  return Math.min(Math.max(start, 0), DAY_MINUTES - span);
}

// Every multiple of a snap step up to 1440 - span is reachable, so clamping keeps a snapped start snapped.
function snapStart(start: number, span: number): number {
  const step = SNAP_MINUTES[listedSpan(span)];
  return clampStart(Math.round(start / step) * step, span);
}

export function centeredWindow(center: number, span: number): ZoomWindow {
  return { start: snapStart(center - span / 2, span), span };
}

export function zoomIn(window: ZoomWindow, center: number): ZoomWindow {
  const next = ZOOM_SPANS.find((span) => span < window.span) ?? ZOOM_SPANS[ZOOM_SPANS.length - 1];
  return centeredWindow(center, next);
}

export function shiftWindow(window: ZoomWindow, direction: -1 | 1): ZoomWindow {
  const start = snapStart(window.start + direction * Math.round(window.span / 2), window.span);
  return { start, span: window.span };
}

// Follows a finger: moves freely within the day. `snapWindow` lands it when the finger lifts.
export function dragWindow(window: ZoomWindow, deltaMinutes: number): ZoomWindow {
  return { start: clampStart(window.start + deltaMinutes, window.span), span: window.span };
}

export function snapWindow(window: ZoomWindow): ZoomWindow {
  return { start: snapStart(window.start, window.span), span: window.span };
}

export function windowTicks(window: ZoomWindow): number[] {
  const step = TICK_STEPS[listedSpan(window.span)];
  const end = window.start + window.span;
  const ticks: number[] = [];
  for (let tick = Math.ceil(window.start / step) * step; tick <= end; tick += step) ticks.push(tick);
  return ticks;
}

export function minuteAtX(x: number, plotLeft: number, plotWidth: number, window: ZoomWindow): number | null {
  if (plotWidth <= 0 || x < plotLeft || x > plotLeft + plotWidth) return null;
  return window.start + ((x - plotLeft) / plotWidth) * window.span;
}

// Overlapping targets must choose the nearest dot, rather than whichever SVG target was painted last.
export function nearestPointIndex(
  points: { index: number; x: number; y: number }[],
  x: number,
  y: number,
): number | null {
  let nearest: number | null = null;
  let distance = 22 ** 2;
  for (const point of points) {
    const squared = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (squared <= distance) {
      nearest = point.index;
      distance = squared;
    }
  }
  return nearest;
}
