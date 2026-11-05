"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { addResponseAction, deleteResponseAction } from "@/app/seizures/actions";
import type { SeizureResponse } from "@/lib/data/seizures";
import type { SaveResult } from "@/lib/data/result";
import { formatDate, formatTime } from "@/lib/format";
import { dayKey, householdDateTimeValue } from "@/lib/time";
import type { ResponseKind } from "@/lib/validation/seizure";
import { FieldError, inputClass, labelClass, SaveProblem, textAreaClass, ToggleGroup } from "./fields";

const KIND_OPTIONS = [
  { value: "rescue_med", label: "Rescue med" },
  { value: "other", label: "Other" },
] as const;

type RescueMed = { drugName: string; doseAmount: number; doseUnit: string; when: string | null };

function describe(response: SeizureResponse): string {
  if (response.kind === "rescue_med") {
    const dose = [response.doseAmount, response.doseUnit].filter((part) => part !== null).join(" ");
    return dose ? `${response.medicationName} ${dose}` : (response.medicationName ?? "Rescue med");
  }
  return response.description ?? "Other";
}

function givenText(givenAt: Date | null, seizureStartedAt: Date): string | null {
  if (!givenAt) return null;
  const sameDay = dayKey(givenAt) === dayKey(seizureStartedAt);
  return sameDay ? `Given ${formatTime(givenAt)}` : `Given ${formatDate(givenAt)}, ${formatTime(givenAt)}`;
}

function ResponseItem({ response, seizureStartedAt }: { response: SeizureResponse; seizureStartedAt: Date }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setProblem(null);
    try {
      const result = await deleteResponseAction(response.id);
      if (!result.ok) setProblem(result.message);
    } catch {
      setProblem("Not deleted — check the connection and try again.");
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  }

  const given = givenText(response.givenAt, seizureStartedAt);
  return (
    <li className="rounded-xl border-2 border-border p-3">
      <p className="text-lg font-semibold">{describe(response)}</p>
      <p className="text-sm text-muted">
        {response.kind === "rescue_med" ? "Rescue med" : "Other"}
        {given && ` · ${given}`}
      </p>
      {confirming ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="min-h-tap rounded-xl bg-alert text-base font-semibold text-alert-foreground disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete it"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={deleting}
            className="min-h-tap rounded-xl border-2 border-border text-base font-semibold"
          >
            Keep it
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-2 min-h-tap px-1 text-base font-semibold text-alert"
        >
          Delete
        </button>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-sm font-semibold text-alert">
          {problem}
        </p>
      )}
    </li>
  );
}

