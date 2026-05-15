import { TrendingUp } from "lucide-react";
import { AudienceGrowthCard } from "@/components/audience-growth-card";

export const metadata = {
  title: "Audience — PostFlow",
};

export default function AudiencePage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <TrendingUp className="h-6 w-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-semibold">Audience Growth</h1>
          <p className="text-sm text-muted-foreground">
            Track follower counts over time across your connected social accounts
          </p>
        </div>
      </div>

      {/* Growth chart */}
      <AudienceGrowthCard />
    </div>
  );
}
