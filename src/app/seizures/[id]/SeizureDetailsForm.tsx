"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { saveSeizureDetailsAction } from "@/app/seizures/actions";
import type { Seizure } from "@/lib/data/seizures";
import type { SaveResult } from "@/lib/data/result";
import { formatTime } from "@/lib/format";
import type { SeizureType, Severity } from "@/lib/validation/seizure";
import { FieldError, inputClass, labelClass, SaveProblem, textAreaClass, ToggleGroup } from "./fields";

// Form values as strings, ready for inputs. `startedAt` is a datetime-local value with seconds.
export type SeizureFormValues = {
  id: string;
  updatedAt: string;
  startedAt: string;
  stopped: boolean;
  durationMinutes: string;
  durationSeconds: string;
  seizureType: SeizureType | null;
  severity: Severity | null;
  beforeSymptoms: string;
  afterSymptoms: string;
  triggers: string;
  notes: string;
  recoveryMinutes: string;
};

const TYPE_OPTIONS = [
  { value: "generalized", label: "Generalized" },
  { value: "focal", label: "Focal" },
  { value: "focal_to_generalized", label: "Focal, then generalized" },
  { value: "potato_bug", label: "Potato bug" },
  { value: "demon", label: "Demon" },
  { value: "walk_around_blind", label: "Walk around blind" },
  { value: "unsure", label: "Not sure" },
] as const;

const SEVERITY_OPTIONS = [
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
] as const;

const TEXT_FIELDS = [
  { name: "beforeSymptoms", label: "Before — what did you notice?" },
  { name: "afterSymptoms", label: "After — how was he?" },
  { name: "triggers", label: "Possible triggers" },
  { name: "notes", label: "Notes" },
] as const;

// Browsers may drop ":00" seconds from a datetime-local value; compare without them.
function sameDateTime(value: FormDataEntryValue | null, original: string): boolean {
  const trim = (text: string) => (text.length === 19 && text.endsWith(":00") ? text.slice(0, 16) : text);
  return typeof value === "string" && trim(value) === trim(original);
}

export default function SeizureDetailsForm({ seizure }: { seizure: SeizureFormValues }) {
  // The version these fields were loaded from. It moves only with this form's own saves, so a change
  // from the other phone (brought in by a refresh) makes the next save a conflict, never an overwrite.
  const [version, setVersion] = useState(seizure.updatedAt);
  const [seizureType, setSeizureType] = useState(seizure.seizureType);
  const [severity, setSeverity] = useState(seizure.severity);
  const [state, formAction, pending] = useActionState(
    async (prev: SaveResult<Seizure> | null, formData: FormData) => {
      const result = await saveSeizureDetailsAction(prev, formData);
      if (result.ok) setVersion(result.value.updatedAt.toISOString());
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Submitted by hand so React doesn't reset the fields: a refused save keeps what was typed.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // Untouched start and duration aren't sent, so a save never rounds the recorded times.
    const startChanged = !sameDateTime(formData.get("startedAt"), seizure.startedAt);
    if (!startChanged) formData.delete("startedAt");
    if (
      !startChanged &&
      formData.get("durationMinutes") === seizure.durationMinutes &&
      formData.get("durationSeconds") === seizure.durationSeconds
    ) {
      formData.delete("durationMinutes");
      formData.delete("durationSeconds");
    }
    startTransition(() => formAction(formData));
  }

  const durationError = errors.durationSeconds ?? errors.endedAt;

  return (
    <form onSubmit={submit} aria-labelledby="details-heading" className="sw-card flex flex-col gap-5 p-5">
      <h2 id="details-heading" className="text-2xl font-semibold">
        What happened
      </h2>
      <input type="hidden" name="id" value={seizure.id} />
      <input type="hidden" name="expectedUpdatedAt" value={version} />

      <div>
        <label htmlFor="startedAt" className={labelClass}>
          Started
        </label>
        <input
          id="startedAt"
          name="startedAt"
          type="datetime-local"
          step={1}
          required
          defaultValue={seizure.startedAt}
          aria-describedby={errors.startedAt ? "startedAt-error" : undefined}
          className={inputClass}
        />
        <FieldError id="startedAt-error" message={errors.startedAt} />
      </div>

      <fieldset aria-describedby={durationError ? "duration-error" : "duration-hint"}>
        <legend className={labelClass}>How long it lasted</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Minutes</span>
            <input
              name="durationMinutes"
              type="number"
              inputMode="numeric"
              min={0}
              defaultValue={seizure.durationMinutes}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Seconds</span>
            <input
              name="durationSeconds"
              type="number"
              inputMode="numeric"
              min={0}
              max={59}
              defaultValue={seizure.durationSeconds}
              className={inputClass}
            />
          </label>
        </div>
        {!seizure.stopped && !durationError && (
          <p id="duration-hint" className="mt-1 text-sm text-muted">
            Not stopped yet. Entering how long it lasted stops it.
          </p>
        )}
        <FieldError id="duration-error" message={durationError} />
      </fieldset>

      <ToggleGroup
        name="seizureType"
        label="Type"
        options={TYPE_OPTIONS}
        value={seizureType}
        onChange={setSeizureType}
        columns={2}
        error={errors.seizureType}
      />
      <ToggleGroup
        name="severity"
        label="Severity"
        options={SEVERITY_OPTIONS}
        value={severity}
        onChange={setSeverity}
        columns={3}
        error={errors.severity}
      />

      {TEXT_FIELDS.map((field) => (
        <div key={field.name}>
          <label htmlFor={field.name} className={labelClass}>
            {field.label}
          </label>
          <textarea
            id={field.name}
            name={field.name}
            rows={3}
            defaultValue={seizure[field.name]}
            aria-describedby={errors[field.name] ? `${field.name}-error` : undefined}
            className={textAreaClass}
          />
          <FieldError id={`${field.name}-error`} message={errors[field.name]} />
        </div>
      ))}

      <div>
        <label htmlFor="recoveryMinutes" className={labelClass}>
          Minutes until he was back to normal
        </label>
        <input
          id="recoveryMinutes"
          name="recoveryMinutes"
          type="number"
          inputMode="numeric"
          min={0}
          defaultValue={seizure.recoveryMinutes}
          aria-describedby={errors.recoveryMinutes ? "recoveryMinutes-error" : undefined}
          className={inputClass}
        />
        <FieldError id="recoveryMinutes-error" message={errors.recoveryMinutes} />
      </div>

      {state && !state.ok && <SaveProblem message={state.message} conflict={state.error === "conflict"} />}
      {state?.ok && !pending && (
        <p role="status" className="text-base font-semibold text-brand">
          Saved {formatTime(state.value.updatedAt)}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="min-h-14 w-full rounded-xl bg-brand text-lg font-bold text-brand-foreground disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save details"}
      </button>
    </form>
  );
}
