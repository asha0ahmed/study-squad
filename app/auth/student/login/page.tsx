"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ApiError, loginStudent } from "@/lib/api";
import { DossierCard, FormError, SubmitButton } from "@/components/auth/DossierCard";
import { TextField } from "@/components/auth/FormFields";

function StudentLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("inviteCode");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginStudent(email, password);
      router.push(inviteCode ? `/invite/${inviteCode}` : "/desk");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign you in. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
      <DossierCard eyebrow="Scholar sign-in" title="Welcome back">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField
            label="Email"
            htmlFor="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password"
            htmlFor="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FormError message={error} />
          <SubmitButton loading={loading}>Sign In</SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-ink-70">
          First time here?{" "}
          <Link
            href={inviteCode ? `/auth/student/signup?inviteCode=${inviteCode}` : "/auth/student/signup"}
            className="font-semibold text-oxblood underline"
          >
            Start your dossier
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-ink-45">
          <Link href="/auth" className="underline">
            Not a Scholar? Switch entry
          </Link>
        </p>
      </DossierCard>
    </main>
  );
}

export default function StudentLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex flex-1 items-center justify-center">
          <p className="marginalia text-ink-45">Loading…</p>
        </main>
      }
    >
      <StudentLoginForm />
    </Suspense>
  );
}
