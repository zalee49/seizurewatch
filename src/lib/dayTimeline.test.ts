import { describe, expect, it } from "vitest";
import type { MedicationPeriod } from "@/lib/data/medications";
import type { Seizure, SeizureResponse } from "@/lib/data/seizures";
import { buildDayTimeline } from "./dayTimeline";

const DAY = "2026-11-05";

function period(overrides: Partial<MedicationPeriod> & Pick<MedicationPeriod, "doses">): MedicationPeriod {
  return {
    id: crypto.randomUUID(),
    drugName: "Keppra XR",
    role: "maintenance",
    doseUnit: "mg",
    startDate: "2026-01-01",
    endDate: null,
    note: null,
    updatedAt: new Date("2026-01-01T12:00:00Z"),
    ...overrides,
  };
}

function seizureAt(iso: string, responses: SeizureResponse[] = [], endedIso: string | null = null): Seizure {
  return {
    id: crypto.randomUUID(),
    startedAt: new Date(iso),
    endedAt: endedIso ? new Date(endedIso) : null,
    seizureType: null,
    severity: null,
    beforeSymptoms: null,
    afterSymptoms: null,
    triggers: null,
    notes: null,
    recoveryMinutes: null,
    updatedAt: new Date(iso),
    responses,
  };
}

function response(overrides: Partial<SeizureResponse>): SeizureResponse {
  return {
    id: crypto.randomUUID(),
    kind: "rescue_med",
    medicationName: "Midazolam",
    doseAmount: 5,
    doseUnit: "mg",
    givenAt: null,
    description: null,
    ...overrides,
  };
}

describe("buildDayTimeline", () => {
  it("places a Twice daily dose at 360 and 1080", () => {
    const { scheduled } = buildDayTimeline(DAY, [], [period({ doses: [{ amount: 1000, when: "Twice daily" }] })]);
    expect(scheduled.map((dose) => dose.minute)).toEqual([360, 1080]);
    expect(scheduled[0]).toMatchObject({ drugName: "Keppra XR", amount: 1000, doseUnit: "mg", when: "Twice daily" });
  });

  it("places a Dinner dose at 1080", () => {
    const { scheduled, notPlaced } = buildDayTimeline(DAY, [], [period({ doses: [{ amount: 625, when: " Dinner " }] })]);
    expect(scheduled.map((dose) => dose.minute)).toEqual([1080]);
    expect(notPlaced).toEqual([]);
  });

  it("lists an unknown label in notPlaced", () => {
    const { scheduled, notPlaced } = buildDayTimeline(DAY, [], [period({ doses: [{ amount: 50, when: "Bedtime" }] })]);
    expect(scheduled).toEqual([]);
    expect(notPlaced).toEqual(["Not on the timeline: Keppra XR 50 mg Bedtime"]);
  });

  it("lists a maintenance period whose stored dose lines were all dropped", () => {
    const timeline = buildDayTimeline(DAY, [], [period({ doses: [] })]);
    expect(timeline.scheduled).toEqual([]);
    expect(timeline.notPlaced).toEqual(["Not on the timeline: Keppra XR (dose not recorded)"]);
  });

  it("ignores a rescue-role period", () => {
    const timeline = buildDayTimeline(DAY, [], [period({ role: "rescue", doses: [{ amount: 5, when: "Morning" }] })]);
    expect(timeline.scheduled).toEqual([]);
    expect(timeline.notPlaced).toEqual([]);
  });

  it("lists a rescue response with no givenAt in notPlaced", () => {
    const seizure = seizureAt("2026-11-05T19:14:00Z", [response({ givenAt: null })]);
    const timeline = buildDayTimeline(DAY, [seizure], []);
    expect(timeline.rescue).toEqual([]);
    expect(timeline.notPlaced).toEqual(["Time not recorded: Midazolam 5 mg"]);
  });

  it("lists a rescue response given the next day in notPlaced with its date", () => {
    const seizure = seizureAt("2026-11-05T23:50:00-05:00", [response({ givenAt: new Date("2026-11-06T00:10:00-05:00") })]);
    const timeline = buildDayTimeline(DAY, [seizure], []);
    expect(timeline.rescue).toEqual([]);
    expect(timeline.notPlaced).toHaveLength(1);
    expect(timeline.notPlaced[0]).toContain("Nov 6, 2026");
    expect(timeline.notPlaced[0]).toContain("12:10 AM");
  });

  it("draws a timed rescue response at its household minute", () => {
    const seizure = seizureAt("2026-11-05T14:00:00-05:00", [response({ givenAt: new Date("2026-11-05T14:12:00-05:00") })]);
    expect(buildDayTimeline(DAY, [seizure], []).rescue).toEqual([
      { minute: 852, medicationName: "Midazolam", doseAmount: 5, doseUnit: "mg" },
    ]);
  });

  it("ignores an other response", () => {
    const seizure = seizureAt("2026-11-05T14:00:00-05:00", [
      response({ kind: "other", medicationName: null, givenAt: new Date("2026-11-05T14:05:00-05:00") }),
    ]);
    const timeline = buildDayTimeline(DAY, [seizure], []);
    expect(timeline.rescue).toEqual([]);
    expect(timeline.notPlaced).toEqual([]);
  });

  it("puts a 10:30 PM EST seizure at minute 1350 on its household day", () => {
    const seizure = seizureAt("2026-11-06T03:30:00Z"); // 10:30 PM EST on Nov 5
    expect(buildDayTimeline(DAY, [seizure], []).seizures).toEqual([
      { id: seizure.id, minute: 1350, severity: null, durationSeconds: null },
    ]);
  });

  it("gives an ended seizure its duration in whole seconds", () => {
    const seizure = seizureAt("2026-11-05T14:00:00-05:00", [], "2026-11-05T14:03:30-05:00");
    expect(buildDayTimeline(DAY, [seizure], []).seizures[0].durationSeconds).toBe(210);
  });

  it("gives an unended seizure no duration", () => {
    const seizure = seizureAt("2026-11-05T14:00:00-05:00");
    expect(buildDayTimeline(DAY, [seizure], []).seizures[0].durationSeconds).toBeNull();
  });

  it("gives a seizure longer than the maximum no duration", () => {
    const seizure = seizureAt("2026-11-05T14:00:00-05:00", [], "2026-11-05T16:00:01-05:00");
    expect(buildDayTimeline(DAY, [seizure], []).seizures[0].durationSeconds).toBeNull();
  });

  it("excludes a seizure from another day", () => {
    const seizure = seizureAt("2026-11-06T06:00:00Z"); // 1:00 AM EST on Nov 6
    expect(buildDayTimeline(DAY, [seizure], []).seizures).toEqual([]);
  });
});
