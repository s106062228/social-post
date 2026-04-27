"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Users } from "lucide-react";

export default function JoinTeamPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [joined, setJoined] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);

  async function handleJoin() {
    if (!token) {
      toast.error("Invalid invite link");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/teams/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as { teamId?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to join team");
      }
      setTeamId(data.teamId ?? null);
      setJoined(true);
      toast.success("Joined team successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join team");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center p-8">
        <Card className="max-w-sm w-full">
          <CardContent className="pt-6 text-center text-muted-foreground">
            Invalid invite link.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-8">
      <Card className="max-w-sm w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Team Invite</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-center">
          {joined ? (
            <>
              <p className="text-sm text-muted-foreground">
                You have successfully joined the team.
              </p>
              <Button onClick={() => router.push(teamId ? `/teams/${teamId}` : "/teams")}>
                Go to Team
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                You&apos;ve been invited to join a team on PostFlow.
              </p>
              <Button onClick={handleJoin} disabled={loading}>
                {loading ? "Joining…" : "Accept Invite"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
