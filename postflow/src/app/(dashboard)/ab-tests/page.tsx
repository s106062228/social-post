import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, ArrowRight, Trophy } from "lucide-react";
import { CreateABTestForm } from "./create-ab-test-form";
import { DeleteABTestButton } from "./delete-ab-test-button";

function winnerBadge(winner: string | null) {
  if (!winner) return null;
  const variant =
    winner === "A" ? "default" : winner === "B" ? "secondary" : "outline";
  const label =
    winner === "A" ? "Winner: A" : winner === "B" ? "Winner: B" : "Inconclusive";
  return <Badge variant={variant}>{label}</Badge>;
}

export default async function ABTestsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const [tests, posts] = await Promise.all([
    prisma.postABTest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        winner: true,
        createdAt: true,
        postA: { select: { id: true, content: true, status: true } },
        postB: { select: { id: true, content: true, status: true } },
      },
    }),
    prisma.post.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, content: true, status: true },
      take: 200,
    }),
  ]);

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">A/B Tests</h1>
        <p className="text-muted-foreground">
          Compare two post variants to discover which content resonates more with your audience.
        </p>
      </div>

      {/* Create form */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>New A/B test</CardTitle>
        </CardHeader>
        <CardContent>
          {posts.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              You need at least two posts to create an A/B test.{" "}
              <Link href="/posts/new" className="underline">
                Create a post
              </Link>
            </p>
          ) : (
            <CreateABTestForm posts={posts} />
          )}
        </CardContent>
      </Card>

      {/* Test list */}
      <Card>
        <CardHeader>
          <CardTitle>
            {tests.length} test{tests.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {tests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <FlaskConical className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No A/B tests yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first test above to start comparing post variants.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {tests.map((test) => (
                <div
                  key={test.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/ab-tests/${test.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {test.name}
                      </Link>
                      {test.winner ? (
                        winnerBadge(test.winner)
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <FlaskConical className="h-3 w-3" />
                          Running
                        </Badge>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                      <div className="rounded bg-muted px-2 py-1">
                        <span className="font-semibold text-foreground">A:</span>{" "}
                        {test.postA.content.slice(0, 80)}
                        {test.postA.content.length > 80 ? "…" : ""}
                      </div>
                      <div className="rounded bg-muted px-2 py-1">
                        <span className="font-semibold text-foreground">B:</span>{" "}
                        {test.postB.content.slice(0, 80)}
                        {test.postB.content.length > 80 ? "…" : ""}
                      </div>
                    </div>

                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {new Date(test.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    {!test.winner && (
                      <Link
                        href={`/ab-tests/${test.id}`}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
                        title="View & conclude test"
                      >
                        <Trophy className="h-3 w-3" />
                        Conclude
                      </Link>
                    )}
                    <Link
                      href={`/ab-tests/${test.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      title="View test"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <DeleteABTestButton testId={test.id} />
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
