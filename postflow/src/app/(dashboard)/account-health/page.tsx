import { HeartPulse } from "lucide-react";
import { AccountHealthCard } from "@/components/account-health-card";

export const metadata = {
  title: "Account Health — PostFlow",
};

export default function AccountHealthPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <HeartPulse className="h-6 w-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-semibold">Account Health</h1>
          <p className="text-sm text-muted-foreground">
            Monitor activity, engagement, and growth across all your connected social accounts
          </p>
        </div>
      </div>

      {/* Health card */}
      <AccountHealthCard />
    </div>
  );
}
