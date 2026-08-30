"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, getSession, joinViaInvite, StoredSession } from "@/lib/api";
import { FormError, SubmitButton } from "@/components/auth/DossierCard";

export default function InviteJoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code;

  const [checked, setChecked] = useState(false);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    const s = getSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of an external system (localStorage) on mount
    setSession(s);
    setChecked(true);
  }, []);

  async function handleJoin() {
    setJoining(true);
    setError(null);
    try {
      await joinViaInvite(code);
      setJoined(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't join this squad.");
    } finally {
      setJoining(false);
    }
  }

  if (!checked) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="marginalia text-ink-45">Opening your invite…</p>
      </main>
    );
  }

  if (joined) {
    return (
      <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
        <div className="w-full max-w-md border border-ink bg-parchment px-6 py-8 text-center">
          <p className="marginalia text-emerald">You&apos;re in</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">
            Welcome to the squad
          </h1>
          <Link href="/squad" className="btn-stamp mt-6 inline-block bg-oxblood text-parchment">
            View Your Squad
          </Link>
        </div>
      </main>
    );
  }

  // Not a student, or not signed in -- send them to sign up/in first,
  // carrying the invite code so student signup can auto-join at creation
  // time (POST /students already supports an inviteCode field).
  if (!session || session.role !== "student") {
    return (
      <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
        <div className="w-full max-w-md border border-ink bg-parchment px-6 py-8 text-center">
          <p className="marginalia text-oxblood">You&apos;ve been invited</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">
            Join a Study Squad
          </h1>
          <p className="mt-3 text-sm text-ink-70">
            Sign up or sign in as a Scholar to accept this invite.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href={`/auth/student/signup?inviteCode=${code}`}
              className="btn-stamp bg-oxblood text-parchment"
            >
              Sign Up
            </Link>
            <Link
              href={`/auth/student/login?inviteCode=${code}`}
              className="btn-stamp bg-transparent text-ink"
            >
              I Already Have an Account
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
      <div className="w-full max-w-md border border-ink bg-parchment px-6 py-8 text-center">
        <p className="marginalia text-oxblood">You&apos;ve been invited</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">
          Join this squad?
        </h1>
        <FormError message={error} />
        <div className="mt-6">
          <SubmitButton type="button" loading={joining} onClick={handleJoin}>
            Accept Invite
          </SubmitButton>
        </div>
        <button
          onClick={() => router.push("/desk")}
          className="mt-3 text-sm text-ink-45 underline"
        >
          Not now
        </button>
      </div>
    </main>
  );
}
