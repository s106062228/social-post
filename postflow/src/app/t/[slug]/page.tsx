import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { SubmissionForm } from "./submission-form";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function TestimonialCollectionPage({ params }: PageProps) {
  const { slug } = await params;

  const page = await prisma.testimonialPage.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      welcomeMessage: true,
      thankYouMessage: true,
      isActive: true,
    },
  });

  if (!page || !page.isActive) {
    notFound();
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background p-4 pt-12">
      <div className="w-full max-w-xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">{page.title}</h1>
          {page.welcomeMessage && (
            <p className="text-muted-foreground whitespace-pre-wrap">{page.welcomeMessage}</p>
          )}
        </div>
        <SubmissionForm slug={slug} thankYouMessage={page.thankYouMessage} />
        <p className="text-center text-xs text-muted-foreground">Powered by PostFlow</p>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const page = await prisma.testimonialPage.findUnique({
    where: { slug },
    select: { title: true, welcomeMessage: true },
  });

  if (!page) {
    return { title: "Not Found" };
  }

  return {
    title: page.title,
    description: page.welcomeMessage ?? "Share your experience",
  };
}
