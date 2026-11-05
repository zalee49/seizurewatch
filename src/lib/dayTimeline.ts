import type { MedicationPeriod } from "@/lib/data/medications";
import type { Seizure } from "@/lib/data/seizures";
import { formatDate, formatTime } from "@/lib/format";
import { dayKey, minuteOfDay } from "@/lib/time";
import type { Severity } from "@/lib/validation/seizure";

// The household's fixed dose times (DL-D1), in minutes after midnight, by lower-case trimmed label.
// A label missing here is listed, not drawn: extend this table rather than guessing.
export const DOSE_LABEL_TIMES: Record<string, number[]> = {
  morning: [360],
  evening: [1080],
  dinner: [1080],
  "twice daily": [360, 1080],
};

export type DayTimeline = {
  seizures: { id: string; minute: number; severity: Severity | null }[];
  scheduled: { minute: number; drugName: string; amount: number; doseUnit: string; when: string }[];
  rescue: { minute: number; medicationName: string; doseAmount: number | null; doseUnit: string | null }[];
  // Ready-to-show lines for anything that could not be placed.
  notPlaced: string[];
};

const NO_NAME = "Rescue medication";

function doseText(amount: number | null, unit: string | null): string {
  return amount === null ? "" : ` ${amount}${unit ? ` ${unit}` : ""}`;
}

export function buildDayTimeline(day: string, seizures: Seizure[], periods: MedicationPeriod[]): DayTimeline {
  const timeline: DayTimeline = { seizures: [], scheduled: [], rescue: [], notPlaced: [] };

  for (const period of periods) {
    if (period.role !== "maintenance") continue;
    // Stored lines that hold together as doses are dropped by the data layer; a period left with
    // none would otherwise vanish from the timeline with nothing said.
    if (period.doses.length === 0) {
      timeline.notPlaced.push(`Not on the timeline: ${period.drugName} (dose not recorded)`);
      continue;
    }
    for (const dose of period.doses) {
      const label = dose.when.trim().toLowerCase();
      const minutes = Object.hasOwn(DOSE_LABEL_TIMES, label) ? DOSE_LABEL_TIMES[label] : null;
      if (!minutes) {
        timeline.notPlaced.push(`Not on the timeline: ${period.drugName} ${dose.amount} ${period.doseUnit} ${dose.when}`);
        continue;
      }
      for (const minute of minutes) {
        timeline.scheduled.push({
          minute,
          drugName: period.drugName,
          amount: dose.amount,
          doseUnit: period.doseUnit,
          when: dose.when,
        });
      }
    }
  }

  for (const seizure of seizures) {
    if (dayKey(seizure.startedAt) !== day) continue;
    timeline.seizures.push({ id: seizure.id, minute: minuteOfDay(seizure.startedAt), severity: seizure.severity });
    for (const response of seizure.responses) {
      if (response.kind !== "rescue_med") continue;
      const name = response.medicationName ?? NO_NAME;
      const dose = doseText(response.doseAmount, response.doseUnit);
      if (!response.givenAt) {
        timeline.notPlaced.push(`Time not recorded: ${name}${dose}`);
      } else if (dayKey(response.givenAt) !== day) {
        timeline.notPlaced.push(
          `Given ${formatDate(response.givenAt)}, ${formatTime(response.givenAt)}: ${name}${dose}`,
        );
      } else {
        timeline.rescue.push({
          minute: minuteOfDay(response.givenAt),
          medicationName: name,
          doseAmount: response.doseAmount,
          doseUnit: response.doseUnit,
        });
      }
    }
  }

  timeline.scheduled.sort((a, b) => a.minute - b.minute);
  timeline.rescue.sort((a, b) => a.minute - b.minute);
  timeline.seizures.sort((a, b) => a.minute - b.minute);
  return timeline;
}
