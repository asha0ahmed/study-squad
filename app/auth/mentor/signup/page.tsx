"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, loginMentor, signupMentor } from "@/lib/api";
import { DossierCard, FormError, SubmitButton } from "@/components/auth/DossierCard";
import { TextField } from "@/components/auth/FormFields";

const GROUPS: Array<"Science" | "Arts" | "Commerce"> = ["Science", "Arts", "Commerce"];

export default function MentorSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    institution: "",
  });
  const [groups, setGroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleGroup(group: string) {
    setGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (groups.size === 0) {
      setError("Select at least one subject group you can mentor.");
      return;
    }

    setLoading(true);
    try {
      await signupMentor({
        name: form.name,
        email: form.email,
        password: form.password,
        institution: form.institution,
        groups: Array.from(groups) as ("Science" | "Arts" | "Commerce")[],
      });
      await loginMentor(form.email, form.password);
      router.push("/desk");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create your account. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
      <DossierCard eyebrow="Mentor admission form" title="Register as a mentor">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField
            label="Full Name"
            htmlFor="name"
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
          />
          <TextField
            label="Email"
            htmlFor="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
          <TextField
            label="Password"
            htmlFor="password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 8 characters."
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
          />
          <TextField
            label="Institution"
            htmlFor="institution"
            required
            value={form.institution}
            onChange={(e) => update("institution", e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <span className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-ink-70">
              Groups you can mentor
            </span>
            <div className="flex flex-col gap-2 border border-ink px-3 py-3">
              {GROUPS.map((group) => (
                <label key={group} className="flex items-center gap-2 text-[15px] text-ink">
                  <input
                    type="checkbox"
                    checked={groups.has(group)}
                    onChange={() => toggleGroup(group)}
                    className="h-4 w-4 accent-emerald"
                  />
                  {group}
                </label>
              ))}
            </div>
            <p className="marginalia text-sm text-ink-45">
              Each group needs separate admin approval before you can claim squads in it.
            </p>
          </div>

          <FormError message={error} />
          <SubmitButton loading={loading}>Register</SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm text-ink-70">
          Already registered?{" "}
          <Link href="/auth/mentor/login" className="font-semibold text-emerald underline">
            Sign in
          </Link>
        </p>
      </DossierCard>
    </main>
  );
}
