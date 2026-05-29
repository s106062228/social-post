import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { ContentRulesClient } from "./content-rules-client";

export default async function ContentRulesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const rules = await prisma.contentRule.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Content Rules</h1>
        <p className="text-muted-foreground mt-1">
          Define posting guardrails — required hashtags, forbidden words, length
          requirements, and more.
        </p>
      </div>
      <ContentRulesClient initialRules={rules} />
    </div>
  );
}
