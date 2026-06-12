import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Link2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AffiliateLinksClient } from "./affiliate-links-client";

export default async function AffiliateLinksPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const links = await prisma.affiliateLink.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link2 className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Affiliate Links</h1>
      </div>
      <p className="text-muted-foreground">
        Track affiliate links and referral codes used in your posts. Monitor clicks, conversions, and revenue.
      </p>
      <Card>
        <CardContent className="pt-6">
          <AffiliateLinksClient initialLinks={links} />
        </CardContent>
      </Card>
    </div>
  );
}
