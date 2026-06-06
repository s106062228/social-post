import { ClipboardList } from "lucide-react";
import { AuditReportsClient } from "./audit-reports-client";

export const metadata = {
  title: "Account Audit — PostFlow",
};

export default function AuditReportsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <ClipboardList className="h-6 w-6 text-indigo-500" />
        <div>
          <h1 className="text-2xl font-semibold">Account Audit</h1>
          <p className="text-sm text-muted-foreground">
            Comprehensive analysis of your social media performance, content strategy, and growth
          </p>
        </div>
      </div>

      <AuditReportsClient />
    </div>
  );
}
