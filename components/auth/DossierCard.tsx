import { ButtonHTMLAttributes } from "react";

export function DossierCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="border border-ink bg-parchment bg-graph-paper">
        <div className="border-b border-ink px-6 py-5">
          <p className="marginalia text-sm text-oxblood">{eyebrow}</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-ink">
            {title}
          </h1>
        </div>
        <div className="px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

export function SubmitButton({
  children,
  loading,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type="submit"
      className="btn-stamp w-full bg-oxblood text-parchment disabled:opacity-50"
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? "Working…" : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="border border-oxblood bg-oxblood/5 px-3 py-2.5 text-sm text-oxblood">
      {message}
    </div>
  );
}
