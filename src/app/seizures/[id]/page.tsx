import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import PageHeading from "@/components/PageHeading";
import { listCurrentMedications } from "@/lib/data/medications";
import { getSeizure } from "@/lib/data/seizures";
import { getDb } from "@/lib/db/client";
import { formatDate, formatDuration, formatTime } from "@/lib/format";
import { dayKey, householdDateTimeValue } from "@/lib/time";
import { MAX_SEIZURE_SECONDS } from "@/lib/validation/seizure";
import DeleteSeizure from "./DeleteSeizure";
import Responses from "./Responses";
import SeizureDetailsForm from "./SeizureDetailsForm";

// Read at request time (after `connection()`): an unstopped seizure stays "still going" for 2 hours.
function durationText(startedAt: Date, endedAt: Date | null): string {
  if (endedAt) return `Lasted ${formatDuration((endedAt.getTime() - startedAt.getTime()) / 1000)}`;
  if (Date.now() - startedAt.getTime() <= MAX_SEIZURE_SECONDS * 1000) return "Still going — stop it on Today";
  return "Duration not recorded";
}

async function SeizureContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const seizure = await getSeizure(getDb(), id);
  if (!seizure) notFound();

  const rescueMeds = (await listCurrentMedications(getDb(), dayKey(seizure.startedAt))).filter(
    (med) => med.role === "rescue",
  );

  // The recorded duration in whole seconds, split for the minutes and seconds fields.
  const recordedSeconds = seizure.endedAt
    ? Math.round((seizure.endedAt.getTime() - seizure.startedAt.getTime()) / 1000)
    : null;

  return (
    <>
      <section aria-label="Summary" className="sw-card p-6">
        <p className="text-2xl font-semibold tracking-tight">{formatDate(seizure.startedAt)}</p>
        <p className="mt-1 text-lg text-muted">
          Started {formatTime(seizure.startedAt)} · {durationText(seizure.startedAt, seizure.endedAt)}
        </p>
      </section>

      <SeizureDetailsForm
        seizure={{
          id: seizure.id,
          updatedAt: seizure.updatedAt.toISOString(),
          startedAt: householdDateTimeValue(seizure.startedAt),
          stopped: seizure.endedAt !== null,
          durationMinutes: recordedSeconds === null ? "" : String(Math.floor(recordedSeconds / 60)),
          durationSeconds: recordedSeconds === null ? "" : String(recordedSeconds % 60),
          seizureType: seizure.seizureType,
          severity: seizure.severity,
          beforeSymptoms: seizure.beforeSymptoms ?? "",
          afterSymptoms: seizure.afterSymptoms ?? "",
          triggers: seizure.triggers ?? "",
          notes: seizure.notes ?? "",
          recoveryMinutes: seizure.recoveryMinutes === null ? "" : String(seizure.recoveryMinutes),
        }}
      />

      <Responses
        seizureId={seizure.id}
        seizureStartedAt={seizure.startedAt}
        responses={seizure.responses}
        rescueMeds={rescueMeds.flatMap((med) =>
          med.doses.map((line) => ({
            drugName: med.drugName,
            doseAmount: line.amount,
            doseUnit: med.doseUnit,
            when: med.doses.length > 1 ? line.when : null,
          })),
        )}
      />

      <DeleteSeizure id={seizure.id} />
    </>
  );
}

// The route param is runtime data, so the seizure streams in behind a placeholder.
export default function SeizurePage({ params }: PageProps<"/seizures/[id]">) {
  return (
    <main className="flex flex-col gap-6">
      <PageHeading title="Seizure" description="The details that help you see the full picture." icon="activity" />
      <Suspense fallback={<p className="mt-2 text-center text-base text-muted">Loading…</p>}>
        <SeizureContent params={params} />
      </Suspense>
    </main>
  );
}
