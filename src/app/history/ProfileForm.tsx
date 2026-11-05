"use client";

import {
  startTransition,
  useActionState,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { Profile } from "@/lib/data/profile";
import type { SaveResult } from "@/lib/data/result";
import { formatDate } from "@/lib/format";
import { FieldError, inputClass, labelClass, SaveProblem, textAreaClass, ToggleGroup } from "@/app/seizures/[id]/fields";
import type { WeightUnit } from "@/lib/validation/profile";
import { saveProfileAction } from "./actions";

// The profile as the page loaded it. `updatedAt` is the ISO version the edit form sends back.
export type ProfileView = Omit<Profile, "updatedAt"> & { updatedAt: string };

const UNIT_OPTIONS = [
  { value: "lb", label: "lb" },
  { value: "kg", label: "kg" },
] as const;

const primaryButton = "min-h-14 w-full rounded-xl bg-brand text-lg font-bold text-brand-foreground disabled:opacity-60";
const secondaryButton = "min-h-tap w-full rounded-xl border-2 border-border px-4 text-base font-semibold";

function Field({
  idPrefix,
  name,
  label,
  errors,
  children,
}: {
  idPrefix: string;
  name: string;
  label: string;
  errors: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={`${idPrefix}${name}`} className={labelClass}>
        {label}
      </label>
      {children}
      <FieldError id={`${idPrefix}${name}-error`} message={errors[name]} />
    </div>
  );
}

// `profile` is null until the first save: the form starts empty and has nothing to cancel back to.
export function ProfileForm({
  profile,
  onSaved,
  onCancel,
}: {
  profile: ProfileView | null;
  onSaved: () => void;
  onCancel: (() => void) | null;
}) {
  // Pinned when the form opens: a refresh bringing the other phone's edit must not adopt its
  // version stamp, or this form's stale fields would save over that edit without a conflict.
  const [version] = useState(profile?.updatedAt ?? "");
  const [unit, setUnit] = useState<WeightUnit | null>(profile?.weightUnit ?? "lb");
  const idPrefix = useId();
  const [state, formAction, pending] = useActionState(
    async (prev: SaveResult<Profile> | null, formData: FormData) => {
      const result = await saveProfileAction(prev, formData);
      if (result.ok) onSaved();
      return result;
    },
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  // Submits by hand so React doesn't reset the fields: a refused save keeps what was typed.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  const props = (name: string) => ({
    id: `${idPrefix}${name}`,
    name,
    "aria-describedby": errors[name] ? `${idPrefix}${name}-error` : undefined,
  });
  const text = (name: keyof ProfileView, label: string, type: "text" | "tel" | "date" = "text") => (
    <Field idPrefix={idPrefix} name={name} label={label} errors={errors}>
      <input {...props(name)} type={type} defaultValue={(profile?.[name] as string | null) ?? ""} className={inputClass} />
    </Field>
  );
  const area = (name: keyof ProfileView, label: string, rows: number) => (
    <Field idPrefix={idPrefix} name={name} label={label} errors={errors}>
      <textarea {...props(name)} rows={rows} defaultValue={(profile?.[name] as string | null) ?? ""} className={textAreaClass} />
    </Field>
  );

  return (
    <form onSubmit={submit} aria-label="Edit profile" className="sw-card flex flex-col gap-4 p-5">
      <input type="hidden" name="expectedUpdatedAt" value={version} />
      {text("name", "Name")}
      {text("breed", "Breed")}
      {text("birthday", "Birthday", "date")}
      <div className="flex flex-col gap-3">
        <Field idPrefix={idPrefix} name="weightAmount" label="Weight" errors={errors}>
          <input
            {...props("weightAmount")}
            type="text"
            inputMode="decimal"
            defaultValue={profile?.weightAmount === null || profile === null ? "" : String(profile.weightAmount)}
            className={inputClass}
          />
        </Field>
        <ToggleGroup name="weightUnit" label="Unit" options={UNIT_OPTIONS} value={unit} onChange={setUnit} columns={2} error={errors.weightUnit} idPrefix={idPrefix} />
      </div>
      {area("allergies", "Allergies", 2)}
      {area("diagnosis", "Diagnosis", 3)}
      {text("firstSeizureDate", "First seizure date", "date")}
      {text("vetName", "Vet")}
      {text("vetPhone", "Vet phone", "tel")}
      {text("emergencyVetName", "Emergency vet")}
      {text("emergencyVetPhone", "Emergency vet phone", "tel")}
      {area("notes", "Background notes", 6)}
      {state && !state.ok && <SaveProblem message={state.message} conflict={state.error === "conflict"} />}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Saving…" : "Save profile"}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} disabled={pending} className={secondaryButton}>
          Cancel
        </button>
      )}
    </form>
  );
}

