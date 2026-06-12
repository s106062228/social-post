import { type Metadata } from "next";
import { ContestsClient } from "./contests-client";

export const metadata: Metadata = {
  title: "Contests | PostFlow",
};

export default function ContestsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Contests &amp; Giveaways</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Run social media contests, track entries, and draw winners fairly.
        </p>
      </div>
      <ContestsClient />
    </div>
  );
}
