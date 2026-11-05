import Link from "next/link";
import Icon from "@/components/Icon";
import PageHeading from "@/components/PageHeading";
import { Suspense } from "react";
import { connection } from "next/server";
import SeizureButton from "@/components/SeizureButton";
import { getActiveSeizure, getLastSeizure } from "@/lib/data/seizures";
import { getDb } from "@/lib/db/client";
import { formatDate, formatTime } from "@/lib/format";
import { daysBetween, dayKey, todayKey } from "@/lib/time";

function daysSinceText(days: number): string {
  if (days <= 0) return "Last seizure was today";
  if (days === 1) return "1 day since last seizure";
  return `${days} days since last seizure`;
}

async function HomeContent() {
  await connection();
  const db = getDb();
  const [active, last] = await Promise.all([getActiveSeizure(db), getLastSeizure(db)]);

  return (
    <>
      <section aria-label="Since the last seizure" className="sw-card sw-summary p-6">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold text-brand"><Icon name="activity" className="size-5" /> At a glance</p>
        {last ? (
          <>
            <p className="text-2xl font-semibold tracking-tight">
              {daysSinceText(daysBetween(dayKey(last.startedAt), todayKey()))}
            </p>
            <p className="mt-2 text-base text-muted">
              Last seizure {formatDate(last.startedAt)}, {formatTime(last.startedAt)}
            </p>
          </>
        ) : (
          <p className="text-2xl font-semibold tracking-tight">No seizures logged yet</p>
        )}
      </section>
      <SeizureButton
        active={active ? { id: active.id, startedAt: active.startedAt } : null}
        last={last ? { id: last.id, startedAt: last.startedAt, endedAt: last.endedAt } : null}
      />
      <div className="sw-quick-links grid grid-cols-2 gap-3" aria-label="Quick links">
        <Link href="/calendar" className="sw-card flex min-h-24 items-center gap-3 p-4 font-semibold">
          <span className="rounded-xl bg-brand/10 p-2 text-brand"><Icon name="calendar" /></span>
          Calendar
        </Link>
        <Link href="/meds" className="sw-card flex min-h-24 items-center gap-3 p-4 font-semibold">
          <span className="rounded-xl bg-accent/10 p-2 text-accent"><Icon name="pill" /></span>
          Meds
        </Link>
      </div>
    </>
  );
}

// Reads the database on every request, so it streams in behind a placeholder instead of being prerendered.
export default function HomePage() {
  return (
    <main className="flex flex-col gap-6">
      <PageHeading title="Today" description="Here for every moment." icon="sun" />
      <Suspense fallback={<p className="text-center mt-2 text-base text-muted">Loading…</p>}>
        <HomeContent />
      </Suspense>
    </main>
  );
}
