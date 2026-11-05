import type { DayTimeline } from "@/lib/dayTimeline";
import type { Severity } from "@/lib/validation/seizure";

// A quiet stretch this long or longer shrinks to one line (DV-D1).
export const BREAK_MINUTES = 60;
// Seizures whose starts are at most this far apart are grouped as a cluster.
export const CLUSTER_MINUTES = 60;

export type AgendaRow =
  | { kind: "doses"; minute: number; lines: string[] }
  | { kind: "rescue"; minute: number; text: string }
  | {
      kind: "seizure";
      id: string;
      minute: number;
      severity: Severity | null;
      durationSeconds: number | null;
      sinceLastMinutes: number | null;
    }
  | { kind: "cluster"; count: number; startMinute: number; endMinute: number }
  | { kind: "gap"; minutes: number; collapsed: boolean };

type EventRow = Extract<AgendaRow, { kind: "doses" | "rescue" | "seizure" }>;
type Seizure = DayTimeline["seizures"][number];

// At one minute, daily doses come first, then rescue, then seizures.
const KIND_ORDER: Record<EventRow["kind"], number> = { doses: 0, rescue: 1, seizure: 2 };

// A seizure with no usable duration ends where it starts; one running past midnight stops at 1440.
function seizureEnd(seizure: { minute: number; durationSeconds: number | null }): number {
  return Math.min(seizure.minute + (seizure.durationSeconds ?? 0) / 60, 1440);
}

const rowEnd = (row: EventRow) => (row.kind === "seizure" ? seizureEnd(row) : row.minute);

// Each run of 2+ seizures with consecutive starts at most CLUSTER_MINUTES apart, keyed by its first seizure.
function clusterStarts(seizures: Seizure[]): Map<string, Extract<AgendaRow, { kind: "cluster" }>> {
  const clusters = new Map<string, Extract<AgendaRow, { kind: "cluster" }>>();
  for (let first = 0; first < seizures.length; ) {
    let last = first;
    while (last + 1 < seizures.length && seizures[last + 1].minute - seizures[last].minute <= CLUSTER_MINUTES) last++;
    if (last > first) {
      const run = seizures.slice(first, last + 1);
      clusters.set(seizures[first].id, {
        kind: "cluster",
        count: run.length,
        startMinute: seizures[first].minute,
        endMinute: Math.ceil(Math.max(...run.map(seizureEnd))),
      });
    }
    first = last + 1;
  }
  return clusters;
}

export function buildDayAgenda(timeline: DayTimeline): AgendaRow[] {
  const dosesByMinute = new Map<number, string[]>();
  for (const dose of timeline.scheduled) {
    const line = `${dose.drugName} ${dose.amount} ${dose.doseUnit}`;
    dosesByMinute.set(dose.minute, [...(dosesByMinute.get(dose.minute) ?? []), line]);
  }

  const seizures = [...timeline.seizures].sort((a, b) => a.minute - b.minute);
  const events: EventRow[] = [
    ...[...dosesByMinute].map(([minute, lines]): EventRow => ({ kind: "doses", minute, lines })),
    ...timeline.rescue.map(
      (dose): EventRow => ({
        kind: "rescue",
        minute: dose.minute,
        text: `${dose.medicationName}${dose.doseAmount === null ? "" : ` ${dose.doseAmount}${dose.doseUnit ? ` ${dose.doseUnit}` : ""}`}`,
      }),
    ),
    ...seizures.map((seizure, index): EventRow => {
      const sinceLast = index === 0 ? null : seizure.minute - seizures[index - 1].minute;
      return {
        kind: "seizure",
        id: seizure.id,
        minute: seizure.minute,
        severity: seizure.severity,
        durationSeconds: seizure.durationSeconds,
        sinceLastMinutes: sinceLast !== null && sinceLast <= CLUSTER_MINUTES ? sinceLast : null,
      };
    }),
  ].sort((a, b) => a.minute - b.minute || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  const clusters = clusterStarts(seizures);
  const rows: AgendaRow[] = [];
  let coveredUntil: number | null = null;
  for (const event of events) {
    if (coveredUntil !== null) {
      // An intervening dose or shorter seizure must not erase a continuing seizure's end.
      const minutes = Math.max(0, event.minute - coveredUntil);
      rows.push({ kind: "gap", minutes, collapsed: minutes >= BREAK_MINUTES });
    }
    const cluster = event.kind === "seizure" ? clusters.get(event.id) : undefined;
    if (cluster) rows.push(cluster);
    rows.push(event);
    coveredUntil = Math.max(coveredUntil ?? 0, rowEnd(event));
  }
  return rows;
}
