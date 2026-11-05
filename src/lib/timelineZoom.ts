// Zoom windows on the day timeline, in minutes after household midnight (the day is 0-1440).
export const ZOOM_SPANS = [1440, 360, 60, 15] as const;
export type ZoomSpan = (typeof ZOOM_SPANS)[number];
export type ZoomWindow = { start: number; span: number };

const DAY_MINUTES = 1440;
const TICK_STEPS: Record<ZoomSpan, number> = { 1440: 360, 360: 60, 60: 15, 15: 5 };

// Point events include both edges; an earlier interval must still be running when the window starts.
export function overlapsWindow(start: number, end: number, window: ZoomWindow): boolean {
  return start <= window.start + window.span && (start >= window.start || end > window.start);
}

function clampStart(start: number, span: number): number {
  return Math.min(Math.max(start, 0), DAY_MINUTES - span);
}

export function centeredWindow(center: number, span: number): ZoomWindow {
  return { start: clampStart(Math.round(center - span / 2), span), span };
}

export function zoomIn(window: ZoomWindow, center: number): ZoomWindow {
  const next = ZOOM_SPANS.find((span) => span < window.span) ?? ZOOM_SPANS[ZOOM_SPANS.length - 1];
  return centeredWindow(center, next);
}

export function shiftWindow(window: ZoomWindow, direction: -1 | 1): ZoomWindow {
  const start = clampStart(window.start + direction * Math.round(window.span / 2), window.span);
  return { start, span: window.span };
}

export function windowTicks(window: ZoomWindow): number[] {
  // An unlisted span uses the step of the nearest listed span below it (the smallest if none is).
  const listed = ZOOM_SPANS.find((span) => span <= window.span) ?? ZOOM_SPANS[ZOOM_SPANS.length - 1];
  const step = TICK_STEPS[listed];
  const end = window.start + window.span;
  const ticks: number[] = [];
  for (let tick = Math.ceil(window.start / step) * step; tick <= end; tick += step) ticks.push(tick);
  return ticks;
}

export function minuteAtX(x: number, plotLeft: number, plotWidth: number, window: ZoomWindow): number | null {
  if (plotWidth <= 0 || x < plotLeft || x > plotLeft + plotWidth) return null;
  return window.start + ((x - plotLeft) / plotWidth) * window.span;
}
