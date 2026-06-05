import { CampaignComparisonCard } from "@/components/campaign-comparison-card";

export const metadata = { title: "Campaign ROI | PostFlow" };

export default function CampaignComparisonPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Campaign Performance Comparison</h1>
        <p className="text-muted-foreground">
          Compare engagement and ROI across your content campaigns, hashtag campaigns, and
          influencer collaborations.
        </p>
      </div>
      <CampaignComparisonCard />
    </div>
  );
}
