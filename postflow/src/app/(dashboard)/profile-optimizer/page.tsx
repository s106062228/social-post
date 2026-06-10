import { Target } from "lucide-react";
import { ProfileOptimizerCard } from "@/components/profile-optimizer-card";

export const metadata = {
  title: "Profile Optimizer — PostFlow",
};

export default function ProfileOptimizerPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Target className="h-6 w-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-semibold">Profile Optimizer</h1>
          <p className="text-sm text-muted-foreground">
            Actionable recommendations to improve your social media profile
            performance across Activity, Engagement, Growth, and Consistency
          </p>
        </div>
      </div>

      <ProfileOptimizerCard />
    </div>
  );
}
