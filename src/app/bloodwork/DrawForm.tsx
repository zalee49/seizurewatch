"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useId, useRef, useState, type FormEvent } from "react";
import type { SaveResult } from "@/lib/data/result";
import type { BloodDraw } from "@/lib/data/bloodwork";
import { FieldError, inputClass, labelClass, SaveProblem, textAreaClass } from "@/app/seizures/[id]/fields";
import { createDrawAction, updateDrawAction } from "./actions";

// A result row as the form shows it: every field is the text in its input.
export type RowValues = {
  testName: string;
  value: string;
  unit: string;
  rangeLow: string;
  rangeHigh: string;
};

// A draw as the page loaded it, for the edit form. `updatedAt` is the ISO version sent back on save.
export type DrawFormDraw = {
  id: string;
  updatedAt: string;
  drawnAt: string;
  lab: string;
  notes: string;
};

type RowField = keyof RowValues;

const primaryButton = "min-h-14 w-full rounded-xl bg-brand text-lg font-bold text-brand-foreground disabled:opacity-60";
const secondaryButton =
  "flex min-h-tap items-center justify-center rounded-xl border-2 border-border px-4 text-base font-semibold";

const blankRow: RowValues = { testName: "", value: "", unit: "", rangeLow: "", rangeHigh: "" };

type Row = { key: string; values: RowValues };

