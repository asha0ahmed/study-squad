"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  getMySquad,
  getSession,
  getSquad,
  getSquadMessages,
  sendSquadMessage,
  StoredSession,
} from "@/lib/api";
import type { SquadMessage } from "@/lib/types";
import { FormError } from "@/components/auth/DossierCard";

const POLL_INTERVAL_MS = 7000;

type Access =
  | { state: "loading" }
  | { state: "blocked"; reason: string }
  | { state: "ready"; squadId: number }
  | { state: "error"; message: string };

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SquadNotesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mentorSquadId = searchParams.get("squadId");

  const [session, setSession] = useState<StoredSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [access, setAccess] = useState<Access>({ state: "loading" });
  const [messages, setMessages] = useState<SquadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = getSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of an external system (localStorage) on mount
    setSession(s);
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (sessionChecked && !session) router.replace("/auth");
  }, [sessionChecked, session, router]);

  const resolveAccess = useCallback(async () => {
    if (!session) return;
    try {
      if (session.role === "student" && session.student) {
        const result = await getMySquad(session.student.id);
        if (result.squad.status !== "locked") {
          setAccess({
            state: "blocked",
            reason: "Squad Notes unlocks once your squad reaches 4 members.",
          });
        } else {
          setAccess({ state: "ready", squadId: result.squad.id });
        }
      } else if (session.role === "mentor") {
        if (!mentorSquadId) {
          setAccess({
            state: "blocked",
            reason: "Open Squad Notes from one of your assigned squads.",
          });
          return;
        }
        const result = await getSquad(Number(mentorSquadId));
        if (result.squad.status !== "locked") {
          setAccess({ state: "blocked", reason: "This squad isn't locked yet." });
        } else {
          setAccess({ state: "ready", squadId: result.squad.id });
        }
      }
    } catch (err) {
      setAccess({
        state: "error",
        message: err instanceof ApiError ? err.message : "Couldn't load Squad Notes.",
      });
    }
  }, [session, mentorSquadId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount, setState only happens after the request resolves
    if (session) resolveAccess();
  }, [session, resolveAccess]);

  const loadMessages = useCallback(async (squadId: number) => {
    try {
      const result = await getSquadMessages(squadId);
      setMessages(result);
    } catch {
      // Silent on poll failures -- don't interrupt an otherwise-working chat
      // over one flaky request; the next poll will retry.
    }
  }, []);

  useEffect(() => {
    if (access.state !== "ready") return;
    // loadMessages is async and only calls setState after the network
    // request resolves -- this starts the poll loop, not a synchronous
    // render-time state write.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMessages(access.squadId);
    const interval = setInterval(() => loadMessages(access.squadId), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [access, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (access.state !== "ready" || !draft.trim()) return;
    setError(null);
    setSending(true);
    try {
      await sendSquadMessage(access.squadId, draft.trim());
      setDraft("");
      await loadMessages(access.squadId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  }

  if (!sessionChecked || !session || access.state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="marginalia text-ink-45">Opening Squad Notes…</p>
      </main>
    );
  }

  if (access.state === "blocked" || access.state === "error") {
    const message = access.state === "blocked" ? access.reason : access.message;
    return (
      <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
        <div className="w-full max-w-md border border-ink bg-parchment px-6 py-8 text-center">
          <p className="marginalia text-oxblood">Squad Notes</p>
          <p className="mt-3 text-sm text-ink-70">{message}</p>
          <Link href="/squad" className="btn-stamp mt-5 inline-block bg-ink text-parchment">
            Back to Your Squad
          </Link>
        </div>
      </main>
    );
  }

  const currentSenderId =
    session.role === "student" ? session.student?.id : session.mentor?.id;

  return (
    <main className="flex flex-1 flex-col bg-desk-lamp px-6 py-10">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        <p className="marginalia text-oxblood">Squad Notes</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-ink">
          The Ledger
        </h1>

        <div
          ref={scrollRef}
          className="mt-6 flex-1 overflow-y-auto border border-ink bg-parchment px-5 py-4"
          style={{ maxHeight: "55vh", minHeight: "40vh" }}
        >
          {messages.length === 0 ? (
            <p className="marginalia text-ink-45">No notes yet. Say hello.</p>
          ) : (
            messages.map((m, i) => {
              const mine = m.sender_type === session.role && m.sender_id === currentSenderId;
              return (
                <div
                  key={m.id}
                  className={
                    "py-3 " + (i !== messages.length - 1 ? "border-b border-ink-10" : "")
                  }
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-sans text-xs font-semibold uppercase tracking-[0.06em] text-ink">
                      {m.sender_name}
                      {mine && <span className="ml-1 text-ink-45">(you)</span>}
                      {m.sender_type === "mentor" && (
                        <span className="ml-1 text-emerald">· Mentor</span>
                      )}
                    </span>
                    <span className="text-xs text-ink-45">{formatTime(m.created_at)}</span>
                  </div>
                  <p className="mt-1 text-[15px] text-ink">{m.message}</p>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSend} className="mt-4 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a note to your squad…"
            className="flex-1 border border-ink bg-parchment px-3 py-2.5 font-sans text-[15px] text-ink outline-none placeholder:text-ink-45 focus:border-oxblood focus:ring-1 focus:ring-oxblood"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="btn-stamp bg-oxblood text-parchment disabled:opacity-50"
          >
            Send
          </button>
        </form>
        <FormError message={error} />
      </div>
    </main>
  );
}

export default function SquadNotesPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <p className="marginalia text-ink-45">Opening Squad Notes…</p>
        </main>
      }
    >
      <SquadNotesContent />
    </Suspense>
  );
}
