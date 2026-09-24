import { cx } from "./cx";

const control =
  "w-full min-h-11 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3.5 py-2.5 text-base text-ink " +
  "placeholder:text-ink-subtle focus-visible:border-accent aria-[invalid=true]:border-error";

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block">
      <span className="font-semibold">{children}</span>
      {hint ? <span className="ml-1.5 text-sm font-normal text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export function FieldError({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-error">
      {children}
    </p>
  );
}

export function TextInput({ invalid, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cx(control, className)} {...rest} />;
}

export function TextArea({ invalid, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} className={cx(control, "min-h-32 resize-y leading-relaxed text-mixed", className)} {...rest} />;
}

export function Select({ invalid, className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select aria-invalid={invalid || undefined} className={cx(control, "appearance-none bg-[length:1rem] pr-9", className)} {...rest}>
      {children}
    </select>
  );
}

/** Radio group rendered as large tappable cards (44px+ targets). */
export function ChoiceGroup<V extends string>({
  name,
  legend,
  hint,
  options,
  value,
  onChange,
  error,
  columns = 2,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: ReadonlyArray<{ value: V; label: string; description?: string }>;
  value: V | null;
  onChange: (v: V) => void;
  error?: string;
  columns?: 1 | 2 | 3 | 4;
}) {
  const errId = `${name}-error`;
  const grid = { 1: "grid-cols-1", 2: "grid-cols-1 min-[380px]:grid-cols-2", 3: "grid-cols-1 min-[380px]:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <fieldset aria-describedby={error ? errId : undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-1.5 font-semibold">
        {legend}
        {hint ? <span className="ml-1.5 text-sm font-normal text-ink-muted">{hint}</span> : null}
      </legend>
      <div className={cx("grid gap-2", grid)}>
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              htmlFor={id}
              className={cx(
                "flex min-h-11 cursor-pointer items-start gap-2.5 rounded-[var(--radius-control)] border px-3.5 py-2.5 transition-colors",
                checked ? "border-accent bg-accent-soft" : "border-line-strong bg-surface hover:bg-sunken",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-accent",
              )}
            >
              <input id={id} type="radio" name={name} value={o.value} checked={checked} onChange={() => onChange(o.value)} className="mt-1 size-4 accent-[var(--color-accent)]" />
              <span>
                <span className="block font-medium">{o.label}</span>
                {o.description ? <span className="block text-sm text-ink-muted">{o.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      <FieldError id={errId}>{error}</FieldError>
    </fieldset>
  );
}