export default function DrawForm({
  draw,
  initialDrawnAt,
  initialRows,
  showCancel = true,
}: {
  // Present when editing.
  draw?: DrawFormDraw;
  // The date and time for a new draw (household time, `YYYY-MM-DDTHH:mm`).
  initialDrawnAt?: string;
  // Rows to start with; one blank row when empty.
  initialRows: RowValues[];
  // Off where the form is the page's only content (no bloodwork yet), so there's nothing to cancel back to.
  showCancel?: boolean;
}) {
  const router = useRouter();
  const idPrefix = useId();
  const [rows, setRows] = useState<Row[]>(() =>
    (initialRows.length > 0 ? initialRows : [blankRow]).map((values, index) => ({ key: `row-${index}`, values })),
  );
  // Rows get keys row-0, row-1, ... and a removed row's key is never reused.
  const [nextKey, setNextKey] = useState(() => Math.max(initialRows.length, 1));
  // The row keys in the order they were submitted, so `results.<i>` errors still land on the
  // right row after rows are removed.
  const [submittedKeys, setSubmittedKeys] = useState<string[]>([]);
  // Pinned when the form opens: a refresh bringing the other phone's edit must not adopt its
  // version stamp, or this form's stale fields would save over that edit without a conflict.
  const [version] = useState(draw?.updatedAt);
  // A retried create uses the same draw id; the server never inserts its results twice.
  const createId = useRef<string | null>(null);

  const [state, formAction, pending] = useActionState(
    async (prev: SaveResult<BloodDraw> | null, formData: FormData) => {
      const result = await (draw ? updateDrawAction : createDrawAction)(prev, formData);
      if (result.ok) router.replace("/bloodwork");
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (!draw) {
      createId.current ??= crypto.randomUUID();
      formData.set("id", createId.current);
    }
    setSubmittedKeys(rows.map((row) => row.key));
    startTransition(() => formAction(formData));
  }

  function rowError(rowKey: string, field: RowField): string | undefined {
    const index = submittedKeys.indexOf(rowKey);
    return index === -1 ? undefined : errors[`results.${index}.${field}`];
  }

  const fieldId = (name: string) => `${idPrefix}${name}`;
  const describedBy = (name: string) => (errors[name] ? `${fieldId(name)}-error` : undefined);

  return (
    <form onSubmit={submit} aria-label={draw ? "Edit bloodwork" : "New bloodwork"} className="sw-card flex flex-col gap-4 p-5">
      {draw && (
        <>
          <input type="hidden" name="id" value={draw.id} />
          <input type="hidden" name="expectedUpdatedAt" value={version} />
        </>
      )}

      <div>
        <label htmlFor={fieldId("drawnAt")} className={labelClass}>
          Date and time drawn
        </label>
        <input
          id={fieldId("drawnAt")}
          name="drawnAt"
          type="datetime-local"
          required
          defaultValue={draw?.drawnAt ?? initialDrawnAt ?? ""}
          aria-describedby={describedBy("drawnAt")}
          className={inputClass}
        />
        <FieldError id={`${fieldId("drawnAt")}-error`} message={errors.drawnAt} />
      </div>

      <div>
        <label htmlFor={fieldId("lab")} className={labelClass}>
          Lab (optional)
        </label>
        <input
          id={fieldId("lab")}
          name="lab"
          type="text"
          defaultValue={draw?.lab ?? ""}
          aria-describedby={describedBy("lab")}
          className={inputClass}
        />
        <FieldError id={`${fieldId("lab")}-error`} message={errors.lab} />
      </div>

      <div>
        <label htmlFor={fieldId("notes")} className={labelClass}>
          Notes (optional)
        </label>
        <textarea
          id={fieldId("notes")}
          name="notes"
          rows={3}
          defaultValue={draw?.notes ?? ""}
          aria-describedby={describedBy("notes")}
          className={textAreaClass}
        />
        <FieldError id={`${fieldId("notes")}-error`} message={errors.notes} />
      </div>

      <fieldset className="flex flex-col gap-3" aria-describedby={describedBy("results")}>
        <legend className={labelClass}>Results</legend>
        {rows.map((row, position) => {
          const rid = (field: string) => `${idPrefix}${row.key}-${field}`;
          const props = (field: RowField) => ({
            id: rid(field),
            name: field,
            defaultValue: row.values[field],
            "aria-describedby": rowError(row.key, field) ? `${rid(field)}-error` : undefined,
          });
          return (
            <div key={row.key} className="flex flex-col gap-3 rounded-xl border-2 border-border p-3">
              <p className="text-base font-semibold text-muted">Result {position + 1}</p>
              <div>
                <label htmlFor={rid("testName")} className={labelClass}>
                  Test name
                </label>
                <input {...props("testName")} type="text" className={inputClass} />
                <FieldError id={`${rid("testName")}-error`} message={rowError(row.key, "testName")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor={rid("value")} className={labelClass}>
                    Value
                  </label>
                  <input {...props("value")} type="text" inputMode="decimal" className={inputClass} />
                  <FieldError id={`${rid("value")}-error`} message={rowError(row.key, "value")} />
                </div>
                <div className="min-w-0">
                  <label htmlFor={rid("unit")} className={labelClass}>
                    Unit
                  </label>
                  <input {...props("unit")} type="text" className={inputClass} />
                  <FieldError id={`${rid("unit")}-error`} message={rowError(row.key, "unit")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label htmlFor={rid("rangeLow")} className={labelClass}>
                    Range low
                  </label>
                  <input {...props("rangeLow")} type="text" inputMode="decimal" className={inputClass} />
                  <FieldError id={`${rid("rangeLow")}-error`} message={rowError(row.key, "rangeLow")} />
                </div>
                <div className="min-w-0">
                  <label htmlFor={rid("rangeHigh")} className={labelClass}>
                    Range high
                  </label>
                  <input {...props("rangeHigh")} type="text" inputMode="decimal" className={inputClass} />
                  <FieldError id={`${rid("rangeHigh")}-error`} message={rowError(row.key, "rangeHigh")} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRows((current) => current.filter((other) => other.key !== row.key))}
                disabled={pending}
                className={secondaryButton}
              >
                Remove row
              </button>
            </div>
          );
        })}
        <FieldError id={`${fieldId("results")}-error`} message={errors.results} />
        <button
          type="button"
          onClick={() => {
            setRows((current) => [...current, { key: `row-${nextKey}`, values: blankRow }]);
            setNextKey(nextKey + 1);
          }}
          disabled={pending}
          className={secondaryButton}
        >
          Add row
        </button>
      </fieldset>

      {state && !state.ok && <SaveProblem message={state.message} conflict={state.error === "conflict"} />}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Saving…" : "Save bloodwork"}
      </button>
      {showCancel && (
        <Link href="/bloodwork" className={secondaryButton}>
          Cancel
        </Link>
      )}
    </form>
  );
}
