import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 bg-desk-lamp">
      <section className="mx-auto max-w-2xl px-6 py-24">
        <p className="marginalia text-lg">Your squad is waiting for you...</p>
        <h1 className="mt-3 font-serif text-5xl font-semibold tracking-tight text-ink">
          Study Squad
        </h1>
        <p className="mt-4 max-w-md text-ink-70">
          A quiet corner for HSC and admission-test aspirants to find the
          people they&apos;ll actually study with.
        </p>
        <div className="mt-10 flex gap-3">
          <Link href="/auth/student/login" className="btn-stamp bg-oxblood text-parchment">
            I&apos;m a Scholar
          </Link>
          <Link href="/auth/mentor/login" className="btn-stamp bg-transparent text-ink">
            I&apos;m a Mentor
          </Link>
        </div>
      </section>
    </main>
  );
}
