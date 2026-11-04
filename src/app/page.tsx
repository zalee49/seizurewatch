import { Suspense } from "react";
import { connection } from "next/server";
import SeizureButton from "@/components/SeizureButton";
import { getActiveSeizure, getLastSeizure } from "@/lib/data/seizures";
import { getDb } from "@/lib/db/client";
import { formatDate, formatTime } from "@/lib/format";
import { daysBetween, dayKey, todayKey } from "@/lib/time";

function daysSinceText(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "1 day since last seizure";
  return `${days} days since last seizure`;
}

async function HomeContent() {
  await connection();
  const db = getDb();
  const [active, last] = await Promise.all([getActiveSeizure(db), getLastSeizure(db)]);

  return (
    <>
      <SeizureButton
        active={active ? { id: active.id, startedAt: active.startedAt } : null}
        last={last ? { id: last.id, startedAt: last.startedAt, endedAt: last.endedAt } : null}
      />
      <section aria-label="Since the last seizure" className="text-center">
        {last ? (
          <>
            <p className="text-2xl font-semibold">
              {daysSinceText(daysBetween(dayKey(last.startedAt), todayKey()))}
            </p>
            <p className="text-lg text-muted">
              Last seizure {formatDate(last.startedAt)}, {formatTime(last.startedAt)}
            </p>
          </>
        ) : (
          <p className="text-2xl font-semibold">No seizures logged yet</p>
        )}
      </section>
    </>
  );
}

// Reads the database on every request, so it streams in behind a placeholder instead of being prerendered.
export default function HomePage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="sr-only">Today</h1>
      <Suspense fallback={<p className="text-center text-lg text-muted">Loading…</p>}>
        <HomeContent />
      </Suspense>
    </main>
  );
}
