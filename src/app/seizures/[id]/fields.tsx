// Form pieces shared by the details and "What we did" forms.

export const inputClass =
  "min-h-tap w-full rounded-xl border-2 border-border bg-surface px-3 text-base text-foreground";
export const textAreaClass = "w-full rounded-xl border-2 border-border bg-surface p-3 text-base text-foreground";
export const labelClass = "mb-1 block text-base font-semibold";

export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1 text-sm font-semibold text-alert">
      {message}
    </p>
  );
}

// Large buttons in place of a dropdown. Tapping the chosen one again clears it.
// The value travels in a hidden input named `name`.
export function ToggleGroup<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
  columns,
  error,
}: {
  name: string;
  label: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  columns: 2 | 3;
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className={labelClass}>{label}</legend>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className={`grid gap-2 ${columns === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : option.value)}
              className={`min-h-14 rounded-xl border-2 px-2 text-base font-semibold ${
                selected ? "border-brand bg-brand text-background" : "border-border bg-surface text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

// The refusal message, plus a Reload button when someone else changed the record.
export function SaveProblem({ message, conflict }: { message: string; conflict: boolean }) {
  return (
    <div role="alert" className="rounded-xl border-2 border-alert p-3">
      <p className="text-base font-semibold text-alert">{message}</p>
      {conflict && (
        <>
          <p className="mt-1 text-sm text-muted">What you typed is kept here. Copy anything you need before reloading.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 min-h-tap w-full rounded-xl border-2 border-brand text-base font-semibold text-brand"
          >
            Reload
          </button>
        </>
      )}
    </div>
  );
}
