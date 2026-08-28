import Link from "next/link";

export default function AuthEntryPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
      <div className="w-full max-w-lg">
        <p className="marginalia text-center text-lg">
          Before you take a seat...
        </p>
        <h1 className="mt-2 text-center font-serif text-4xl font-semibold text-ink">
          Who&apos;s signing in?
        </h1>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            href="/auth/student/login"
            className="group border border-ink bg-parchment px-6 py-8 text-center transition-colors hover:bg-ink hover:text-parchment"
          >
            <span className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-oxblood group-hover:text-parchment">
              Aspirant
            </span>
            <span className="mt-2 block font-serif text-2xl font-semibold">
              I&apos;m a Scholar
            </span>
            <span className="mt-1 block text-sm text-ink-70 group-hover:text-parchment/80">
              Find your squad and study together.
            </span>
          </Link>

          <Link
            href="/auth/mentor/login"
            className="group border border-ink bg-parchment px-6 py-8 text-center transition-colors hover:bg-ink hover:text-parchment"
          >
            <span className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-emerald group-hover:text-parchment">
              Guide
            </span>
            <span className="mt-2 block font-serif text-2xl font-semibold">
              I&apos;m a Mentor
            </span>
            <span className="mt-1 block text-sm text-ink-70 group-hover:text-parchment/80">
              Guide a squad through their prep.
            </span>
          </Link>
        </div>

        <p className="mt-8 text-center text-sm text-ink-45">
          New here? Choose one above — you can sign up from the login screen.
        </p>
      </div>
    </main>
  );
}
