import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BioPageLinks } from "./bio-page-client";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function BioPage({ params }: PageProps) {
  const { slug } = await params;

  const page = await prisma.linkBioPage.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      bio: true,
      isPublished: true,
      items: {
        where: { isActive: true },
        orderBy: { order: "asc" },
        select: {
          id: true,
          label: true,
          url: true,
          icon: true,
          clicks: true,
        },
      },
    },
  });

  if (!page || !page.isPublished) {
    notFound();
  }

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-16">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-3xl font-bold text-primary">
              {page.title.charAt(0).toUpperCase()}
            </span>
          </div>
          <h1 className="text-2xl font-bold">{page.title}</h1>
          {page.bio && (
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              {page.bio}
            </p>
          )}
        </div>

        {/* Links */}
        {page.items.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm">
            No links available yet.
          </p>
        ) : (
          <BioPageLinks slug={slug} items={page.items} />
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground">
          Powered by PostFlow
        </p>
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const page = await prisma.linkBioPage.findUnique({
    where: { slug },
    select: { title: true, bio: true },
  });

  if (!page) return {};

  return {
    title: page.title,
    description: page.bio ?? `${page.title} — Link in Bio`,
    openGraph: {
      title: page.title,
      description: page.bio ?? undefined,
    },
  };
}
