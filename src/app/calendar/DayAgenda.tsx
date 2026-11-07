import Link from "next/link";
import Icon from "@/components/Icon";
import type { AgendaRow } from "@/lib/dayAgenda";
import { formatDuration, formatMinuteOfDay } from "@/lib/format";
import { DoseTimeEditor } from "./DoseTimeEditor";

// Time column, rail marker, content. The rail line (left 77px) runs down the centre of the marker column.
const ROW_GRID = "grid grid-cols-[64px_28px_minmax(0,1fr)]";

// Each seizure's bar is drawn against 5 minutes, so anything that long fills the track.
const BAR_FULL_SECONDS = 300;

function Marker({ kind }: { kind: "doses" | "rescue" | "seizure" }) {
  if (kind === "rescue") return <span className="size-[13px] rotate-45 rounded-[2px] border-2 border-surface bg-accent" />;
  return <span className={`size-3.5 rounded-full border-2 border-surface ${kind === "doses" ? "bg-brand" : "bg-alert"}`} />;
}

type EventRow = Extract<AgendaRow, { kind: "doses" | "rescue" | "seizure" }>;

function EventContent({ row, durationText, day }: { row: EventRow; durationText: string; day: string }) {
  if (row.kind === "doses") {
    return <DoseTimeEditor day={day} minute={row.minute} usualMinute={row.usualMinute} lines={row.lines} />;
  }
  if (row.kind === "rescue") {
    return <p className="px-3 py-2.5 font-semibold">Rescue: {row.text}</p>;
  }
  return (
    <Link
      href={`/seizures/${row.id}`}
      className="flex min-h-14 items-center gap-2 rounded-xl border-2 border-border bg-surface px-3 py-2.5 hover:border-alert"
    >
      <span className="min-w-0 flex-1">
        <span className="font-semibold">Seizure{row.severity && `, ${row.severity}`}</span>
        {/* The duration wraps as a whole, never mid-value. */}{" "}
        <span className="text-sm whitespace-nowrap text-muted">· {durationText}</span>
        {row.durationSeconds !== null && (
          <span aria-hidden="true" className="mt-1.5 block rounded-[3px] bg-alert/20">
            <span
              className="block h-1.5 min-w-1 rounded-[3px] bg-alert"
              style={{ width: `${Math.min(100, (row.durationSeconds / BAR_FULL_SECONDS) * 100)}%` }}
            />
          </span>
        )}
      </span>
      <span aria-hidden="true" className="text-muted">
        <Icon name="right" className="size-5" />
      </span>
    </Link>
  );
}

// The day's doses, rescue doses and seizures in time order (DV-D1). `durationTexts` is keyed by seizure id.
export function DayAgenda({
  day,
  rows,
  durationTexts,
}: {
  day: string;
  rows: AgendaRow[];
  durationTexts: Record<string, string>;
}) {
  if (rows.length === 0) return <p className="text-base text-muted">Nothing logged on this day.</p>;

  return (
    <ol
      className={`relative before:absolute before:left-[77px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border before:content-[''] [&>li]:relative`}
    >
      {rows.map((row, index) => {
        const next = rows[index + 1];
        if (row.kind === "gap") {
          if (row.collapsed) {
            return (
              <li
                key={index}
                className={`${ROW_GRID} min-h-11 items-center after:absolute after:left-[77px] after:inset-y-0 after:w-0.5 after:bg-[repeating-linear-gradient(var(--sw-surface)_0_4px,var(--sw-border)_4px_8px)] after:content-['']`}
              >
                <span className="col-start-3 pl-3 text-sm text-muted italic">
                  {formatDuration(Math.round(row.minutes) * 60)}, nothing logged
                </span>
              </li>
            );
          }
          const since = next?.kind === "seizure" ? next.sinceLastMinutes : null;
          const height = Math.min(90, Math.max(6, row.minutes * 3));
          return (
            <li
              key={index}
              aria-hidden={since === null ? true : undefined}
              className={`${ROW_GRID} items-center`}
              style={{ height: since === null ? height : Math.max(22, height) }}
            >
              {since !== null && (
                <span className="col-start-3 pl-3 text-[13px] text-muted">
                  {since === 0 ? "same minute" : `+${since} min`}
                </span>
              )}
            </li>
          );
        }
        if (row.kind === "cluster") {
          return (
            <li key={index} className={ROW_GRID}>
              <p className="col-start-3 mt-2 mb-1 pl-3 text-[13px] font-bold tracking-wide text-alert uppercase">
                Cluster · {row.count} seizures · {formatMinuteOfDay(row.startMinute)} – {formatMinuteOfDay(row.endMinute)}
              </p>
            </li>
          );
        }
        return (
          <li key={index} data-agenda-minute={row.minute} className={`${ROW_GRID} items-start rounded-xl`}>
            <span className="pt-3 text-right text-sm font-semibold whitespace-nowrap tabular-nums">
              {formatMinuteOfDay(row.minute)}
            </span>
            <span aria-hidden="true" className="relative z-10 flex justify-center pt-[15px]">
              <Marker kind={row.kind} />
            </span>
            <EventContent day={day} row={row} durationText={row.kind === "seizure" ? (durationTexts[row.id] ?? "") : ""} />
          </li>
        );
      })}
    </ol>
  );
}
