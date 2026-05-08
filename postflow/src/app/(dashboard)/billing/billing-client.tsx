"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { CreditCard, ExternalLink, CheckCircle2, Zap } from "lucide-react";

interface BillingClientProps {
  planTier: string;
  planExpiresAt: string | null;
  hasCustomerId: boolean;
  stripeEnabled: boolean;
}

export function BillingClient({
  planTier,
  planExpiresAt,
  hasCustomerId,
  stripeEnabled,
}: BillingClientProps) {
  const [loading, setLoading] = useState<"checkout" | "portal" | null>(null);

  async function handleUpgrade() {
    setLoading("checkout");
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) {
        toast({ title: data.error ?? "Failed to start checkout", variant: "destructive" });
        return;
      }
      window.location.href = data.url!;
    } catch {
      toast({ title: "Network error — please try again", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  async function handleManage() {
    setLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = (await res.json()) as { error?: string; url?: string };
      if (!res.ok) {
        toast({ title: data.error ?? "Failed to open billing portal", variant: "destructive" });
        return;
      }
      window.location.href = data.url!;
    } catch {
      toast({ title: "Network error — please try again", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  }

  const isPro = planTier === "pro";
  const expiryDate = planExpiresAt ? new Date(planExpiresAt).toLocaleDateString() : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Current plan */}
      <div className="flex items-center gap-4 rounded-lg border p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          {isPro ? (
            <Zap className="h-6 w-6 text-primary" />
          ) : (
            <CreditCard className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">Current plan</p>
          <p className="text-2xl font-bold capitalize">{planTier}</p>
          {expiryDate && (
            <p className="text-sm text-muted-foreground">
              {isPro ? "Renews" : "Expires"} on {expiryDate}
            </p>
          )}
        </div>
        {stripeEnabled && (
          <div className="flex gap-2">
            {!isPro && (
              <Button onClick={handleUpgrade} disabled={loading !== null}>
                {loading === "checkout" ? "Loading…" : "Upgrade to Pro"}
              </Button>
            )}
            {hasCustomerId && (
              <Button
                variant="outline"
                onClick={handleManage}
                disabled={loading !== null}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {loading === "portal" ? "Loading…" : "Manage Subscription"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Plan comparison */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Free plan */}
        <div className={`rounded-lg border p-6 ${!isPro ? "border-primary ring-1 ring-primary" : ""}`}>
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Free</h3>
              {!isPro && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Current
                </span>
              )}
            </div>
            <p className="text-3xl font-bold">
              $0<span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {[
              "3 social accounts",
              "50 scheduled posts/month",
              "Basic analytics",
              "1 team member",
              "7-day activity history",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Pro plan */}
        <div className={`rounded-lg border p-6 ${isPro ? "border-primary ring-1 ring-primary" : ""}`}>
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Pro</h3>
              {isPro && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  Current
                </span>
              )}
            </div>
            <p className="text-3xl font-bold">
              $19<span className="text-sm font-normal text-muted-foreground">/mo</span>
            </p>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {[
              "Unlimited social accounts",
              "Unlimited scheduled posts",
              "Advanced analytics & insights",
              "Up to 10 team members",
              "Full activity history",
              "AI content suggestions",
              "Priority support",
            ].map((f) => (
              <li key={f} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          {stripeEnabled && !isPro && (
            <Button className="mt-4 w-full" onClick={handleUpgrade} disabled={loading !== null}>
              {loading === "checkout" ? "Loading…" : "Upgrade to Pro"}
            </Button>
          )}
        </div>
      </div>

      {!stripeEnabled && (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Stripe is not configured. Set{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">STRIPE_SECRET_KEY</code> and
            other billing environment variables to enable subscription management.
          </p>
        </div>
      )}
    </div>
  );
}
