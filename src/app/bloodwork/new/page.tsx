import { Suspense } from "react";
import { connection } from "next/server";
import PageHeading from "@/components/PageHeading";
import { listDraws } from "@/lib/data/bloodwork";
import { getDb } from "@/lib/db/client";
import { householdDateTimeValue } from "@/lib/time";
import DrawForm from "../DrawForm";

async function NewDrawContent() {
  await connection();
  const [latest] = await listDraws(getDb());
  // The latest draw's tests, units and ranges, with the values left for today's results.
  const rows = (latest?.results ?? []).map((result) => ({
    testName: result.testName,
    value: "",
    unit: result.unit,
    rangeLow: result.rangeLow === null ? "" : String(result.rangeLow),
    rangeHigh: result.rangeHigh === null ? "" : String(result.rangeHigh),
  }));
  return <DrawForm initialDrawnAt={householdDateTimeValue(new Date()).slice(0, 16)} initialRows={rows} />;
}

export default function NewBloodworkPage() {
  return (
    <main className="flex flex-col gap-6">
      <PageHeading title="Add bloodwork" description="Keep lab results together in one place." icon="flask" />
      <Suspense fallback={<p className="mt-2 text-center text-base text-muted">Loading…</p>}>
        <NewDrawContent />
      </Suspense>
    </main>
  );
}
