import { TrendingUp } from "lucide-react";
import { AudienceGrowthCard } from "@/components/audience-growth-card";
import { GrowthStrategyButton } from "./growth-strategy-button";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const metadata = {
  title: "Audience — PostFlow",
};

export default async function AudiencePage() {
  const session = await auth();
  const userId = session?.user?.id ?? "";

  const accounts = userId
    ? await prisma.socialAccount.findMany({
        where: { userId, isActive: true },
        select: { platform: true },
      })
    : [];

  const platforms = [...new Set(accounts.map((a) => a.platform as string))];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-6 w-6 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-semibold">Audience Growth</h1>
            <p className="text-sm text-muted-foreground">
              Track follower counts over time across your connected social accounts
            </p>
          </div>
        </div>
        <GrowthStrategyButton platforms={platforms} />
      </div>

      {/* Growth chart */}
      <AudienceGrowthCard />
    </div>
  );
}
