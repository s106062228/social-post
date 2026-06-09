import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { SequencesClient } from "./sequences-client";

export default async function SequencesPage() {
  const session = await auth();
  const userId = session!.user!.id;

  const sequences = await prisma.postSequence.findMany({
    where: { userId },
    include: {
      steps: { orderBy: { stepOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-8">
      <SequencesClient initialSequences={sequences as Parameters<typeof SequencesClient>[0]["initialSequences"]} />
    </div>
  );
}
