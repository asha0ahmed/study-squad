"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  assignMentorToSquad,
  getAvailableSquads,
  getMyMentorSquads,
} from "@/lib/api";
import { SUBJECTS_BY_GROUP } from "@/lib/subjects";
import type { MentorSession, MentorSquad, Squad } from "@/lib/types";
import { CoverageMatrix } from "@/components/squad/CoverageMatrix";
import { FormError } from "@/components/auth/DossierCard";

type Tab = "mine" | "browse";

export function MentorDesk({ mentor }: { mentor: MentorSession }) {
  const [tab, setTab] = useState<Tab>("mine");
  const [mySquads, setMySquads] = useState<MentorSquad[]>([]);
  const [available, setAvailable] = useState<Squad[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<number | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [mine, open] = await Promise.all([getMyMentorSquads(), getAvailableSquads()]);
      setMySquads(mine);
      setAvailable(open);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load your squads.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount, setState only happens after the request resolves
    loadAll();
  }, [loadAll]);

  async function handleClaim(squadId: number) {
    setClaimingId(squadId);
    setError(null);
    try {
      await assignMentorToSquad(squadId);
      await loadAll();
      setTab("mine");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't claim this squad.");
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <div className="w-full max-w-3xl">
      <p className="marginalia text-emerald">Mentor Desk</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold text-ink">
        Welcome, {mentor.name}
      </h1>

      <div className="mt-8 flex gap-2 border-b border-ink">
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>
          My Squads
        </TabButton>
        <TabButton active={tab === "browse"} onClick={() => setTab("browse")}>
          Browse Open Squads
        </TabButton>
      </div>

      <FormError message={error} />

      {!loaded ? (
        <p className="mt-6 marginalia text-ink-45">Loading…</p>
      ) : tab === "mine" ? (
        <MySquadsTab squads={mySquads} />
      ) : (
        <BrowseTab
          squads={available}
          onClaim={handleClaim}
          claimingId={claimingId}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "border-t border-x border-ink px-4 py-2.5 -mb-px font-sans text-xs font-semibold uppercase tracking-[0.08em] " +
        (active ? "bg-ink text-parchment" : "bg-parchment text-ink-70 hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

function MySquadsTab({ squads }: { squads: MentorSquad[] }) {
  if (squads.length === 0) {
    return (
      <p className="mt-8 marginalia text-ink-45">
        You haven&apos;t claimed any squads yet. Check the Browse Open
        Squads tab.
      </p>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      {squads.map((squad) => (
        <div key={squad.id} className="border border-ink bg-parchment">
          <div className="flex items-center justify-between border-b border-ink px-5 py-3">
            <span className="font-serif text-xl font-semibold text-ink">
              {squad.academic_group} · {squad.year}
            </span>
            <Link
              href={`/squad/notes?squadId=${squad.id}`}
              className="text-sm font-semibold text-oxblood underline"
            >
              Squad Notes
            </Link>
          </div>
          <div className="p-4">
            <CoverageMatrix
              subjects={SUBJECTS_BY_GROUP[squad.academic_group]}
              members={squad.members}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function BrowseTab({
  squads,
  onClaim,
  claimingId,
}: {
  squads: Squad[];
  onClaim: (squadId: number) => void;
  claimingId: number | null;
}) {
  if (squads.length === 0) {
    return (
      <p className="mt-8 marginalia text-ink-45">
        No open squads right now. This is either because there aren&apos;t
        any locked, unassigned squads in your groups at the moment, or
        because a group you registered for is still awaiting admin
        approval — check back soon.
      </p>
    );
  }

  return (
    <div className="mt-6 border border-ink bg-parchment">
      {squads.map((squad, i) => (
        <div
          key={squad.id}
          className={
            "flex items-center justify-between px-5 py-4 " +
            (i !== squads.length - 1 ? "border-b border-ink-10" : "")
          }
        >
          <div>
            <span className="font-serif text-lg font-medium text-ink">
              {squad.academic_group} · {squad.year}
            </span>
            <span className="ml-2 text-sm text-ink-45">{squad.aspirant_type}</span>
          </div>
          <button
            onClick={() => onClaim(squad.id)}
            disabled={claimingId === squad.id}
            className="btn-stamp bg-emerald text-parchment disabled:opacity-50"
          >
            {claimingId === squad.id ? "Claiming…" : "Claim This Squad"}
          </button>
        </div>
      ))}
    </div>
  );
}
