import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Hash } from "lucide-react";
import { DeleteHashtagGroupButton } from "./delete-hashtag-group-button";
import { CreateHashtagGroupForm } from "./create-hashtag-group-form";

export default async function HashtagsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const groups = await prisma.hashtagGroup.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, hashtags: true, createdAt: true },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hashtag Groups</h1>
        <p className="text-muted-foreground">
          Save sets of hashtags and insert them into posts with one click.
        </p>
      </div>

      {/* Create form */}
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>New hashtag group</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateHashtagGroupForm />
        </CardContent>
      </Card>

      {/* Groups list */}
      <Card>
        <CardHeader>
          <CardTitle>
            {groups.length} group{groups.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Hash className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No hashtag groups yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first group above to start inserting hashtags into posts.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{group.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {group.hashtags.join(" ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {group.hashtags.length} hashtag{group.hashtags.length !== 1 ? "s" : ""} ·{" "}
                      {new Date(group.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <DeleteHashtagGroupButton groupId={group.id} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
