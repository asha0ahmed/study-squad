export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "confirmed" | "pending" | "locked" | "neutral";
}) {
  const toneClasses =
    tone === "confirmed"
      ? "border-emerald text-emerald"
      : tone === "locked"
        ? "border-ink text-ink bg-ink/[0.03]"
        : tone === "pending"
          ? "border-amber text-amber"
          : "border-ink-20 text-ink-45";

  return (
    <span
      className={
        "inline-block border px-2 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] " +
        toneClasses
      }
    >
      {label}
    </span>
  );
}
