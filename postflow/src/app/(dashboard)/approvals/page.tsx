import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardCheck, FileText } from "lucide-react";
import Link from "next/link";
import { ApprovalActions } from "./approval-actions";

export default async function ApprovalsPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const pendingPosts = await prisma.post.findMany({
    where: { userId, approvalStatus: "PENDING" },
    orderBy: { updatedAt: "desc" },
    include: {
      tags: { include: { tag: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Approval Queue</h1>
          <p className="text-muted-foreground">
            Review and approve posts before they are scheduled or published.
          </p>
        </div>
      </div>

      {pendingPosts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No posts are pending approval.
            </p>
            <p className="text-xs text-muted-foreground">
              Submit a draft post for approval from the{" "}
              <Link href="/posts" className="underline">
                Posts
              </Link>{" "}
              page.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {pendingPosts.length} post{pendingPosts.length !== 1 ? "s" : ""} pending
            review
          </p>

          {pendingPosts.map((post) => (
            <Card key={post.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <CardTitle className="text-base font-normal leading-snug line-clamp-3">
                    {post.content}
                  </CardTitle>
                  <span className="shrink-0 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                    Pending Review
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Created:{" "}
                    {new Date(post.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  {post.mediaType !== "NONE" && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                      {post.mediaType.toLowerCase()}
                    </span>
                  )}
                  {post.tags.map(({ tag }) => (
                    <span
                      key={tag.id}
                      className="rounded-full px-2 py-0.5 font-medium text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-4">
                  <Link
                    href={`/posts/${post.id}/versions`}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    View history
                  </Link>
                  <ApprovalActions postId={post.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
