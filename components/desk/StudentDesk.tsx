import Link from "next/link";
import { ApiError, getMySquad } from "@/lib/api";
import type { StudentSession, StudentSquadView } from "@/lib/types";
import { StatusBadge } from "@/components/squad/StatusBadge";
import { useCallback, useEffect, useState } from "react";

function statusLabel(squad: StudentSquadView | null) {
  if (squad && squad.squad.status === "locked") return "Squad Locked";
  if (squad) return "Squad Forming";
  return "Not Matched Yet";
}

export function StudentDesk({ student }: { student: StudentSession }) {
  const [squad, setSquad] = useState<StudentSquadView | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getMySquad(student.id);
      setSquad(result);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        // Non-404 errors just mean "we don't know yet" -- the quick links
        // below still work regardless, so this fails soft.
      }
    } finally {
      setLoaded(true);
    }
  }, [student.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount, setState only happens after the request resolves
    load();
  }, [load]);

  return (
    <div className="w-full max-w-2xl">
      <p className="marginalia text-oxblood">Your Desk</p>
      <h1 className="mt-1 font-serif text-4xl font-semibold text-ink">
        Welcome back, {student.name}
      </h1>

      <div className="mt-8 border border-ink bg-parchment bg-graph-paper px-6 py-6">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-45">
          Squad Status
        </span>
        <div className="mt-2 flex items-center gap-3">
          {loaded ? (
            <StatusBadge
              label={statusLabel(squad)}
              tone={
                squad?.squad.status === "locked"
                  ? "locked"
                  : squad
                    ? "pending"
                    : "neutral"
              }
            />
          ) : (
            <span className="text-sm text-ink-45">Checking…</span>
          )}
        </div>
        {squad && (
          <Link href="/squad" className="mt-3 inline-block text-sm font-semibold text-oxblood underline">
            View Your Squad
          </Link>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DeskLink href="/profiler" label="The Profiler" desc="Rate your subjects" />
        <DeskLink
          href="/squad/find"
          label="Find My Squad"
          desc={squad ? "View your match" : "Trigger matching"}
        />
        <DeskLink
          href="/squad/notes"
          label="Squad Notes"
          desc="Talk to your squad"
        />
      </div>
    </div>
  );
}

function DeskLink({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link
      href={href}
      className="border border-ink bg-parchment px-4 py-5 transition-colors hover:bg-ink hover:text-parchment"
    >
      <span className="block font-serif text-lg font-semibold">{label}</span>
      <span className="mt-1 block text-sm text-ink-70">{desc}</span>
    </Link>
  );
}
