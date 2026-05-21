-- CreateTable
CREATE TABLE "AiPersona" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "writingStyle" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "audienceDescription" TEXT,
    "exampleContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiPersona_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiPersona_userId_idx" ON "AiPersona"("userId");

-- CreateIndex
CREATE INDEX "AiPersona_userId_createdAt_idx" ON "AiPersona"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AiPersona" ADD CONSTRAINT "AiPersona_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
