import { type Metadata } from "next";
import { AutopilotClient } from "./autopilot-client";

export const metadata: Metadata = {
  title: "Autopilot | PostFlow",
};

export default function AutopilotPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Content Autopilot</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Automate publishing actions based on triggers like queue size,
          engagement drops, and posting gaps.
        </p>
      </div>
      <AutopilotClient />
    </div>
  );
}
