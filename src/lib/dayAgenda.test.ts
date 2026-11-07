import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DayAgenda } from "@/app/calendar/DayAgenda";
import { buildDayAgenda, type AgendaRow } from "./dayAgenda";
import type { DayTimeline } from "./dayTimeline";

function timeline(parts: Partial<DayTimeline>): DayTimeline {
  return { seizures: [], scheduled: [], rescue: [], notPlaced: [], ...parts };
}

const dose = (minute: number, drugName: string, amount: number, usualMinute = minute) => ({
  minute,
  usualMinute,
  drugName,
  amount,
  doseUnit: "mg",
  when: "morning",
});
const rescue = (minute: number) => ({ minute, medicationName: "Midazolam", doseAmount: 5, doseUnit: "mg" });
const seizure = (id: string, minute: number, durationSeconds: number | null = null) => ({
  id,
  minute,
  severity: null,
  durationSeconds,
});

const kinds = (rows: AgendaRow[]) => rows.map((row) => row.kind);
const gaps = (rows: AgendaRow[]) => rows.filter((row) => row.kind === "gap");

describe("buildDayAgenda", () => {
  it("gives no rows for an empty day", () => {
    expect(buildDayAgenda(timeline({}))).toEqual([]);
  });

  it("puts every daily dose at one minute in one row", () => {
    const rows = buildDayAgenda(timeline({ scheduled: [dose(360, "Keppra XR", 1000), dose(360, "Phenobarbital", 75)] }));
    expect(rows).toEqual([
      { kind: "doses", minute: 360, usualMinute: 360, lines: ["Keppra XR 1000 mg", "Phenobarbital 75 mg"] },
    ]);
  });

  it("puts a moved dose slot at the time it was given", () => {
    const rows = buildDayAgenda(
      timeline({ scheduled: [dose(400, "Keppra XR", 1000, 360), dose(400, "Phenobarbital", 75, 360)], seizures: [seizure("a", 380)] }),
    );
    expect(kinds(rows)).toEqual(["seizure", "gap", "doses"]);
    expect(rows[2]).toEqual({ kind: "doses", minute: 400, usualMinute: 360, lines: ["Keppra XR 1000 mg", "Phenobarbital 75 mg"] });
  });

  it("keeps two slots moved to the same minute as separate rows", () => {
    const rows = buildDayAgenda(timeline({ scheduled: [dose(720, "Keppra XR", 1000, 360), dose(720, "Keppra XR", 1000, 1080)] }));
    expect(rows.filter((row) => row.kind === "doses").map((row) => row.kind === "doses" && row.usualMinute)).toEqual([360, 1080]);
  });

  it("orders ties as doses, then rescue, then seizure", () => {
    const rows = buildDayAgenda(
      timeline({ scheduled: [dose(1080, "Keppra XR", 1000)], rescue: [rescue(1080)], seizures: [seizure("a", 1080)] }),
    );
    expect(kinds(rows)).toEqual(["doses", "gap", "rescue", "gap", "seizure"]);
    expect(rows[2]).toEqual({ kind: "rescue", minute: 1080, text: "Midazolam 5 mg" });
  });

  it("leaves a 59-minute gap open and collapses a 60-minute one", () => {
    const rows = buildDayAgenda(timeline({ rescue: [rescue(600), rescue(659), rescue(719)] }));
    expect(gaps(rows)).toEqual([
      { kind: "gap", minutes: 59, collapsed: false },
      { kind: "gap", minutes: 60, collapsed: true },
    ]);
  });

  it("groups a cluster of 9 seizures under one heading", () => {
    const starts: [number, number][] = [
      [840, 60], [846, 95], [852, 45], [858, 120], [864, 75], [870, 100], [875, 90], [880, 210], [888, 80],
    ];
    const rows = buildDayAgenda(timeline({ seizures: starts.map(([minute, seconds], i) => seizure(`s${i}`, minute, seconds)) }));
    const clusters = rows.filter((row) => row.kind === "cluster");
    // The last seizure ends at 2:49:20 PM, so the cluster runs to 2:50 PM.
    expect(clusters).toEqual([{ kind: "cluster", count: 9, startMinute: 840, endMinute: 890 }]);
    expect(rows[0]).toEqual(clusters[0]);
    const since = rows.flatMap((row) => (row.kind === "seizure" ? [row.sinceLastMinutes] : []));
    expect(since).toEqual([null, 6, 6, 6, 6, 6, 5, 5, 8]);
  });

  it("does not group seizures 61 minutes apart", () => {
    const rows = buildDayAgenda(timeline({ seizures: [seizure("a", 600), seizure("b", 661)] }));
    expect(kinds(rows)).toEqual(["seizure", "gap", "seizure"]);
    expect(rows.flatMap((row) => (row.kind === "seizure" ? [row.sinceLastMinutes] : []))).toEqual([null, null]);
  });

  it("says 0 minutes since the last seizure in the same minute", () => {
    const rows = buildDayAgenda(timeline({ seizures: [seizure("a", 600, 30), seizure("b", 600, 30)] }));
    expect(rows.at(-1)).toMatchObject({ kind: "seizure", id: "b", sinceLastMinutes: 0 });
  });

  it("measures the gap after a seizure with no duration from its start", () => {
    const rows = buildDayAgenda(timeline({ seizures: [seizure("a", 600)], rescue: [rescue(620)] }));
    expect(gaps(rows)).toEqual([{ kind: "gap", minutes: 20, collapsed: false }]);
  });

  it("measures the gap after a seizure from its end", () => {
    const rows = buildDayAgenda(timeline({ seizures: [seizure("a", 600, 120)], rescue: [rescue(620)] }));
    expect(gaps(rows)).toEqual([{ kind: "gap", minutes: 18, collapsed: false }]);
  });

  it("gives an overlap a gap of 0", () => {
    const rows = buildDayAgenda(timeline({ seizures: [seizure("a", 600, 300)], rescue: [rescue(602)] }));
    expect(gaps(rows)).toEqual([{ kind: "gap", minutes: 0, collapsed: false }]);
  });

  it("keeps a continuing seizure covered after an intervening rescue dose", () => {
    const rows = buildDayAgenda(timeline({
      seizures: [seizure("a", 600, 7200), seizure("b", 670, 60)],
      rescue: [rescue(605)],
    }));
    expect(gaps(rows)).toEqual([
      { kind: "gap", minutes: 0, collapsed: false },
      { kind: "gap", minutes: 0, collapsed: false },
    ]);
  });

  it("stops a seizure running past midnight at the end of the day", () => {
    const rows = buildDayAgenda(timeline({ seizures: [seizure("a", 1438, 600), seizure("b", 1439, 60)] }));
    expect(rows[0]).toEqual({ kind: "cluster", count: 2, startMinute: 1438, endMinute: 1440 });
  });

  it("exposes the since-last label to screen readers", () => {
    const rows = buildDayAgenda(timeline({ seizures: [seizure("a", 600), seizure("b", 600)] }));
    const html = renderToStaticMarkup(createElement(DayAgenda, { day: "2026-11-05", rows, durationTexts: { a: "Still going", b: "Still going" } }));
    const gap = [...html.matchAll(/<li\b[^>]*>[^]*?<\/li>/g)].find(([item]) => item.includes("same minute"))?.[0];
    expect(gap).toBeDefined();
    expect(gap).not.toContain('aria-hidden="true"');
  });
});
