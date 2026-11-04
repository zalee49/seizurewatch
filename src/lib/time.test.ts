import { describe, expect, it } from "vitest";
import { dayKey, daysBetween, monthBounds, parseHouseholdDateTime, todayKey } from "./time";

describe("dayKey", () => {
  it("puts 23:30 and the next 00:30 New York time on different days", () => {
    expect(dayKey(new Date("2026-06-10T03:30:00Z"))).toBe("2026-06-09"); // 23:30 EDT
    expect(dayKey(new Date("2026-06-10T04:30:00Z"))).toBe("2026-06-10"); // 00:30 EDT
  });

  it("keeps the day boundary at New York midnight across the 2026-11-01 change", () => {
    expect(dayKey(new Date("2026-11-01T03:30:00Z"))).toBe("2026-10-31"); // 23:30 EDT
    expect(dayKey(new Date("2026-11-01T04:30:00Z"))).toBe("2026-11-01"); // 00:30 EDT
    expect(dayKey(new Date("2026-11-02T04:30:00Z"))).toBe("2026-11-01"); // 23:30 EST
    expect(dayKey(new Date("2026-11-02T05:30:00Z"))).toBe("2026-11-02"); // 00:30 EST
  });
});

describe("todayKey", () => {
  it("uses the household day for the given instant", () => {
    expect(todayKey(new Date("2026-06-10T03:30:00Z"))).toBe("2026-06-09");
  });
});

describe("daysBetween", () => {
  it("counts calendar days, including across the daylight-saving change", () => {
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(daysBetween("2026-11-02", "2026-10-31")).toBe(-2);
    expect(daysBetween("2026-06-10", "2026-06-10")).toBe(0);
  });
});

describe("monthBounds", () => {
  it("returns household midnights as UTC instants when the March change falls inside", () => {
    const { from, to } = monthBounds(2026, 3);
    expect(from.toISOString()).toBe("2026-03-01T05:00:00.000Z");
    expect(to.toISOString()).toBe("2026-04-01T04:00:00.000Z");
  });

  it("rolls December into the next January", () => {
    const { from, to } = monthBounds(2026, 12);
    expect(from.toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(to.toISOString()).toBe("2027-01-01T05:00:00.000Z");
  });
});

describe("parseHouseholdDateTime", () => {
  it("parses a datetime-local value as household wall time", () => {
    expect(parseHouseholdDateTime("2026-06-10T14:30")?.toISOString()).toBe("2026-06-10T18:30:00.000Z");
    expect(parseHouseholdDateTime("2026-12-10T14:30")?.toISOString()).toBe("2026-12-10T19:30:00.000Z");
  });

  it("returns null when malformed", () => {
    expect(parseHouseholdDateTime("garbage")).toBeNull();
    expect(parseHouseholdDateTime("")).toBeNull();
    expect(parseHouseholdDateTime("2026-13-01T10:00")).toBeNull();
    expect(parseHouseholdDateTime("2026-02-30T10:00")).toBeNull();
  });
});
