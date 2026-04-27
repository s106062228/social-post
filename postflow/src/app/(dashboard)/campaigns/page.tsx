import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Megaphone, CalendarRange, Target, ArrowRight } from "lucide-react";
import { CreateCampaignForm } from "./create-campaign-form";
import { DeleteCampaignButton } from "./delete-campaign-button";
import { ToggleCampaignButton } from "./toggle-campaign-button";

export default async function CampaignsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const campaigns = await prisma.campaign.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      goal: true,
      startDate: true,
      endDate: true,
      isActive: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Campaigns</h1>
        <p className="text-muted-foreground">
          Group related posts into campaigns to organise your content strategy.
        </p>
      </div>

      {/* Create form */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New campaign</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateCampaignForm />
        </CardContent>
      </Card>

      {/* Campaign list */}
      <Card>
        <CardHeader>
          <CardTitle>
            {campaigns.length} campaign{campaigns.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Megaphone className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No campaigns yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first campaign above to start organising posts.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {campaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/campaigns/${campaign.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {campaign.name}
                      </Link>
                      <Badge variant={campaign.isActive ? "default" : "secondary"}>
                        {campaign.isActive ? "Active" : "Paused"}
                      </Badge>
                    </div>

                    {campaign.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {campaign.description}
                      </p>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {campaign._count.posts} post{campaign._count.posts !== 1 ? "s" : ""}
                      </span>

                      {campaign.goal && (
                        <span className="flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          {campaign.goal}
                        </span>
                      )}

                      {(campaign.startDate ?? campaign.endDate) && (
                        <span className="flex items-center gap-1">
                          <CalendarRange className="h-3 w-3" />
                          {campaign.startDate
                            ? new Date(campaign.startDate).toLocaleDateString()
                            : "—"}
                          {" → "}
                          {campaign.endDate
                            ? new Date(campaign.endDate).toLocaleDateString()
                            : "ongoing"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <ToggleCampaignButton
                      campaignId={campaign.id}
                      isActive={campaign.isActive}
                    />
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      title="View campaign"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                    <DeleteCampaignButton campaignId={campaign.id} />
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
