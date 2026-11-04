import { describe, expect, it } from "vitest";
import type { Seizure } from "@/lib/data/seizures";
import { buildMonthGrid, monthLength, monthStats } from "./calendar";

function seizureAt(iso: string): Seizure {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date(iso),
    endedAt: null,
    seizureType: null,
    severity: null,
    beforeSymptoms: null,
    afterSymptoms: null,
    triggers: null,
    notes: null,
    recoveryMinutes: null,
    updatedAt: new Date(iso),
    responses: [],
  };
}

const weekday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();

describe("buildMonthGrid", () => {
  it("fills exactly four weeks for a 28-day month starting on Sunday", () => {
    const { weeks } = buildMonthGrid(2026, 2, []);
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0]).toEqual({ key: "2026-02-01", dayOfMonth: 1, inMonth: true, count: 0 });
    expect(weeks[3][6].key).toBe("2026-02-28");
    expect(weeks.flat().every((day) => day.inMonth)).toBe(true);
  });

  it("pads a month ending mid-week out to full Sunday-to-Saturday weeks", () => {
    // April 2026 starts on a Wednesday and ends on a Thursday.
    const { weeks } = buildMonthGrid(2026, 4, []);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]).toMatchObject({ key: "2026-03-29", dayOfMonth: 29, inMonth: false });
    expect(weeks.at(-1)?.at(-1)).toMatchObject({ key: "2026-05-02", inMonth: false });
    expect(weekday(weeks[0][0].key)).toBe(0);
    expect(weeks.flat().filter((day) => day.inMonth)).toHaveLength(30);
  });

  it("counts two seizures on one household day", () => {
    const { weeks } = buildMonthGrid(2026, 11, [
      seizureAt("2026-11-04T14:00:00Z"),
      seizureAt("2026-11-05T03:30:00Z"), // 22:30 EST on Nov 4
      seizureAt("2026-11-05T14:00:00Z"),
    ]);
    const days = weeks.flat();
    expect(days.find((day) => day.key === "2026-11-04")?.count).toBe(2);
    expect(days.find((day) => day.key === "2026-11-05")?.count).toBe(1);
  });
});

describe("monthStats", () => {
  it("is the whole month when there are no seizures", () => {
    expect(monthStats([], monthLength(2026, 4))).toEqual({ count: 0, longestGapDays: 30 });
  });

  it("finds the longest seizure-free run using household days", () => {
    // 23:30 EDT on March 10 is March 11 in UTC; it must count as the 10th.
    const stats = monthStats([seizureAt("2026-03-11T03:30:00Z"), seizureAt("2026-03-20T15:00:00Z")], 31);
    // Free: 1-9 (9), 11-19 (9), 21-31 (11).
    expect(stats).toEqual({ count: 2, longestGapDays: 11 });
  });

  it("counts only this month's side of a stretch crossing the month boundary", () => {
    expect(monthStats([seizureAt("2026-04-03T15:00:00Z")], 30).longestGapDays).toBe(27);
  });
});
