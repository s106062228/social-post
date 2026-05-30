import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ReviewForm } from "./review-form";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function ExternalReviewPage({ params }: PageProps) {
  const { token } = await params;

  const review = await prisma.externalReview.findUnique({
    where: { token },
    include: {
      post: {
        select: {
          id: true,
          content: true,
          mediaType: true,
          mediaUrls: true,
          status: true,
        },
      },
    },
  });

  if (!review || review.status === "CANCELLED") {
    return notFound();
  }

  // Expired
  if (review.expiresAt && review.expiresAt < new Date()) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-600">Link Expired</h1>
          <p className="mt-2 text-muted-foreground">
            This review link has expired and is no longer valid.
          </p>
        </div>
      </div>
    );
  }

  // Already responded
  if (review.status === "APPROVED" || review.status === "REJECTED") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold">Already Submitted</h1>
          <p className="mt-2 text-muted-foreground">
            Thank you, this review has already been submitted.
          </p>
        </div>
      </div>
    );
  }

  const reviewData = {
    id: review.id,
    reviewerEmail: review.reviewerEmail,
    reviewerName: review.reviewerName,
    message: review.message,
    status: review.status,
    expiresAt: review.expiresAt ? review.expiresAt.toISOString() : null,
    createdAt: review.createdAt.toISOString(),
  };

  const postData = {
    id: review.post.id,
    content: review.post.content,
    mediaType: review.post.mediaType as string,
    mediaUrls: review.post.mediaUrls,
    status: review.post.status as string,
  };

  return (
    <div className="flex min-h-screen items-start justify-center bg-background p-4 pt-12">
      <div className="w-full max-w-xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Review Request</h1>
          {review.message && (
            <p className="mt-2 text-muted-foreground">{review.message}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            From: {review.reviewerEmail}
          </p>
          {review.expiresAt && (
            <p className="mt-1 text-sm text-muted-foreground">
              Expires: {review.expiresAt.toLocaleDateString()}
            </p>
          )}
        </div>
        <ReviewForm token={token} post={postData} review={reviewData} />
      </div>
    </div>
  );
}