function AddResponseForm({
  seizureId,
  defaultGivenAt,
  rescueMeds,
  onDone,
}: {
  seizureId: string;
  defaultGivenAt: string;
  rescueMeds: RescueMed[];
  onDone: () => void;
}) {
  const [kind, setKind] = useState<ResponseKind>("rescue_med");
  // Controlled so a suggestion button can fill them; the form is never reset, so a refused save keeps them.
  const [medicationName, setMedicationName] = useState("");
  const [doseAmount, setDoseAmount] = useState("");
  const [doseUnit, setDoseUnit] = useState("");
  const [state, formAction, pending] = useActionState(
    async (prev: SaveResult<SeizureResponse> | null, formData: FormData) => {
      const result = await addResponseAction(prev, formData);
      if (result.ok) onDone();
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Submitted by hand so React doesn't reset the fields: a refused save keeps what was typed.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form onSubmit={submit} aria-label="Add what we did" className="flex flex-col gap-4 rounded-xl border-2 border-brand p-4">
      <input type="hidden" name="id" value={seizureId} />
      <ToggleGroup
        name="kind"
        label="What was it?"
        options={KIND_OPTIONS}
        value={kind}
        onChange={(value) => setKind(value ?? kind)}
        columns={2}
        error={errors.kind}
      />

      {kind === "rescue_med" ? (
        <>
          {rescueMeds.length > 0 && (
            <div>
              <p className={labelClass}>Current rescue meds</p>
              <div className="flex flex-col gap-2">
                {rescueMeds.map((med, index) => (
                  <button
                    key={`${med.drugName}-${index}`}
                    type="button"
                    onClick={() => {
                      setMedicationName(med.drugName);
                      setDoseAmount(String(med.doseAmount));
                      setDoseUnit(med.doseUnit);
                    }}
                    className="min-h-tap rounded-xl border-2 border-brand px-3 text-base font-semibold text-brand"
                  >
                    {med.drugName} {med.doseAmount} {med.doseUnit}
                    {med.when && ` (${med.when})`}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <label htmlFor="medicationName" className={labelClass}>
              Medication
            </label>
            <input
              id="medicationName"
              name="medicationName"
              value={medicationName}
              onChange={(event) => setMedicationName(event.target.value)}
              autoComplete="off"
              aria-describedby={errors.medicationName ? "medicationName-error" : undefined}
              className={inputClass}
            />
            <FieldError id="medicationName-error" message={errors.medicationName} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="doseAmount" className={labelClass}>
                Dose
              </label>
              <input
                id="doseAmount"
                name="doseAmount"
                value={doseAmount}
                onChange={(event) => setDoseAmount(event.target.value)}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                aria-describedby={errors.doseAmount ? "doseAmount-error" : undefined}
                className={inputClass}
              />
              <FieldError id="doseAmount-error" message={errors.doseAmount} />
            </div>
            <div>
              <label htmlFor="doseUnit" className={labelClass}>
                Unit
              </label>
              <input
                id="doseUnit"
                name="doseUnit"
                value={doseUnit}
                onChange={(event) => setDoseUnit(event.target.value)}
                placeholder="mg, mL"
                autoComplete="off"
                aria-describedby={errors.doseUnit ? "doseUnit-error" : undefined}
                className={inputClass}
              />
              <FieldError id="doseUnit-error" message={errors.doseUnit} />
            </div>
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="description" className={labelClass}>
            What did you do?
          </label>
          <textarea
            id="description"
            name="description"
            rows={3}
            aria-describedby={errors.description ? "description-error" : undefined}
            className={textAreaClass}
          />
          <FieldError id="description-error" message={errors.description} />
        </div>
      )}

      <div>
        <label htmlFor="givenAt" className={labelClass}>
          When
        </label>
        <input
          id="givenAt"
          name="givenAt"
          type="datetime-local"
          defaultValue={defaultGivenAt}
          aria-describedby={errors.givenAt ? "givenAt-error" : undefined}
          className={inputClass}
        />
        <FieldError id="givenAt-error" message={errors.givenAt} />
      </div>

      {state && !state.ok && <SaveProblem message={state.message} conflict={false} />}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-14 rounded-xl bg-brand text-lg font-bold text-brand-foreground disabled:opacity-60"
        >
          {pending ? "Saving…" : "Add"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="min-h-14 rounded-xl border-2 border-border text-lg font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function Responses({
  seizureId,
  seizureStartedAt,
  responses,
  rescueMeds,
}: {
  seizureId: string;
  seizureStartedAt: Date;
  responses: SeizureResponse[];
  rescueMeds: RescueMed[];
}) {
  // Set when the form opens, so "When" starts at the time it was opened (minutes only).
  const [openedAt, setOpenedAt] = useState<string | null>(null);

  return (
    <section aria-labelledby="responses-heading" className="sw-card flex flex-col gap-4 p-5">
      <h2 id="responses-heading" className="text-2xl font-semibold">
        What we did
      </h2>
      {responses.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {responses.map((response) => (
            <ResponseItem key={response.id} response={response} seizureStartedAt={seizureStartedAt} />
          ))}
        </ul>
      ) : (
        <p className="text-base text-muted">Nothing recorded yet.</p>
      )}
      {openedAt ? (
        <AddResponseForm seizureId={seizureId} defaultGivenAt={openedAt} rescueMeds={rescueMeds} onDone={() => setOpenedAt(null)} />
      ) : (
        <button
          type="button"
          onClick={() => setOpenedAt(householdDateTimeValue(new Date()).slice(0, 16))}
          className="min-h-14 w-full rounded-xl border-2 border-brand text-lg font-semibold text-brand"
        >
          Add rescue med or other
        </button>
      )}
    </section>
  );
}
