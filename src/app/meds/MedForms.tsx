"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";
import type { SaveResult } from "@/lib/data/result";
import type { MedicationPeriod } from "@/lib/data/medications";
import { FieldError, inputClass, labelClass, SaveProblem, textAreaClass, ToggleGroup } from "@/app/seizures/[id]/fields";
import type { MedicationRole } from "@/lib/validation/medication";
import {
  changeMedicationAction,
  correctPeriodAction,
  deletePeriodAction,
  startMedicationAction,
  stopMedicationAction,
} from "./actions";

// A period as the page loaded it. `updatedAt` is the ISO version every edit form sends back.
export type PeriodView = Omit<MedicationPeriod, "updatedAt"> & { updatedAt: string };

type PeriodAction = (prev: SaveResult<MedicationPeriod> | null, formData: FormData) => Promise<SaveResult<MedicationPeriod>>;

const ROLE_OPTIONS = [
  { value: "maintenance", label: "Daily" },
  { value: "rescue", label: "Rescue" },
] as const;

const primaryButton = "min-h-14 w-full rounded-xl bg-brand text-lg font-bold text-background disabled:opacity-60";
const secondaryButton = "min-h-tap rounded-xl border-2 border-border px-4 text-base font-semibold";

// Runs `action`, calls `onDone` when it saves, and submits by hand so React doesn't reset the
// fields: a refused save keeps what was typed.
function useMedForm(action: PeriodAction, onDone: () => void) {
  const [state, formAction, pending] = useActionState(async (prev: SaveResult<MedicationPeriod> | null, formData: FormData) => {
    const result = await action(prev, formData);
    if (result.ok) onDone();
    return result;
  }, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return { state, errors, pending, submit };
}

function Field({
  name,
  label,
  errors,
  children,
}: {
  name: string;
  label: string;
  errors: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
      </label>
      {children}
      <FieldError id={`${name}-error`} message={errors[name]} />
    </div>
  );
}

function describedBy(errors: Record<string, string>, name: string) {
  return errors[name] ? `${name}-error` : undefined;
}

// Dose, unit and schedule, prefilled when changing or fixing a period.
function DoseFields({ errors, period }: { errors: Record<string, string>; period?: PeriodView }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field name="doseAmount" label="Dose" errors={errors}>
          <input
            id="doseAmount"
            name="doseAmount"
            type="text"
            inputMode="decimal"
            required
            defaultValue={period ? String(period.doseAmount) : ""}
            aria-describedby={describedBy(errors, "doseAmount")}
            className={inputClass}
          />
        </Field>
        <Field name="doseUnit" label="Unit" errors={errors}>
          <input
            id="doseUnit"
            name="doseUnit"
            type="text"
            required
            placeholder="mg"
            defaultValue={period?.doseUnit ?? ""}
            aria-describedby={describedBy(errors, "doseUnit")}
            className={inputClass}
          />
        </Field>
      </div>
      <Field name="schedule" label="How often" errors={errors}>
        <input
          id="schedule"
          name="schedule"
          type="text"
          required
          placeholder="Twice daily"
          defaultValue={period?.schedule ?? ""}
          aria-describedby={describedBy(errors, "schedule")}
          className={inputClass}
        />
      </Field>
    </>
  );
}

function DateField({
  name,
  label,
  defaultValue,
  required,
  errors,
}: {
  name: string;
  label: string;
  defaultValue: string;
  required: boolean;
  errors: Record<string, string>;
}) {
  return (
    <Field name={name} label={label} errors={errors}>
      <input
        id={name}
        name={name}
        type="date"
        required={required}
        defaultValue={defaultValue}
        aria-describedby={describedBy(errors, name)}
        className={inputClass}
      />
    </Field>
  );
}

function NoteField({ errors, defaultValue }: { errors: Record<string, string>; defaultValue: string }) {
  return (
    <Field name="note" label="Note (optional)" errors={errors}>
      <textarea
        id="note"
        name="note"
        rows={2}
        defaultValue={defaultValue}
        aria-describedby={describedBy(errors, "note")}
        className={textAreaClass}
      />
    </Field>
  );
}

