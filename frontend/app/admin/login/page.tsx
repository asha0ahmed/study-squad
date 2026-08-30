"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, adminListPayments, setAdminSecret } from "@/lib/api";
import { DossierCard, FormError, SubmitButton } from "@/components/auth/DossierCard";
import { TextField } from "@/components/auth/FormFields";

export default function AdminLoginPage() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // No dedicated "verify admin secret" endpoint exists -- calling a
      // real admin-only route is the most honest way to check it's
      // correct without inventing a new backend endpoint just for this.
      await adminListPayments(secret);
      setAdminSecret(secret);
      router.push("/admin/payments");
    } catch (err) {
      setError(err instanceof ApiError ? "Incorrect admin secret." : "Couldn't verify the secret. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
      <DossierCard eyebrow="Admin" title="Admin Access">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <TextField
            label="Admin Secret"
            htmlFor="secret"
            type="password"
            required
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
          <FormError message={error} />
          <SubmitButton loading={loading}>Enter</SubmitButton>
        </form>
      </DossierCard>
    </main>
  );
}
