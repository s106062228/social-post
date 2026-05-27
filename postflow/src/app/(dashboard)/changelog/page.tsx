import { Newspaper } from "lucide-react";
import { ChangelogClient } from "./changelog-client";

export default function ChangelogPage() {
  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center gap-3">
        <Newspaper className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Changelog</h1>
          <p className="text-muted-foreground">
            Latest features, improvements, and bug fixes.
          </p>
        </div>
      </div>

      <ChangelogClient />
    </div>
  );
}