function FormShell({
  title,
  titleId,
  onSubmit,
  state,
  pending,
  submitLabel,
  onCancel,
  children,
}: {
  title: string;
  titleId: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  state: SaveResult<MedicationPeriod> | null;
  pending: boolean;
  submitLabel: string;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit} aria-labelledby={titleId} className="flex flex-col gap-4 rounded-xl border-2 border-border p-4">
      <h3 id={titleId} className="text-xl font-semibold">
        {title}
      </h3>
      {children}
      {state && !state.ok && <SaveProblem message={state.message} conflict={state.error === "conflict"} />}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Saving…" : submitLabel}
      </button>
      <button type="button" onClick={onCancel} disabled={pending} className={secondaryButton}>
        Cancel
      </button>
    </form>
  );
}

function EditTarget({ period }: { period: PeriodView }) {
  return (
    <>
      <input type="hidden" name="id" value={period.id} />
      <input type="hidden" name="expectedUpdatedAt" value={period.updatedAt} />
    </>
  );
}

function ChangeDoseForm({ period, today, onDone }: { period: PeriodView; today: string; onDone: () => void }) {
  const { state, errors, pending, submit } = useMedForm(changeMedicationAction, onDone);
  return (
    <FormShell
      title={`Change ${period.drugName} dose`}
      titleId={`change-${period.id}`}
      onSubmit={submit}
      state={state}
      pending={pending}
      submitLabel="Save new dose"
      onCancel={onDone}
    >
      <EditTarget period={period} />
      <DoseFields errors={errors} period={period} />
      <DateField name="effectiveDate" label="Starting" defaultValue={today} required errors={errors} />
      <NoteField errors={errors} defaultValue={period.note ?? ""} />
    </FormShell>
  );
}

function StopForm({ period, today, onDone }: { period: PeriodView; today: string; onDone: () => void }) {
  const { state, errors, pending, submit } = useMedForm(stopMedicationAction, onDone);
  return (
    <FormShell
      title={`Stop ${period.drugName}`}
      titleId={`stop-${period.id}`}
      onSubmit={submit}
      state={state}
      pending={pending}
      submitLabel="Stop it"
      onCancel={onDone}
    >
      <EditTarget period={period} />
      <DateField name="stopDate" label="Stopped on" defaultValue={today} required errors={errors} />
    </FormShell>
  );
}

