"use client";

import { startTransition, useActionState, useId, useState, type FormEvent } from "react";
import { FieldError, inputClass, labelClass, SaveProblem } from "@/app/seizures/[id]/fields";
import { formatMinuteOfDay } from "@/lib/format";
import { setDoseTimeAction } from "./actions";

// "HH:mm" for `<input type="time">`.
function timeValue(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

// One daily-dose slot on the day list, with a button to record that it was given at another time.
export function DoseTimeEditor({
  day,
  minute,
  usualMinute,
  lines,
}: {
  day: string;
  minute: number;
  usualMinute: number;
  lines: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: Awaited<ReturnType<typeof setDoseTimeAction>> | null, formData: FormData) => {
      const result = await setDoseTimeAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    null,
  );
  const idPrefix = useId();
  const moved = minute !== usualMinute;
  const error = state && !state.ok ? state : null;

  // Submitted by hand so a refused save keeps the typed time.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  function backToUsual() {
    const formData = new FormData();
    formData.set("day", day);
    formData.set("usualMinute", String(usualMinute));
    formData.set("givenTime", timeValue(usualMinute));
    startTransition(() => formAction(formData));
  }

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Daily doses</p>
          {moved && <p className="text-sm font-medium text-brand">Usually {formatMinuteOfDay(usualMinute)}</p>}
          <p className="text-sm text-muted">{lines.join(" · ")}</p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="min-h-tap shrink-0 rounded-xl border-2 border-border px-3 text-sm font-semibold"
        >
          {open ? "Cancel" : "Change time"}
        </button>
      </div>
      {open && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="day" value={day} />
          <input type="hidden" name="usualMinute" value={usualMinute} />
          <div>
            <label htmlFor={`${idPrefix}givenTime`} className={labelClass}>
              Given at
            </label>
            <input
              id={`${idPrefix}givenTime`}
              name="givenTime"
              type="time"
              required
              defaultValue={timeValue(minute)}
              aria-describedby={error?.fieldErrors?.givenTime ? `${idPrefix}givenTime-error` : undefined}
              className={inputClass}
            />
            <FieldError id={`${idPrefix}givenTime-error`} message={error?.fieldErrors?.givenTime} />
          </div>
          {error && <SaveProblem message={error.message} conflict={false} />}
          <button
            type="submit"
            disabled={pending}
            className="min-h-tap w-full rounded-xl bg-brand text-base font-bold text-brand-foreground disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save time"}
          </button>
          {moved && (
            <button
              type="button"
              disabled={pending}
              onClick={backToUsual}
              className="min-h-tap w-full rounded-xl border-2 border-border text-base font-semibold disabled:opacity-60"
            >
              Back to {formatMinuteOfDay(usualMinute)}
            </button>
          )}
        </form>
      )}
    </div>
  );
}
