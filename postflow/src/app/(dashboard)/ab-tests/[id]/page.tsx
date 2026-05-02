import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FlaskConical, Trophy } from "lucide-react";
import { ConcludeTestForm } from "./conclude-test-form";

interface InsightRow {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
}

function sumInsights(insights: InsightRow[]): InsightRow {
  return insights.reduce(
    (acc, ins) => ({
      impressions: acc.impressions + ins.impressions,
      reach: acc.reach + ins.reach,
      likes: acc.likes + ins.likes,
      comments: acc.comments + ins.comments,
      shares: acc.shares + ins.shares,
    }),
    { impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0 }
  );
}

function MetricChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-md border bg-muted px-3 py-2 text-center">
      <span className="text-lg font-semibold">{value.toLocaleString()}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function ABTestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const test = await prisma.postABTest.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      name: true,
      winner: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      postA: {
        select: {
          id: true,
          content: true,
          status: true,
          mediaType: true,
          scheduledAt: true,
          publishResults: {
            select: {
              platform: true,
              status: true,
              publishedAt: true,
              insights: {
                select: {
                  impressions: true,
                  reach: true,
                  likes: true,
                  comments: true,
                  shares: true,
                },
              },
            },
          },
        },
      },
      postB: {
        select: {
          id: true,
          content: true,
          status: true,
          mediaType: true,
          scheduledAt: true,
          publishResults: {
            select: {
              platform: true,
              status: true,
              publishedAt: true,
              insights: {
                select: {
                  impressions: true,
                  reach: true,
                  likes: true,
                  comments: true,
                  shares: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!test) notFound();
  if (test.userId !== session.user.id) notFound();

  const insightsA = test.postA.publishResults.flatMap((r) => r.insights);
  const insightsB = test.postB.publishResults.flatMap((r) => r.insights);
  const totalsA = sumInsights(insightsA);
  const totalsB = sumInsights(insightsB);

  const hasInsights = insightsA.length > 0 || insightsB.length > 0;

  function winnerBadge(winner: string | null) {
    if (!winner) return null;
    const color =
      winner === "A" ? "default" : winner === "B" ? "secondary" : "outline";
    return (
      <Badge variant={color} className="gap-1">
        <Trophy className="h-3 w-3" />
        {winner === "INCONCLUSIVE" ? "Inconclusive" : `Winner: Variant ${winner}`}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col gap-8 p-8 max-w-6xl">
      {/* Breadcrumb */}
      <div>
        <Link
          href="/ab-tests"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          A/B Tests
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-3xl font-bold tracking-tight">{test.name}</h1>
        {test.winner ? (
          winnerBadge(test.winner)
        ) : (
          <Badge variant="outline" className="gap-1">
            <FlaskConical className="h-3 w-3" />
            Running
          </Badge>
        )}
      </div>

      {/* Side-by-side variant comparison */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Variant A */}
        <Card className={test.winner === "A" ? "ring-2 ring-primary" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                A
              </span>
              Variant A
              {test.winner === "A" && (
                <Badge className="ml-auto gap-1">
                  <Trophy className="h-3 w-3" />
                  Winner
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-md border bg-muted p-4">
              <p className="whitespace-pre-wrap text-sm">{test.postA.content}</p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{test.postA.status}</Badge>
              <Badge variant="outline">{test.postA.mediaType}</Badge>
              {test.postA.publishResults.map((r) => (
                <Badge key={r.platform} variant="secondary">
                  {r.platform}: {r.status}
                </Badge>
              ))}
            </div>

            {insightsA.length > 0 ? (
              <div className="grid grid-cols-5 gap-2">
                <MetricChip label="Impressions" value={totalsA.impressions} />
                <MetricChip label="Reach" value={totalsA.reach} />
                <MetricChip label="Likes" value={totalsA.likes} />
                <MetricChip label="Comments" value={totalsA.comments} />
                <MetricChip label="Shares" value={totalsA.shares} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No engagement data yet. Sync insights from the post page.
              </p>
            )}

            <Link
              href={`/posts/${test.postA.id}/versions`}
              className="text-xs text-muted-foreground underline"
            >
              View post details →
            </Link>
          </CardContent>
        </Card>

        {/* Variant B */}
        <Card className={test.winner === "B" ? "ring-2 ring-primary" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                B
              </span>
              Variant B
              {test.winner === "B" && (
                <Badge className="ml-auto gap-1">
                  <Trophy className="h-3 w-3" />
                  Winner
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-md border bg-muted p-4">
              <p className="whitespace-pre-wrap text-sm">{test.postB.content}</p>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{test.postB.status}</Badge>
              <Badge variant="outline">{test.postB.mediaType}</Badge>
              {test.postB.publishResults.map((r) => (
                <Badge key={r.platform} variant="secondary">
                  {r.platform}: {r.status}
                </Badge>
              ))}
            </div>

            {insightsB.length > 0 ? (
              <div className="grid grid-cols-5 gap-2">
                <MetricChip label="Impressions" value={totalsB.impressions} />
                <MetricChip label="Reach" value={totalsB.reach} />
                <MetricChip label="Likes" value={totalsB.likes} />
                <MetricChip label="Comments" value={totalsB.comments} />
                <MetricChip label="Shares" value={totalsB.shares} />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No engagement data yet. Sync insights from the post page.
              </p>
            )}

            <Link
              href={`/posts/${test.postB.id}/versions`}
              className="text-xs text-muted-foreground underline"
            >
              View post details →
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Comparison summary when both have data */}
      {hasInsights && insightsA.length > 0 && insightsB.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Engagement comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium text-muted-foreground">Metric</th>
                    <th className="py-2 text-right font-medium">Variant A</th>
                    <th className="py-2 text-right font-medium">Variant B</th>
                    <th className="py-2 text-right font-medium text-muted-foreground">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {(["impressions", "reach", "likes", "comments", "shares"] as const).map(
                    (metric) => {
                      const a = totalsA[metric];
                      const b = totalsB[metric];
                      const diff = b - a;
                      return (
                        <tr key={metric} className="border-b last:border-0">
                          <td className="py-2 capitalize text-muted-foreground">{metric}</td>
                          <td className="py-2 text-right">{a.toLocaleString()}</td>
                          <td className="py-2 text-right">{b.toLocaleString()}</td>
                          <td
                            className={`py-2 text-right ${
                              diff > 0
                                ? "text-green-600 dark:text-green-400"
                                : diff < 0
                                ? "text-red-600 dark:text-red-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {diff > 0 ? "+" : ""}
                            {diff.toLocaleString()}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conclude test */}
      {!test.winner && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Conclude test</CardTitle>
          </CardHeader>
          <CardContent>
            <ConcludeTestForm testId={test.id} />
          </CardContent>
        </Card>
      )}

      {/* Winner notes */}
      {test.winner && test.notes && (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Learnings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{test.notes}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Concluded {new Date(test.updatedAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