function DeletePeriod({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function confirmDelete() {
    setDeleting(true);
    setProblem(null);
    try {
      const result = await deletePeriodAction(id);
      if (result.ok) {
        onDeleted();
        return;
      }
      setProblem(result.message);
    } catch {
      setProblem("Not deleted — check the connection and try again.");
    }
    setDeleting(false);
    setConfirming(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {confirming ? (
        <div className="rounded-xl border-2 border-alert p-4">
          <p className="text-lg font-semibold">Delete this entry?</p>
          <p className="mt-1 text-sm text-muted">Use this only for an entry made by mistake. It can&apos;t be undone.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="min-h-14 rounded-xl bg-alert text-lg font-bold text-alert-foreground disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete it"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="min-h-14 rounded-xl border-2 border-border text-lg font-semibold"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="min-h-tap w-full rounded-xl border-2 border-alert text-base font-semibold text-alert"
        >
          Delete this entry
        </button>
      )}
      {problem && (
        <p role="alert" className="text-base font-semibold text-alert">
          {problem}
        </p>
      )}
    </div>
  );
}

function FixForm({ period, onDone }: { period: PeriodView; onDone: () => void }) {
  const { state, errors, pending, submit } = useMedForm(correctPeriodAction, onDone);
  const [role, setRole] = useState<MedicationRole | null>(period.role);
  return (
    <div className="flex flex-col gap-4">
      <FormShell
        title={`Fix ${period.drugName}`}
        titleId={`fix-${period.id}`}
        onSubmit={submit}
        state={state}
        pending={pending}
        submitLabel="Save fix"
        onCancel={onDone}
      >
        <EditTarget period={period} />
        <Field name="drugName" label="Medication" errors={errors}>
          <input
            id="drugName"
            name="drugName"
            type="text"
            required
            defaultValue={period.drugName}
            aria-describedby={describedBy(errors, "drugName")}
            className={inputClass}
          />
        </Field>
        <ToggleGroup name="role" label="Type" options={ROLE_OPTIONS} value={role} onChange={setRole} columns={2} error={errors.role} />
        <DoseFields errors={errors} period={period} />
        <DateField name="startDate" label="Started" defaultValue={period.startDate} required errors={errors} />
        <DateField name="endDate" label="Ends (optional)" defaultValue={period.endDate ?? ""} required={false} errors={errors} />
        <NoteField errors={errors} defaultValue={period.note ?? ""} />
      </FormShell>
      <DeletePeriod id={period.id} onDeleted={onDone} />
    </div>
  );
}

type Panel = "change" | "stop" | "fix";

const PANEL_BUTTONS: { panel: Panel; label: string }[] = [
  { panel: "change", label: "Change dose" },
  { panel: "stop", label: "Stop" },
  { panel: "fix", label: "Fix a mistake" },
];

export function MedicationActions({ period, today }: { period: PeriodView; today: string }) {
  const [open, setOpen] = useState<Panel | null>(null);
  const close = () => setOpen(null);
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {PANEL_BUTTONS.map(({ panel, label }) => (
          <button
            key={panel}
            type="button"
            aria-expanded={open === panel}
            onClick={() => setOpen(open === panel ? null : panel)}
            className={`min-h-tap rounded-xl border-2 px-4 text-base font-semibold ${
              open === panel ? "border-brand bg-brand text-background" : "border-border text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {open === "change" && <ChangeDoseForm period={period} today={today} onDone={close} />}
      {open === "stop" && <StopForm period={period} today={today} onDone={close} />}
      {open === "fix" && <FixForm period={period} onDone={close} />}
    </div>
  );
}

// "Fix a mistake" on a history row, so past and planned periods can be corrected or deleted too.
export function HistoryFix({ period }: { period: PeriodView }) {
  const [open, setOpen] = useState(false);
  if (open) {
    return (
      <div className="mt-3">
        <FixForm period={period} onDone={() => setOpen(false)} />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOpen(true)} className={`mt-2 ${secondaryButton}`}>
      Fix a mistake
    </button>
  );
}

function AddForm({ today, onDone }: { today: string; onDone: () => void }) {
  const { state, errors, pending, submit } = useMedForm(startMedicationAction, onDone);
  const [role, setRole] = useState<MedicationRole | null>("maintenance");
  return (
    <FormShell
      title="Add medication"
      titleId="add-medication"
      onSubmit={submit}
      state={state}
      pending={pending}
      submitLabel="Add medication"
      onCancel={onDone}
    >
      <Field name="drugName" label="Medication" errors={errors}>
        <input
          id="drugName"
          name="drugName"
          type="text"
          required
          aria-describedby={describedBy(errors, "drugName")}
          className={inputClass}
        />
      </Field>
      <ToggleGroup name="role" label="Type" options={ROLE_OPTIONS} value={role} onChange={setRole} columns={2} error={errors.role} />
      <DoseFields errors={errors} />
      <DateField name="startDate" label="Started" defaultValue={today} required errors={errors} />
      <NoteField errors={errors} defaultValue="" />
    </FormShell>
  );
}

// With no medications yet the form starts open and has nothing to cancel back to, so Cancel just
// closes it and the button returns.
export function AddMedication({ today, startOpen }: { today: string; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  if (open) return <AddForm today={today} onDone={() => setOpen(false)} />;
  return (
    <button type="button" onClick={() => setOpen(true)} className={primaryButton}>
      Add medication
    </button>
  );
}
