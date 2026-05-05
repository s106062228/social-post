-- CreateTable
CREATE TABLE "DraftAutosave" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "firstComment" TEXT,
    "selectedAccountIds" TEXT[],
    "tagIds" TEXT[],
    "platformVariants" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftAutosave_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftAutosave_userId_key" ON "DraftAutosave"("userId");

-- AddForeignKey
ALTER TABLE "DraftAutosave" ADD CONSTRAINT "DraftAutosave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
