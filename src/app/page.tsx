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
      <section aria-label="Since the last seizure" className="sw-card p-6">
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

    </>
  );
}

// Reads the database on every request, so it streams in behind a placeholder instead of being prerendered.
export default function HomePage() {
  return (
    <main className="flex flex-col gap-6">
      <div><p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-muted">Your daily companion</p><h1 className="text-4xl font-semibold">Today</h1><p className="mt-2 text-muted">A little clarity, one day at a time.</p></div>
      <Suspense fallback={<p className="text-center mt-2 text-base text-muted">Loading…</p>}>
        <HomeContent />
      </Suspense>
    </main>
  );
}
