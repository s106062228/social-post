-- CreateTable
CREATE TABLE "CalendarShare" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "platforms" "Platform"[],
    "startDate" TEXT,
    "endDate" TEXT,
    "showContent" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarShare_token_key" ON "CalendarShare"("token");

-- CreateIndex
CREATE INDEX "CalendarShare_userId_idx" ON "CalendarShare"("userId");

-- CreateIndex
CREATE INDEX "CalendarShare_token_idx" ON "CalendarShare"("token");

-- AddForeignKey
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
