import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ShortLinksClient } from "./short-links-client";

export default async function ShortLinksPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const links = await prisma.shortLink.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link2 className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Short Links</h1>
      </div>
      <p className="text-muted-foreground">
        Create short URLs for your social posts and track how many times they&apos;ve been clicked.
      </p>
      <Card>
        <CardContent className="pt-6">
          <ShortLinksClient initialLinks={links} />
        </CardContent>
      </Card>
    </div>
  );
}
