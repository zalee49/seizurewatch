import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import Icon from "@/components/Icon";
import PageHeading from "@/components/PageHeading";
import { listTrendSeries } from "@/lib/data/bloodwork";
import { listMedicationChanges } from "@/lib/data/medications";
import { getDb } from "@/lib/db/client";
import { formatDate } from "@/lib/format";
import { dayKey, parseHouseholdDateTime } from "@/lib/time";
import { TrendChart, type TrendChartSeries } from "./TrendChart";

const DAY_MS = 24 * 60 * 60 * 1000;

// The YYYY-MM-DD key of the day after `key`.
function nextDayKey(key: string): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

async function TrendsContent() {
  await connection();
  const db = getDb();
  const series = await listTrendSeries(db);
  if (series.length === 0) {
    return (
      <section className="sw-card flex flex-col items-center gap-3 p-8 text-center">
        <span className="rounded-2xl bg-accent/10 p-4 text-accent"><Icon name="chart" className="size-8" /></span>
        <h2 className="text-xl font-semibold">A clearer picture over time</h2>
        <p className="text-base text-muted">Charts appear once a test has been recorded twice.</p>
        <Link href="/bloodwork/new" className="mt-1 flex min-h-tap items-center gap-2 rounded-xl bg-brand px-5 font-semibold text-brand-foreground">
          <Icon name="plus" className="size-5" /> Add bloodwork
        </Link>
      </section>
    );
  }

  // Every series has 2+ points, oldest first. Load the changes once for the span of all of them.
  const allTimes = series.flatMap((entry) => entry.points.map((point) => point.drawnAt.getTime()));
  const changes = await listMedicationChanges(
    db,
    dayKey(new Date(Math.min(...allTimes))),
    nextDayKey(dayKey(new Date(Math.max(...allTimes)))),
  );

  const views: TrendChartSeries[] = series.map((entry) => {
    const firstDay = dayKey(entry.points[0].drawnAt);
    const lastDay = dayKey(entry.points[entry.points.length - 1].drawnAt);
    return {
      key: entry.key,
      testName: entry.testName,
      unit: entry.unit,
      points: entry.points.map((point) => ({
        id: point.drawId,
        time: point.drawnAt.getTime(),
        value: point.value,
        rangeLow: point.rangeLow,
        rangeHigh: point.rangeHigh,
      })),
      changes: changes
        .filter((change) => change.date >= firstDay && change.date <= lastDay)
        .map((change) => ({
          // The household midnight that starts the change's day.
          time: (parseHouseholdDateTime(`${change.date}T00:00`) as Date).getTime(),
          text: `${formatDate(change.date)} — ${change.description}`,
        })),
    };
  });

  return (
    <ul className="flex flex-col gap-4">
      {views.map((view) => (
        <li key={view.key}>
          <TrendChart series={view} />
        </li>
      ))}
    </ul>
  );
}

export default function TrendsPage() {
  return (
    <main className="flex flex-col gap-6">
      <Link href="/bloodwork" className="inline-flex min-h-tap items-center self-start text-lg font-semibold text-brand">
        <Icon name="left" className="mr-1 size-5" /> Bloodwork
      </Link>
      <PageHeading title="Trends" description="Follow lab results alongside medication changes." icon="chart" />
      <Suspense fallback={<p className="mt-2 text-center text-base text-muted">Loading…</p>}>
        <TrendsContent />
      </Suspense>
    </main>
  );
}
