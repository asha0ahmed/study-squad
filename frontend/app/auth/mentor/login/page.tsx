"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, loginMentor } from "@/lib/api";
import { DossierCard, FormError, SubmitButton } from "@/components/auth/DossierCard";
import { TextField } from "@/components/auth/FormFields";

export default function MentorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginMentor(email, password);
      router.push("/desk");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign you in. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
      <DossierCard eyebrow="Mentor sign-in" title="Welcome back">
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
          <Link href="/auth/mentor/signup" className="font-semibold text-emerald underline">
            Register as a mentor
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-ink-45">
          <Link href="/auth" className="underline">
            Not a Mentor? Switch entry
          </Link>
        </p>
      </DossierCard>
    </main>
  );
}
