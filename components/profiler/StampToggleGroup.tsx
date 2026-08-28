export function StampToggleGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-1.5">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={
              "min-w-9 border px-2.5 py-1.5 font-sans text-sm font-semibold transition-colors " +
              (selected
                ? "border-ink bg-ink text-parchment"
                : "border-ink-20 bg-transparent text-ink-70 hover:border-ink")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
