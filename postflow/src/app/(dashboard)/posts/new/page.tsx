import { PostComposer } from "@/components/post-composer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduledAt?: string }>;
}) {
  const { scheduledAt } = await searchParams;

  return (
    <div className="flex flex-col gap-8 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Post</h1>
        <p className="text-muted-foreground">
          Write your post and choose when to publish it.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Post details</CardTitle>
          <CardDescription>
            Your post will be published to all connected accounts when you click
            &ldquo;Publish now&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PostComposer defaultScheduledAt={scheduledAt} />
        </CardContent>
      </Card>
    </div>
  );
}
