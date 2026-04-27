import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Link as LinkIcon } from "lucide-react";
import { InviteForm } from "./invite-form";
import { MemberActions } from "./member-actions";

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

type Props = { params: Promise<{ id: string }> };

export default async function TeamDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const userId = session!.user!.id;

  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId: id, userId } },
    include: {
      team: {
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: "asc" },
          },
          invites: { orderBy: { createdAt: "desc" } },
        },
      },
    },
  });

  if (!membership) notFound();

  const { team } = membership;
  const canManage = membership.role === "OWNER" || membership.role === "ADMIN";

  return (
    <div className="flex flex-col gap-8 p-8 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
        <p className="text-muted-foreground mt-1">
          Your role:{" "}
          <Badge variant={ROLE_VARIANTS[membership.role] ?? "outline"}>
            {ROLE_LABELS[membership.role] ?? membership.role}
          </Badge>
        </p>
      </div>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members ({team.members.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {team.members.map((m) => {
              const isSelf = m.userId === userId;
              const isOwner = m.role === "OWNER";
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {m.user.name ?? m.user.email}
                        {isSelf && (
                          <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                        )}
                      </span>
                      <Badge variant={ROLE_VARIANTS[m.role] ?? "outline"} className="text-xs">
                        {ROLE_LABELS[m.role] ?? m.role}
                      </Badge>
                    </div>
                    {m.user.name && (
                      <p className="text-xs text-muted-foreground">{m.user.email}</p>
                    )}
                  </div>

                  {canManage && !isOwner && (
                    <MemberActions
                      teamId={id}
                      userId={m.userId}
                      currentRole={m.role}
                      isSelf={isSelf}
                    />
                  )}
                  {!canManage && isSelf && (
                    <MemberActions
                      teamId={id}
                      userId={m.userId}
                      currentRole={m.role}
                      isSelf={true}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Invite — only OWNER/ADMIN */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LinkIcon className="h-5 w-5" />
              Invite members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm teamId={id} />
          </CardContent>
        </Card>
      )}

      {/* Pending invites */}
      {canManage && team.invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites ({team.invites.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y text-sm">
              {team.invites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="flex-1 text-muted-foreground">
                    {inv.email ?? "Open invite"}
                  </span>
                  <Badge variant="outline">{ROLE_LABELS[inv.role] ?? inv.role}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
