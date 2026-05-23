import { Trophy } from "lucide-react";
import { AchievementsClient } from "./achievements-client";

export default function AchievementsPage() {
  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center gap-3">
        <Trophy className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Achievements</h1>
          <p className="text-muted-foreground">
            Milestones earned through your posting activity.
          </p>
        </div>
      </div>

      <AchievementsClient />
    </div>
  );
}
