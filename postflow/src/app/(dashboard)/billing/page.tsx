import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isStripeEnabled } from "@/lib/stripe";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreditCard } from "lucide-react";
import { BillingClient } from "./billing-client";

export default async function BillingPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { planTier: true, planExpiresAt: true, stripeCustomerId: true },
  });

  const planTier = user?.planTier ?? "free";
  const planExpiresAt = user?.planExpiresAt?.toISOString() ?? null;
  const hasCustomerId = Boolean(user?.stripeCustomerId);
  const stripeEnabled = isStripeEnabled();

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Manage your PostFlow subscription and billing details.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription
          </CardTitle>
          <CardDescription>
            Your current plan and available upgrade options.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BillingClient
            planTier={planTier}
            planExpiresAt={planExpiresAt}
            hasCustomerId={hasCustomerId}
            stripeEnabled={stripeEnabled}
          />
        </CardContent>
      </Card>
    </div>
  );
}
