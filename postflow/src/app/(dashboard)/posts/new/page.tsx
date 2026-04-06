import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { PostComposer } from "@/components/post-composer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduledAt?: string }>;
}) {
  const { scheduledAt } = await searchParams;
  const session = await auth();
  const userId = session!.user!.id;

  const accounts = await prisma.socialAccount.findMany({
    where: { userId, isActive: true },
    select: { id: true, accountName: true, platform: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Post</h1>
        <p className="text-muted-foreground">
          Write your post and choose when to publish it.
        </p>
      </div>

      {accounts.length === 0 ? (
        <Card className="max-w-2xl">
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">
              You have no connected social accounts yet.{" "}
              <Link href="/accounts" className="underline underline-offset-4">
                Connect an account
              </Link>{" "}
              to start publishing posts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Post details</CardTitle>
            <CardDescription>
              Select the accounts to publish to, write your content, and choose
              when to publish.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PostComposer
              defaultScheduledAt={scheduledAt}
              accounts={accounts}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
