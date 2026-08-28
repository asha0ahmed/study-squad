"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ApiError, getSession, saveStudentSubjects, StoredSession } from "@/lib/api";
import { SUBJECTS_BY_GROUP } from "@/lib/subjects";
import type { ImprovementPriority } from "@/lib/types";
import { StampToggleGroup } from "@/components/profiler/StampToggleGroup";
import { FormError, SubmitButton } from "@/components/auth/DossierCard";

const PROFICIENCY_OPTIONS = [1, 2, 3, 4, 5].map((n) => ({
  value: String(n),
  label: String(n),
}));

const PRIORITY_OPTIONS: { value: ImprovementPriority; label: string }[] = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
];

interface SubjectRowState {
  proficiency: number | null;
  improvement_priority: ImprovementPriority | null;
}

export default function ProfilerPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [rows, setRows] = useState<Record<number, SubjectRowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const s = getSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of an external system (localStorage) on mount
    setSession(s);
    setChecked(true);
  }, []);

  useEffect(() => {
    if (checked && (!session || session.role !== "student")) {
      router.replace("/auth");
    }
  }, [checked, session, router]);

  const group = session?.student?.academic_group ?? null;
  const subjects = useMemo(() => (group ? SUBJECTS_BY_GROUP[group] : []), [group]);

  function setProficiency(subjectId: number, value: string) {
    setRows((prev) => ({
      ...prev,
      [subjectId]: { ...prev[subjectId], proficiency: Number(value), improvement_priority: prev[subjectId]?.improvement_priority ?? null },
    }));
  }

  function setPriority(subjectId: number, value: ImprovementPriority) {
    setRows((prev) => ({
      ...prev,
      [subjectId]: { ...prev[subjectId], improvement_priority: value, proficiency: prev[subjectId]?.proficiency ?? null },
    }));
  }

  const allComplete =
    subjects.length > 0 &&
    subjects.every((s) => rows[s.id]?.proficiency && rows[s.id]?.improvement_priority);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!allComplete || !session?.student) {
      setError("Rate every subject and pick a priority before continuing.");
      return;
    }

    setLoading(true);
    try {
      await saveStudentSubjects(
        session.student.id,
        subjects.map((s) => ({
          subject_id: s.id,
          proficiency: rows[s.id].proficiency as 1 | 2 | 3 | 4 | 5,
          improvement_priority: rows[s.id].improvement_priority as ImprovementPriority,
        })),
      );
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your ratings. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!checked || !session?.student) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="marginalia text-ink-45">Opening the Profiler…</p>
      </main>
    );
  }

  if (saved) {
    return (
      <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
        <div className="w-full max-w-md border border-ink bg-parchment bg-graph-paper px-6 py-8 text-center">
          <p className="marginalia text-emerald">Profile saved</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">
            Ready to find your squad
          </h1>
          <p className="mt-3 text-sm text-ink-70">
            Your ratings are on file. Finding your squad is the next step —
            it comes in a later build step, so for now this confirms the
            Profiler saved correctly against the real backend.
          </p>
          <button
            onClick={() => router.push("/desk")}
            className="btn-stamp mt-6 bg-ink text-parchment"
          >
            Back to Your Desk
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-desk-lamp px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <p className="marginalia text-oxblood">The Profiler</p>
        <h1 className="mt-1 font-serif text-4xl font-semibold text-ink">
          Rate yourself, honestly
        </h1>
        <p className="mt-3 max-w-lg text-ink-70">
          For each subject in {group}, rate your current proficiency from 1
          (just starting) to 5 (could teach it), and how much you want to
          improve it. This is how we find people who balance out your
          squad — not just people who match your schedule.
        </p>

        <form onSubmit={handleSubmit} className="mt-10">
          <div className="border border-ink bg-parchment">
            {subjects.map((subject, i) => (
              <div
                key={subject.id}
                className={
                  "flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between " +
                  (i !== subjects.length - 1 ? "border-b border-ink-10" : "")
                }
              >
                <span className="font-serif text-xl font-medium text-ink">
                  {subject.name}
                </span>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-8">
                  <div className="flex flex-col gap-1.5">
                    <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-45">
                      Proficiency
                    </span>
                    <StampToggleGroup
                      ariaLabel={`${subject.name} proficiency`}
                      options={PROFICIENCY_OPTIONS}
                      value={rows[subject.id]?.proficiency ? String(rows[subject.id].proficiency) : null}
                      onChange={(v) => setProficiency(subject.id, v)}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-45">
                      Improvement Priority
                    </span>
                    <StampToggleGroup
                      ariaLabel={`${subject.name} improvement priority`}
                      options={PRIORITY_OPTIONS}
                      value={rows[subject.id]?.improvement_priority ?? null}
                      onChange={(v) => setPriority(subject.id, v)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <FormError message={error} />
            <SubmitButton loading={loading} disabled={!allComplete}>
              Save My Profile
            </SubmitButton>
            {!allComplete && (
              <p className="marginalia text-center text-sm text-ink-45">
                Rate every subject to continue.
              </p>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
