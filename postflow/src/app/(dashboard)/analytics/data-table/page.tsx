import { TableProperties } from "lucide-react";
import { PostsDataTable } from "@/components/posts-data-table";

export const metadata = { title: "Analytics Data Table | PostFlow" };

export default function AnalyticsDataTablePage() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <TableProperties className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Analytics Data Table</h1>
          <p className="text-sm text-muted-foreground">
            Sortable, filterable table of all published post performance data with CSV export.
          </p>
        </div>
      </div>

      <div className="bg-card border rounded-xl p-4">
        <PostsDataTable />
      </div>
    </div>
  );
}