// Digits and a leading + only, so "(555) 123-4567" dials.
function telHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits === "") return null;
  return `tel:${phone.trim().startsWith("+") ? "+" : ""}${digits}`;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

// "7 years", or "8 months" under a year; null for a birthday after today.
export function ageText(birthday: string, today: string): string | null {
  if (birthday > today) return null;
  const [by, bm, bd] = birthday.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const months = (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  if (months < 1) return "under 1 month";
  return months < 12 ? plural(months, "month") : plural(Math.floor(months / 12), "year");
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg break-words">{children}</dd>
    </div>
  );
}

function VetDetail({ label, name, phone }: { label: string; name: string | null; phone: string | null }) {
  if (!name && !phone) return null;
  const href = phone ? telHref(phone) : null;
  return (
    <Detail label={label}>
      {name && <p>{name}</p>}
      {phone &&
        (href ? (
          <a
            href={href}
            className="mt-1 flex min-h-tap items-center justify-center rounded-xl border-2 border-brand px-4 text-lg font-semibold text-brand"
          >
            Call {phone}
          </a>
        ) : (
          <p>{phone}</p>
        ))}
    </Detail>
  );
}

function ProfileRead({
  profile,
  today,
  onEdit,
}: {
  profile: ProfileView;
  today: string;
  onEdit: () => void;
}) {
  const age = profile.birthday ? ageText(profile.birthday, today) : null;
  const weight = profile.weightAmount !== null && profile.weightUnit ? `${profile.weightAmount} ${profile.weightUnit}` : null;
  const hasVets = profile.vetName || profile.vetPhone || profile.emergencyVetName || profile.emergencyVetPhone;
  const hasAnything =
    profile.name || profile.breed || profile.birthday || weight || profile.diagnosis || profile.firstSeizureDate ||
    hasVets || profile.allergies || profile.notes;
  return (
    <div className="flex flex-col gap-4">
      {profile.allergies && (
        <section aria-label="Allergies" className="sw-card border-2 border-alert p-5">
          <h2 className="text-xl font-semibold text-alert">Allergies</h2>
          <p className="mt-1 text-lg whitespace-pre-line break-words">{profile.allergies}</p>
        </section>
      )}
      {!hasAnything && <p className="text-lg text-muted">Nothing filled in yet. Tap Edit to add his details.</p>}
      {(profile.name || profile.breed) && (
        <div>
          {profile.name && <h2 className="text-3xl font-semibold break-words">{profile.name}</h2>}
          {profile.breed && <p className="text-lg text-muted">{profile.breed}</p>}
        </div>
      )}
      <dl className="sw-card flex flex-col gap-4 p-5 empty:hidden">
        {profile.birthday && (
          <Detail label="Birthday">
            {formatDate(profile.birthday)}
            {age && <span className="text-muted"> · {age}</span>}
          </Detail>
        )}
        {weight && <Detail label="Weight">{weight}</Detail>}
        {profile.diagnosis && (
          <Detail label="Diagnosis">
            <span className="whitespace-pre-line">{profile.diagnosis}</span>
          </Detail>
        )}
        {profile.firstSeizureDate && <Detail label="First seizure">{formatDate(profile.firstSeizureDate)}</Detail>}
        <VetDetail label="Vet" name={profile.vetName} phone={profile.vetPhone} />
        <VetDetail label="Emergency vet" name={profile.emergencyVetName} phone={profile.emergencyVetPhone} />
      </dl>
      {profile.notes && (
        <section aria-label="Background notes" className="sw-card p-5">
          <h2 className="text-xl font-semibold">Background notes</h2>
          <p className="mt-1 text-base whitespace-pre-line break-words">{profile.notes}</p>
        </section>
      )}
      <button type="button" onClick={onEdit} className={primaryButton}>
        Edit
      </button>
    </div>
  );
}

// With no profile yet the form starts open. It stays open until it saves or is cancelled, so a refresh
// bringing the other phone's first save doesn't throw away what was typed (saving it is then a conflict).
export function ProfileSection({ profile, today }: { profile: ProfileView | null; today: string }) {
  const [mode, setMode] = useState<"first" | "edit" | null>(profile === null ? "first" : null);
  if (mode === null && profile !== null) return <ProfileRead profile={profile} today={today} onEdit={() => setMode("edit")} />;
  return (
    <ProfileForm
      profile={profile}
      onSaved={() => setMode(null)}
      onCancel={mode === "edit" ? () => setMode(null) : null}
    />
  );
}
