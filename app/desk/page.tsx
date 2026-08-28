"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession, logout, StoredSession } from "@/lib/api";

// Reads localStorage at most once. Server-rendered markup can't know the
// session (no window there), so this always starts as "not yet checked" and
// resolves on the client's first paint via the effect below.
type SessionState = { checked: boolean; session: StoredSession | null };

export default function DeskPlaceholderPage() {
  const router = useRouter();
  const [state, setState] = useState<SessionState>({ checked: false, session: null });

  useEffect(() => {
    // Reading localStorage (an external system) on mount and syncing it
    // into state is the documented exception to this lint rule -- it can't
    // happen during render because `window` doesn't exist on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ checked: true, session: getSession() });
  }, []);

  useEffect(() => {
    if (state.checked && !state.session) {
      router.replace("/auth");
    }
  }, [state, router]);

  if (!state.checked) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="marginalia text-ink-45">Opening your desk…</p>
      </main>
    );
  }

  const session = state.session;
  if (!session) return null;

  const name = session.role === "student" ? session.student?.name : session.mentor?.name;

  return (
    <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
      <div className="w-full max-w-md border border-ink bg-parchment bg-graph-paper px-6 py-8 text-center">
        <p className="marginalia text-oxblood">You&apos;re signed in</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">
          Welcome, {name}
        </h1>
        <p className="mt-3 text-sm text-ink-70">
          This is a placeholder — the real Your Desk (with your squad status
          and quick links) is built in a later step. For now this confirms
          login is working end-to-end against the real backend.
        </p>
        <button
          onClick={() => router.push("/profiler")}
          className="btn-stamp mt-6 bg-oxblood text-parchment"
        >
          Go to The Profiler
        </button>
        <button
          onClick={() => {
            logout();
            router.replace("/auth");
          }}
          className="btn-stamp mt-3 bg-ink text-parchment"
        >
          Sign Out
        </button>
      </div>
    </main>
  );
}
