import { SelectHTMLAttributes, InputHTMLAttributes } from "react";

interface FieldWrapperProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
}

function FieldShell({
  label,
  htmlFor,
  hint,
  error,
  children,
}: FieldWrapperProps & { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-ink-70"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="marginalia text-sm text-ink-45">{hint}</p>
      )}
      {error && <p className="text-sm text-oxblood">{error}</p>}
    </div>
  );
}

type InputProps = FieldWrapperProps & InputHTMLAttributes<HTMLInputElement>;

export function TextField({ label, htmlFor, hint, error, ...rest }: InputProps) {
  return (
    <FieldShell label={label} htmlFor={htmlFor} hint={hint} error={error}>
      <input
        id={htmlFor}
        name={htmlFor}
        className="border border-ink bg-parchment px-3 py-2.5 font-sans text-[15px] text-ink outline-none placeholder:text-ink-45 focus:border-oxblood focus:ring-1 focus:ring-oxblood"
        {...rest}
      />
    </FieldShell>
  );
}

type SelectProps = FieldWrapperProps &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: { value: string; label: string }[];
    placeholder?: string;
  };

export function SelectField({
  label,
  htmlFor,
  hint,
  error,
  options,
  placeholder,
  ...rest
}: SelectProps) {
  return (
    <FieldShell label={label} htmlFor={htmlFor} hint={hint} error={error}>
      <select
        id={htmlFor}
        name={htmlFor}
        className="border border-ink bg-parchment px-3 py-2.5 font-sans text-[15px] text-ink outline-none focus:border-oxblood focus:ring-1 focus:ring-oxblood"
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
