import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { listDraws, type BloodResult } from "@/lib/data/bloodwork";
import { getDb } from "@/lib/db/client";
import { formatDate, formatTime } from "@/lib/format";
import { householdDateTimeValue } from "@/lib/time";
import DrawForm from "./DrawForm";

const linkButton = "flex min-h-tap items-center justify-center rounded-xl px-4 text-base font-semibold";

function rangeText(result: BloodResult): string | null {
  const { rangeLow, rangeHigh } = result;
  if (rangeLow !== null && rangeHigh !== null) return `${rangeLow}–${rangeHigh}`;
  if (rangeLow !== null) return `≥ ${rangeLow}`;
  if (rangeHigh !== null) return `≤ ${rangeHigh}`;
  return null;
}

function flag(result: BloodResult): "Low" | "High" | null {
  if (result.rangeLow !== null && result.value < result.rangeLow) return "Low";
  if (result.rangeHigh !== null && result.value > result.rangeHigh) return "High";
  return null;
}

function ResultLine({ result }: { result: BloodResult }) {
  const range = rangeText(result);
  const flagged = flag(result);
  return (
    <li className="border-t border-border pt-3">
      <p className="text-lg font-semibold break-words">{result.testName}</p>
      <p className={`text-lg ${flagged ? "font-bold text-alert" : ""}`}>
        {result.value} {result.unit}
        {flagged && ` · ${flagged}`}
      </p>
      {range && <p className="text-base text-muted">Range {range}</p>}
    </li>
  );
}

async function BloodworkContent() {
  await connection();
  const draws = await listDraws(getDb());

  if (draws.length === 0) {
    return (
      <>
        <p className="text-lg text-muted">No bloodwork yet</p>
        <DrawForm initialDrawnAt={householdDateTimeValue(new Date()).slice(0, 16)} initialRows={[]} showCancel={false} />
      </>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {draws.map((draw) => (
        <li key={draw.id} className="sw-card flex flex-col gap-3 p-5">
          <div>
            <p className="text-xl font-semibold">{formatDate(draw.drawnAt)}</p>
            <p className="text-base text-muted">
              {formatTime(draw.drawnAt)}
              {draw.lab && ` · ${draw.lab}`}
            </p>
          </div>
          {draw.notes && <p className="text-base whitespace-pre-line">{draw.notes}</p>}
          <ul className="flex flex-col gap-3">
            {draw.results.map((result) => (
              <ResultLine key={result.id} result={result} />
            ))}
          </ul>
          <Link href={`/bloodwork/${draw.id}/edit`} className={`${linkButton} border-2 border-border`}>
            Edit
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function BloodworkPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-4xl font-semibold">Bloodwork</h1>
      <div className="grid grid-cols-2 gap-3">
        <Link href="/bloodwork/new" className={`${linkButton} min-h-14 bg-brand text-lg font-bold text-background`}>
          Add bloodwork
        </Link>
        <Link href="/bloodwork/trends" className={`${linkButton} min-h-14 border-2 border-border`}>
          Trends
        </Link>
      </div>
      <Suspense fallback={<p className="mt-2 text-center text-base text-muted">Loading…</p>}>
        <BloodworkContent />
      </Suspense>
    </main>
  );
}
