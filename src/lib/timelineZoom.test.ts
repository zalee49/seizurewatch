import { describe, expect, it } from "vitest";
import {
  centeredWindow,
  dragWindow,
  minuteAtX,
  nearestPointIndex,
  overlapsWindow,
  shiftWindow,
  snapWindow,
  windowTicks,
  zoomIn,
} from "./timelineZoom";

describe("nearestPointIndex", () => {
  const points = [{ index: 3, x: 196, y: 100 }, { index: 8, x: 215, y: 100 }];

  it("selects the nearest centre when invisible hit targets overlap", () => {
    expect(nearestPointIndex(points, 196, 100)).toBe(3);
    expect(nearestPointIndex(points, 214, 100)).toBe(8);
  });

  it("includes the 22px target edge but excludes empty plot", () => {
    expect(nearestPointIndex(points, 196, 122)).toBe(3);
    expect(nearestPointIndex(points, 196, 123)).toBeNull();
    expect(nearestPointIndex([], 196, 100)).toBeNull();
  });
});

describe("overlapsWindow", () => {
  const window = { start: 889, span: 15 };

  it("includes a seizure that started earlier but continues into the window", () => {
    expect(overlapsWindow(888, 891.5, window)).toBe(true);
  });

  it("excludes a seizure that ended at or before the window starts", () => {
    expect(overlapsWindow(885, 889, window)).toBe(false);
    expect(overlapsWindow(885, 888, window)).toBe(false);
  });

  it("includes point events on both edges and excludes those outside", () => {
    expect(overlapsWindow(889, 889, window)).toBe(true);
    expect(overlapsWindow(904, 904, window)).toBe(true);
    expect(overlapsWindow(888, 888, window)).toBe(false);
    expect(overlapsWindow(905, 905, window)).toBe(false);
  });
});

describe("centeredWindow", () => {
  it("centres on the given minute", () => {
    expect(centeredWindow(720, 360)).toEqual({ start: 540, span: 360 });
  });

  it("clamps near the start of the day", () => {
    expect(centeredWindow(10, 60)).toEqual({ start: 0, span: 60 });
  });

  it("clamps near the end of the day", () => {
    expect(centeredWindow(1435, 60)).toEqual({ start: 1380, span: 60 });
  });

  it("rounds the start to the nearest 5 minutes at 15 min", () => {
    expect(centeredWindow(100.4, 15)).toEqual({ start: 95, span: 15 });
  });

  it("snaps to the step for each span", () => {
    // Centred on 2:40 PM: 1 h gives 2:15 - 3:15 PM, 6 h gives 12 - 6 PM.
    expect(centeredWindow(880, 60)).toEqual({ start: 855, span: 60 });
    expect(centeredWindow(880, 360)).toEqual({ start: 720, span: 360 });
    expect(centeredWindow(880, 15)).toEqual({ start: 875, span: 15 });
    expect(centeredWindow(880, 1440)).toEqual({ start: 0, span: 1440 });
  });
});

describe("zoomIn", () => {
  it("goes from the whole day to 360 minutes around the tap", () => {
    expect(zoomIn({ start: 0, span: 1440 }, 800)).toEqual({ start: 600, span: 360 });
  });

  it("steps down through the listed spans", () => {
    expect(zoomIn({ start: 620, span: 360 }, 800).span).toBe(60);
    expect(zoomIn({ start: 770, span: 60 }, 800).span).toBe(15);
  });

  it("stays at 15 minutes, recentred on the tap", () => {
    expect(zoomIn({ start: 600, span: 15 }, 700)).toEqual({ start: 695, span: 15 });
  });
});

