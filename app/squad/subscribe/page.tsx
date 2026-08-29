"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getMySquad,
  getSession,
  getLatestPayment,
  StoredSession,
  submitPayment,
} from "@/lib/api";
import type { Payment, PaymentMethod, PaymentPlan } from "@/lib/types";
import { FormError, SubmitButton } from "@/components/auth/DossierCard";
import { TextField } from "@/components/auth/FormFields";

const PLANS: { value: PaymentPlan; label: string; price: string; note: string }[] = [
  { value: "1_month", label: "1 Month", price: "৳99", note: "Try it out" },
  { value: "6_month", label: "6 Months", price: "৳499", note: "Best value" },
];

const METHODS: { value: PaymentMethod; label: string; number: string }[] = [
  { value: "nagad", label: "Nagad", number: "+8801937553593" },
  { value: "bkash", label: "bKash", number: "+8801724536385" },
];

type Screen =
  | { state: "loading" }
  | { state: "has-squad" }
  | { state: "form" }
  | { state: "pending"; payment: Payment }
  | { state: "rejected"; payment: Payment }
  | { state: "approved"; payment: Payment };

export default function SubscribePage() {
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [screen, setScreen] = useState<Screen>({ state: "loading" });

  const [plan, setPlan] = useState<PaymentPlan | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [senderPhone, setSenderPhone] = useState("");
  const [trxId, setTrxId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const s = getSession();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of an external system (localStorage) on mount
    setSession(s);
    setSessionChecked(true);
  }, []);

  useEffect(() => {
    if (sessionChecked && (!session || session.role !== "student")) {
      router.replace("/auth");
    }
  }, [sessionChecked, session, router]);

  const load = useCallback(async () => {
    if (!session?.student) return;
    try {
      await getMySquad(session.student.id);
      // Already has a squad -- nothing to subscribe for.
      setScreen({ state: "has-squad" });
      return;
    } catch {
      // 404 means no squad yet (expected -- fall through to payment check).
      // Any other error also falls through rather than getting stuck here.
    }

    try {
      const payment = await getLatestPayment(session.student.id);
      if (payment.status === "pending") setScreen({ state: "pending", payment });
      else if (payment.status === "rejected") setScreen({ state: "rejected", payment });
      else setScreen({ state: "approved", payment });
    } catch {
      // 404 means no payment submitted yet -- show the form. Any other
      // error also falls through to the form rather than getting stuck.
      setScreen({ state: "form" });
    }
  }, [session]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount, setState only happens after the request resolves
    if (session?.student) load();
  }, [session, load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!plan || !method || !senderPhone.trim() || !trxId.trim()) {
      setError("Choose a plan, a payment method, and fill in both fields below.");
      return;
    }
    if (!session?.student) return;

    setSubmitting(true);
    try {
      await submitPayment(session.student.id, {
        plan,
        method,
        sender_phone: senderPhone.trim(),
        trx_id: trxId.trim(),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit your payment. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!sessionChecked || !session?.student || screen.state === "loading") {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="marginalia text-ink-45">Loading…</p>
      </main>
    );
  }

  if (screen.state === "has-squad") {
    return (
      <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
        <div className="w-full max-w-md border border-ink bg-parchment px-6 py-8 text-center">
          <p className="marginalia text-emerald">You&apos;re already set</p>
          <Link href="/squad" className="btn-stamp mt-4 inline-block bg-oxblood text-parchment">
            View Your Squad
          </Link>
        </div>
      </main>
    );
  }

  if (screen.state === "pending") {
    return (
      <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
        <div className="w-full max-w-md border border-ink bg-parchment bg-graph-paper px-6 py-8 text-center">
          <p className="marginalia text-amber">Awaiting Approval</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">
            We&apos;ve got your payment
          </h1>
          <p className="mt-3 text-sm text-ink-70">
            Trx ID <span className="font-semibold">{screen.payment.trx_id}</span> is
            being reviewed. This is usually quick — check back shortly.
          </p>
          <button onClick={load} className="btn-stamp mt-6 bg-ink text-parchment">
            Check Again
          </button>
        </div>
      </main>
    );
  }

  if (screen.state === "approved") {
    return (
      <main className="flex flex-1 items-center justify-center bg-desk-lamp px-6 py-16">
        <div className="w-full max-w-md border border-ink bg-parchment bg-graph-paper px-6 py-8 text-center">
          <p className="marginalia text-emerald">Payment Approved</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">
            You&apos;re all set
          </h1>
          <Link href="/squad/find" className="btn-stamp mt-6 inline-block bg-oxblood text-parchment">
            Find My Squad
          </Link>
        </div>
      </main>
    );
  }

  // screen.state === "form" or "rejected"
  return (
    <main className="flex-1 bg-desk-lamp px-6 py-16">
      <div className="mx-auto max-w-xl">
        {screen.state === "rejected" && (
          <div className="mb-8 border border-oxblood bg-oxblood/5 px-5 py-4">
            <p className="font-sans text-sm font-semibold text-oxblood">
              Your last payment couldn&apos;t be verified
            </p>
            <p className="mt-1 text-sm text-ink-70">
              Double-check the details below and submit again.
            </p>
          </div>
        )}

        <p className="marginalia text-oxblood">Mentor Fee</p>
        <h1 className="mt-1 font-serif text-4xl font-semibold text-ink">
          Choose your plan
        </h1>
        <p className="mt-3 text-ink-70">
          A small fee covers your mentor&apos;s time. Pick a plan, send the
          payment, and tell us the details below.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PLANS.map((p) => (
              <button
                type="button"
                key={p.value}
                onClick={() => setPlan(p.value)}
                className={
                  "border px-5 py-5 text-left transition-colors " +
                  (plan === p.value
                    ? "border-ink bg-ink text-parchment"
                    : "border-ink bg-parchment text-ink hover:bg-parchment-dim")
                }
              >
                <span className="block font-sans text-[11px] font-semibold uppercase tracking-[0.08em] opacity-70">
                  {p.note}
                </span>
                <span className="mt-1 block font-serif text-2xl font-semibold">
                  {p.label}
                </span>
                <span className="mt-1 block text-lg">{p.price}</span>
              </button>
            ))}
          </div>

          <div>
            <span className="font-sans text-xs font-semibold uppercase tracking-[0.08em] text-ink-70">
              Send Money To
            </span>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {METHODS.map((m) => (
                <button
                  type="button"
                  key={m.value}
                  onClick={() => setMethod(m.value)}
                  className={
                    "border px-4 py-4 text-left transition-colors " +
                    (method === m.value
                      ? "border-ink bg-ink text-parchment"
                      : "border-ink bg-parchment text-ink hover:bg-parchment-dim")
                  }
                >
                  <span className="block font-serif text-lg font-semibold">{m.label}</span>
                  <span className="mt-0.5 block font-sans text-sm">{m.number}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <TextField
              label="Phone number you sent from"
              htmlFor="sender_phone"
              required
              placeholder="01XXXXXXXXX"
              value={senderPhone}
              onChange={(e) => setSenderPhone(e.target.value)}
            />
            <TextField
              label="Transaction ID (Trx ID)"
              htmlFor="trx_id"
              required
              value={trxId}
              onChange={(e) => setTrxId(e.target.value)}
            />
          </div>

          <FormError message={error} />
          <SubmitButton loading={submitting}>Proceed</SubmitButton>
        </form>
      </div>
    </main>
  );
}
