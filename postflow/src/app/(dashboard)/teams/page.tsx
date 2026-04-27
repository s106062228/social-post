import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, ArrowRight } from "lucide-react";
import { CreateTeamForm } from "./create-team-form";
import { DeleteTeamButton } from "./delete-team-button";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  OWNER: "default",
  ADMIN: "default",
  EDITOR: "secondary",
  VIEWER: "outline",
};

export default async function TeamsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    include: {
      team: {
        include: { _count: { select: { members: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
        <p className="text-muted-foreground">
          Collaborate with others by creating or joining a team.
        </p>
      </div>

      {/* Create form */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New team</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateTeamForm />
        </CardContent>
      </Card>

      {/* Team list */}
      <Card>
        <CardHeader>
          <CardTitle>
            {memberships.length} team{memberships.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memberships.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Users className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No teams yet</p>
              <p className="text-xs text-muted-foreground">
                Create a team above to start collaborating.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {memberships.map((m) => (
                <div
                  key={m.teamId}
                  className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/teams/${m.teamId}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {m.team.name}
                      </Link>
                      <Badge variant={ROLE_VARIANTS[m.role] ?? "outline"}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {m.team._count.members} member{m.team._count.members !== 1 ? "s" : ""}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/teams/${m.teamId}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      title="View team"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    {m.role === "OWNER" && <DeleteTeamButton teamId={m.teamId} />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
