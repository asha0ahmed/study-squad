"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  createInvite,
  getMySquad,
  getSession,
  getSuggestedSquad,
  StoredSession,
} from "@/lib/api";
import type { StudentSquadView, SquadSuggestion } from "@/lib/types";
import { StatusBadge } from "@/components/squad/StatusBadge";
import { BetterSquadBanner } from "@/components/squad/BetterSquadBanner";
import { FormError } from "@/components/auth/DossierCard";

const MEMBERS_NEEDED_TO_ACTIVATE = 4;

export default function SquadPage() {
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [squad, setSquad] = useState<StudentSquadView | null | "not-found">(null);
  const [suggestion, setSuggestion] = useState<SquadSuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ inviteCode: string; inviteLink: string } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  useEffect(() => {
    const s = getSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of an external system (localStorage) on mount
    setSession(s);
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (sessionChecked && (!session || session.role !== "student")) {
      router.replace("/auth");
    }
  }, [sessionChecked, session, router]);

  const load = useCallback(async () => {
    if (!session?.student) return;
    try {
      const result = await getMySquad(session.student.id);
      setSquad(result);
      setInvite(null);
      // A better-fit squad, if one exists, is purely optional information --
      // failing to load it shouldn't block anything else on this page.
      try {
        const s = await getSuggestedSquad(session.student.id);
        setSuggestion(s.suggestion);
      } catch {
        setSuggestion(null);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setSquad("not-found");
      } else {
        setError(err instanceof ApiError ? err.message : "Couldn't load your squad.");
      }
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount, setState only happens after the request resolves
    if (session?.student) load();
  }, [session, load]);

  async function handleInvite() {
    if (!squad || squad === "not-found") return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      const result = await createInvite(squad.squad.id);
      // The backend returns a placeholder domain (yourapp.com/join/...) that
      // isn't wherever this app actually runs. Build the real, clickable
      // link from wherever we're actually running -- localhost during dev,
      // the real domain once one exists -- instead of trusting that field.
      const realLink =
        typeof window !== "undefined"
          ? `${window.location.origin}/invite/${result.inviteCode}`
          : result.inviteLink;
      setInvite({ inviteCode: result.inviteCode, inviteLink: realLink });
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Couldn't generate an invite link.");
    } finally {
      setInviteLoading(false);
    }
  }

  if (!sessionChecked || !session?.student || squad === null) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="marginalia text-ink-45">Opening your squad…</p>
      </main>
    );
  }

  if (squad === "not-found") {
    return (
      <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
        <div className="w-full max-w-md border border-ink bg-parchment px-6 py-8 text-center">
          <p className="marginalia text-ink-70">No squad yet</p>
          <Link href="/squad/find" className="btn-stamp mt-4 inline-block bg-oxblood text-parchment">
            Find My Squad
          </Link>
        </div>
      </main>
    );
  }

  const { squad: squadData, members, mentor } = squad;
  const isActive = squadData.status === "locked";
  const openSlots = 6 - members.length;

  return (
    <main className="flex-1 bg-desk-lamp px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <p className="marginalia text-oxblood">Your Squad</p>
          <StatusBadge
            label={isActive ? "Active" : "Filling Up"}
            tone={isActive ? "locked" : "pending"}
          />
        </div>
        <h1 className="mt-1 font-serif text-4xl font-semibold text-ink">
          {squadData.academic_group} · {squadData.year}
        </h1>

        <FormError message={error} />

        {session.student && suggestion && (
          <BetterSquadBanner
            studentId={session.student.id}
            suggestion={suggestion}
            onSwitched={load}
          />
        )}

        {!isActive && (
          <div className="mt-6 border border-ink bg-parchment px-5 py-5">
            <p className="font-sans text-sm font-semibold text-ink">
              {members.length} of {MEMBERS_NEEDED_TO_ACTIVATE} joined — your squad starts
              chatting once it reaches {MEMBERS_NEEDED_TO_ACTIVATE}
            </p>
            <div className="mt-2 h-2 w-full border border-ink">
              <div
                className="h-full bg-emerald"
                style={{
                  width: `${Math.min(100, (members.length / MEMBERS_NEEDED_TO_ACTIVATE) * 100)}%`,
                }}
              />
            </div>
            <p className="marginalia mt-3 text-ink-45">
              More scholars are being matched in automatically. You&apos;ll be
              notified the moment your squad is ready.
            </p>
          </div>
        )}

        <div className="mt-8 border border-ink bg-parchment">
          <div className="border-b border-ink px-5 py-3">
            <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-45">
              Your Roster
            </span>
          </div>
          {members.map((m, i) => (
            <div
              key={m.student_id}
              className={
                "flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between " +
                (i !== members.length - 1 ? "border-b border-ink-10" : "")
              }
            >
              <div>
                <span className="font-serif text-lg font-medium text-ink">{m.name}</span>
                <span className="ml-2 text-xs text-ink-45">Slot {m.slot}</span>
                {m.student_id === session.student?.id && (
                  <span className="ml-2 text-xs text-oxblood">(you)</span>
                )}
              </div>
              <span className="text-sm text-ink-70">
                {m.covers.length > 0 ? m.covers.join(", ") : "No subjects yet"}
              </span>
            </div>
          ))}
          {openSlots > 0 && (
            <div className="px-5 py-4">
              <span className="text-sm italic text-ink-45">
                {openSlots} slot{openSlots > 1 ? "s" : ""} still open
              </span>
            </div>
          )}
        </div>

        <div className="mt-8 border border-ink bg-parchment px-5 py-5">
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-45">
            Mentor
          </span>
          {mentor ? (
            <p className="mt-2 font-serif text-xl text-ink">{mentor.name}</p>
          ) : (
            <p className="marginalia mt-2 text-amber">Mentor pending</p>
          )}
        </div>

        <div className="mt-8 border border-ink bg-parchment px-5 py-5">
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-45">
            Invite Someone
          </span>
          {openSlots === 0 ? (
            <p className="marginalia mt-2 text-ink-45">Your squad is full.</p>
          ) : (
            <div className="mt-3">
              {invite ? (
                <div className="border border-ink-20 bg-parchment-dim px-3 py-3">
                  <p className="font-sans text-sm text-ink">
                    Code: <span className="font-semibold">{invite.inviteCode}</span>
                  </p>
                  <a
                    href={invite.inviteLink}
                    className="mt-1 block break-all font-sans text-sm text-oxblood underline"
                  >
                    {invite.inviteLink}
                  </a>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(invite.inviteLink)}
                    className="btn-stamp mt-3 bg-ink text-parchment"
                  >
                    Copy Link
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleInvite}
                  disabled={inviteLoading}
                  className="btn-stamp bg-emerald text-parchment disabled:opacity-50"
                >
                  {inviteLoading ? "Generating…" : "Generate Invite Link"}
                </button>
              )}
              <FormError message={inviteError} />
            </div>
          )}
        </div>

        {isActive && (
          <Link
            href="/squad/notes"
            className="btn-stamp mt-8 inline-block bg-ink text-parchment"
          >
            Open Squad Notes
          </Link>
        )}
      </div>
    </main>
  );
}
