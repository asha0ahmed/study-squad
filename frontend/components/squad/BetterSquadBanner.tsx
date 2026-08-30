"use client";

import { useState } from "react";
import { ApiError, switchSquad } from "@/lib/api";
import type { SquadSuggestion } from "@/lib/types";

export function BetterSquadBanner({
  studentId,
  suggestion,
  onSwitched,
}: {
  studentId: number;
  suggestion: SquadSuggestion;
  onSwitched: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function handleSwitch() {
    setLoading(true);
    setError(null);
    try {
      await switchSquad(studentId, suggestion.squadId);
      onSwitched();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't switch squads. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 border border-emerald bg-emerald/5 px-5 py-4">
      <p className="marginalia text-emerald">A better fit, maybe</p>
      <p className="mt-1 text-sm text-ink">
        We found a squad that may suit your goals a little better — want to join it instead?
      </p>
      {error && <p className="mt-2 text-sm text-oxblood">{error}</p>}
      <div className="mt-3 flex gap-3">
        <button
          onClick={handleSwitch}
          disabled={loading}
          className="btn-stamp bg-emerald text-parchment disabled:opacity-50"
        >
          {loading ? "Switching…" : "Switch Squads"}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-sm text-ink-45 underline"
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
