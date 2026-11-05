import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getDraw } from "@/lib/data/bloodwork";
import { getDb } from "@/lib/db/client";
import { householdDateTimeValue } from "@/lib/time";
import DeleteDraw from "../../DeleteDraw";
import DrawForm from "../../DrawForm";

async function EditContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const draw = await getDraw(getDb(), id);
  if (!draw) notFound();

  return (
    <>
      <DrawForm
        draw={{
          id: draw.id,
          updatedAt: draw.updatedAt.toISOString(),
          drawnAt: householdDateTimeValue(draw.drawnAt).slice(0, 16),
          lab: draw.lab ?? "",
          notes: draw.notes ?? "",
        }}
        initialRows={draw.results.map((result) => ({
          testName: result.testName,
          value: String(result.value),
          unit: result.unit,
          rangeLow: result.rangeLow === null ? "" : String(result.rangeLow),
          rangeHigh: result.rangeHigh === null ? "" : String(result.rangeHigh),
        }))}
      />
      <DeleteDraw id={draw.id} />
    </>
  );
}

export default function EditBloodworkPage({ params }: PageProps<"/bloodwork/[id]/edit">) {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-4xl font-semibold">Edit bloodwork</h1>
      <Suspense fallback={<p className="mt-2 text-center text-base text-muted">Loading…</p>}>
        <EditContent params={params} />
      </Suspense>
    </main>
  );
}