describe("shiftWindow", () => {
  it("moves by half a span, landing on a snap step", () => {
    expect(shiftWindow({ start: 600, span: 60 }, 1)).toEqual({ start: 630, span: 60 });
    expect(shiftWindow({ start: 600, span: 60 }, -1)).toEqual({ start: 570, span: 60 });
    expect(shiftWindow({ start: 600, span: 15 }, 1)).toEqual({ start: 610, span: 15 });
    expect(shiftWindow({ start: 600, span: 15 }, -1)).toEqual({ start: 590, span: 15 });
    expect(shiftWindow({ start: 540, span: 360 }, 1)).toEqual({ start: 720, span: 360 });
  });

  it("puts an off-step window back on a step", () => {
    expect(shiftWindow({ start: 611, span: 60 }, 1)).toEqual({ start: 645, span: 60 });
  });

  it("stops at the start of the day", () => {
    expect(shiftWindow({ start: 10, span: 60 }, -1)).toEqual({ start: 0, span: 60 });
  });

  it("stops at the end of the day", () => {
    expect(shiftWindow({ start: 1370, span: 60 }, 1)).toEqual({ start: 1380, span: 60 });
  });
});

describe("dragWindow", () => {
  it("moves by any amount without snapping", () => {
    expect(dragWindow({ start: 600, span: 60 }, 7.3)).toEqual({ start: 607.3, span: 60 });
    expect(dragWindow({ start: 600, span: 60 }, -12.5)).toEqual({ start: 587.5, span: 60 });
  });

  it("stops at both ends of the day", () => {
    expect(dragWindow({ start: 20, span: 60 }, -50)).toEqual({ start: 0, span: 60 });
    expect(dragWindow({ start: 1370, span: 60 }, 30)).toEqual({ start: 1380, span: 60 });
  });
});

describe("snapWindow", () => {
  it("rounds the start to the nearest step for the span", () => {
    expect(snapWindow({ start: 607.3, span: 60 })).toEqual({ start: 600, span: 60 });
    expect(snapWindow({ start: 608, span: 60 })).toEqual({ start: 615, span: 60 });
    expect(snapWindow({ start: 92.4, span: 15 })).toEqual({ start: 90, span: 15 });
    expect(snapWindow({ start: 650, span: 360 })).toEqual({ start: 660, span: 360 });
  });

  it("stays inside the day", () => {
    expect(snapWindow({ start: 1379.9, span: 60 })).toEqual({ start: 1380, span: 60 });
    expect(snapWindow({ start: 1078, span: 360 })).toEqual({ start: 1080, span: 360 });
    expect(snapWindow({ start: 0.4, span: 15 })).toEqual({ start: 0, span: 15 });
  });
});

describe("windowTicks", () => {
  it("ticks every 6 hours across the day, both ends included", () => {
    expect(windowTicks({ start: 0, span: 1440 })).toEqual([0, 360, 720, 1080, 1440]);
  });

  it("ticks every hour in a 6-hour window", () => {
    expect(windowTicks({ start: 540, span: 360 })).toEqual([540, 600, 660, 720, 780, 840, 900]);
  });

  it("ticks every 15 minutes in an hour, skipping to the first step after an off-step start", () => {
    expect(windowTicks({ start: 610, span: 60 })).toEqual([615, 630, 645, 660]);
  });

  it("ticks every 5 minutes in a 15-minute window", () => {
    expect(windowTicks({ start: 693, span: 15 })).toEqual([695, 700, 705]);
  });
});

describe("minuteAtX", () => {
  const window = { start: 600, span: 60 };

  it("maps the left edge, middle and right edge", () => {
    expect(minuteAtX(40, 40, 200, window)).toBe(600);
    expect(minuteAtX(140, 40, 200, window)).toBe(630);
    expect(minuteAtX(240, 40, 200, window)).toBe(660);
  });

  it("does not round", () => {
    expect(minuteAtX(41, 40, 200, window)).toBeCloseTo(600.3);
  });

  it("gives null outside the plot on both sides", () => {
    expect(minuteAtX(39, 40, 200, window)).toBeNull();
    expect(minuteAtX(241, 40, 200, window)).toBeNull();
  });

  it("gives null for a plot with no width", () => {
    expect(minuteAtX(40, 40, 0, window)).toBeNull();
  });
});
