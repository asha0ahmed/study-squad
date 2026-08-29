"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  adminApprovePayment,
  adminListPayments,
  adminRejectPayment,
  clearAdminSecret,
  getAdminSecret,
} from "@/lib/api";
import type { AdminPayment, PaymentStatus } from "@/lib/types";
import { FormError } from "@/components/auth/DossierCard";

type Filter = PaymentStatus | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "all", label: "All" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminPaymentsPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);

  useEffect(() => {
    const s = getAdminSecret();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of an external system (sessionStorage) on mount
    setSecret(s);
    setChecked(true);
  }, []);

  useEffect(() => {
    if (checked && !secret) router.replace("/admin/login");
  }, [checked, secret, router]);

  const load = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    setError(null);
    try {
      const result = await adminListPayments(secret, filter === "all" ? undefined : filter);
      setPayments(result);
    } catch {
      setError("Couldn't load payments. Your admin secret may be invalid.");
    } finally {
      setLoading(false);
    }
  }, [secret, filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch, setState only after the request resolves
    load();
  }, [load]);

  async function handleAction(paymentId: number, action: "approve" | "reject") {
    if (!secret) return;
    setActingId(paymentId);
    try {
      if (action === "approve") await adminApprovePayment(secret, paymentId);
      else await adminRejectPayment(secret, paymentId);
      await load();
    } catch {
      setError("That action failed. Try again.");
    } finally {
      setActingId(null);
    }
  }

  if (!checked || !secret) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="marginalia text-ink-45">Checking admin access…</p>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-desk-lamp px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="marginalia text-oxblood">Admin</p>
            <h1 className="mt-1 font-serif text-4xl font-semibold text-ink">
              Payment Review
            </h1>
          </div>
          <button
            onClick={() => {
              clearAdminSecret();
              router.replace("/admin/login");
            }}
            className="btn-stamp bg-ink text-parchment"
          >
            Sign Out
          </button>
        </div>

        <div className="mt-8 flex gap-2 border-b border-ink">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={
                "border-t border-x border-ink px-4 py-2.5 -mb-px font-sans text-xs font-semibold uppercase tracking-[0.08em] " +
                (filter === f.value
                  ? "bg-ink text-parchment"
                  : "bg-parchment text-ink-70 hover:text-ink")
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        <FormError message={error} />

        {loading ? (
          <p className="mt-8 marginalia text-ink-45">Loading…</p>
        ) : payments.length === 0 ? (
          <p className="mt-8 marginalia text-ink-45">No payments in this view.</p>
        ) : (
          <div className="mt-6 border border-ink bg-parchment">
            {payments.map((p, i) => (
              <div
                key={p.id}
                className={
                  "flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:justify-between " +
                  (i !== payments.length - 1 ? "border-b border-ink-10" : "")
                }
              >
                <div>
                  <span className="font-serif text-lg font-medium text-ink">
                    {p.student_name}
                  </span>
                  <span className="ml-2 text-xs text-ink-45">{p.student_email}</span>
                  <div className="mt-1 text-sm text-ink-70">
                    {p.plan === "1_month" ? "1 Month" : "6 Months"} · ৳{p.amount} ·{" "}
                    {p.method === "nagad" ? "Nagad" : "bKash"}
                  </div>
                  <div className="mt-1 font-sans text-xs text-ink-45">
                    From {p.sender_phone} · Trx {p.trx_id} · {formatDate(p.created_at)}
                  </div>
                </div>
                {p.status === "pending" ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAction(p.id, "approve")}
                      disabled={actingId === p.id}
                      className="btn-stamp bg-emerald text-parchment disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(p.id, "reject")}
                      disabled={actingId === p.id}
                      className="btn-stamp bg-oxblood text-parchment disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <span
                    className={
                      "border px-2 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-[0.08em] " +
                      (p.status === "approved"
                        ? "border-emerald text-emerald"
                        : "border-oxblood text-oxblood")
                    }
                  >
                    {p.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
