import { Suspense } from "react";
import { connection } from "next/server";
import { listCurrentMedications, listMedicationHistory, type MedicationPeriod } from "@/lib/data/medications";
import { getDb } from "@/lib/db/client";
import { formatDate, formatDoses } from "@/lib/format";
import { todayKey } from "@/lib/time";
import { AddMedication, HistoryFix, MedicationActions, type PeriodView } from "./MedForms";

function toView(period: MedicationPeriod): PeriodView {
  return { ...period, updatedAt: period.updatedAt.toISOString() };
}

// A period that ends the day another period of the same drug starts is a planned dose change, not a stop.
function endText(period: MedicationPeriod, history: MedicationPeriod[]): string | null {
  if (period.endDate === null) return null;
  const key = period.drugName.trim().toLowerCase();
  const next = history.find((other) => other.drugName.trim().toLowerCase() === key && other.startDate === period.endDate);
  return next
    ? `${formatDoses(next.doses, next.doseUnit)} from ${formatDate(period.endDate)}`
    : `stops ${formatDate(period.endDate)}`;
}

function MedicationCard({ period, today }: { period: PeriodView & { endText: string | null }; today: string }) {
  return (
    <li className="sw-card p-5">
      <p className="text-xl font-semibold">{period.drugName}</p>
      <p className="mt-1 text-lg">
        {formatDoses(period.doses, period.doseUnit)}
      </p>
      <p className="mt-1 text-base text-muted">
        since {formatDate(period.startDate)}
        {period.endText && ` · ${period.endText}`}
      </p>
      {period.note && <p className="mt-1 text-base text-muted">{period.note}</p>}
      <MedicationActions period={period} today={today} />
    </li>
  );
}

function Group({
  title,
  periods,
  today,
}: {
  title: string;
  periods: (PeriodView & { endText: string | null })[];
  today: string;
}) {
  if (periods.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <ul className="flex flex-col gap-3">
        {periods.map((period) => (
          <MedicationCard key={period.id} period={period} today={today} />
        ))}
      </ul>
    </section>
  );
}

function periodDates(period: MedicationPeriod, today: string): string {
  if (period.startDate > today) {
    const start = `starts ${formatDate(period.startDate)}`;
    return period.endDate === null ? start : `${start}, ends ${formatDate(period.endDate)}`;
  }
  return `${formatDate(period.startDate)} → ${period.endDate === null ? "now" : formatDate(period.endDate)}`;
}

// Every period of each drug, newest first. Drug names match ignoring case and surrounding spaces.
function History({ periods, today }: { periods: MedicationPeriod[]; today: string }) {
  const byDrug = new Map<string, MedicationPeriod[]>();
  for (const period of periods) {
    const key = period.drugName.trim().toLowerCase();
    byDrug.set(key, [...(byDrug.get(key) ?? []), period]);
  }
  if (byDrug.size === 0) return null;
  return (
    <section aria-label="History" className="flex flex-col gap-3">
      <h2 className="text-2xl font-semibold">History</h2>
      {[...byDrug.values()].map((drugPeriods) => {
        const newestFirst = [...drugPeriods].sort((a, b) => b.startDate.localeCompare(a.startDate));
        return (
          <details key={newestFirst[0].id} className="sw-card px-5">
            <summary className="flex min-h-tap cursor-pointer items-center justify-between gap-3 text-lg font-semibold">
              <span className="min-w-0 break-words">{newestFirst[0].drugName}</span>
              <span className="shrink-0 text-base font-normal text-muted">
                {newestFirst.length} {newestFirst.length === 1 ? "period" : "periods"}
              </span>
            </summary>
            <ul className="flex flex-col gap-3 pb-4">
              {newestFirst.map((period) => (
                <li key={period.id} className="border-t border-border pt-3">
                  <p className="text-base font-semibold">
                    {formatDoses(period.doses, period.doseUnit)}
                  </p>
                  <p className="text-base text-muted">{periodDates(period, today)}</p>
                  {period.note && <p className="text-base text-muted">{period.note}</p>}
                  <HistoryFix period={toView(period)} />
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

async function MedsContent() {
  await connection();
  const today = todayKey();
  const db = getDb();
  const [current, history] = await Promise.all([listCurrentMedications(db, today), listMedicationHistory(db)]);
  const views = current.map((period) => ({ ...toView(period), endText: endText(period, history) }));

  return (
    <>
      {views.length === 0 && <p className="text-lg text-muted">No medications yet</p>}
      <Group title="Daily" periods={views.filter((p) => p.role === "maintenance")} today={today} />
      <Group title="Rescue" periods={views.filter((p) => p.role === "rescue")} today={today} />
      <AddMedication today={today} startOpen={views.length === 0} />
      <History periods={history} today={today} />
    </>
  );
}

export default function MedsPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-4xl font-semibold">Meds</h1>
      <Suspense fallback={<p className="mt-2 text-center text-base text-muted">Loading…</p>}>
        <MedsContent />
      </Suspense>
    </main>
  );
}
