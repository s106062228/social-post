import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Handshake, ArrowRight, DollarSign, CalendarRange } from "lucide-react";
import { CreateCollaborationForm } from "./create-collaboration-form";
import { DeleteCollaborationButton } from "./delete-collaboration-button";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  COMPLETED: "secondary",
  CANCELLED: "destructive",
};

export default async function CollaborationsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const collaborations = await prisma.collaboration.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      partnerName: true,
      partnerHandle: true,
      platform: true,
      startDate: true,
      endDate: true,
      budget: true,
      status: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Collaborations</h1>
        <p className="text-muted-foreground">
          Track influencer and brand partnership collaborations and their linked posts.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>New collaboration</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateCollaborationForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {collaborations.length} collaboration{collaborations.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {collaborations.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Handshake className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No collaborations yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first collaboration above to start tracking partnerships.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {collaborations.map((collab) => (
                <div
                  key={collab.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/collaborations/${collab.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {collab.name}
                      </Link>
                      <Badge variant={STATUS_COLORS[collab.status] ?? "secondary"}>
                        {collab.status.charAt(0) + collab.status.slice(1).toLowerCase()}
                      </Badge>
                      {collab.platform && (
                        <Badge variant="outline" className="text-xs">
                          {collab.platform.charAt(0) + collab.platform.slice(1).toLowerCase().replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Partner: <span className="font-medium">{collab.partnerName}</span>
                      {collab.partnerHandle && (
                        <span className="ml-1 text-xs">{collab.partnerHandle}</span>
                      )}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {collab._count.posts} post{collab._count.posts !== 1 ? "s" : ""}
                      </span>

                      {collab.budget != null && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />
                          {collab.budget.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}

                      {(collab.startDate ?? collab.endDate) && (
                        <span className="flex items-center gap-1">
                          <CalendarRange className="h-3 w-3" />
                          {collab.startDate
                            ? new Date(collab.startDate).toLocaleDateString()
                            : "—"}
                          {" → "}
                          {collab.endDate
                            ? new Date(collab.endDate).toLocaleDateString()
                            : "ongoing"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/collaborations/${collab.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      title="View collaboration"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <DeleteCollaborationButton collaborationId={collab.id} />
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
