-- AlterTable
ALTER TABLE "Testimonial" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "approved" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "TestimonialPage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "welcomeMessage" TEXT,
    "thankYouMessage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestimonialPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestimonialPage_slug_key" ON "TestimonialPage"("slug");

-- CreateIndex
CREATE INDEX "TestimonialPage_userId_idx" ON "TestimonialPage"("userId");

-- CreateIndex
CREATE INDEX "Testimonial_userId_approved_idx" ON "Testimonial"("userId", "approved");

-- AddForeignKey
ALTER TABLE "TestimonialPage" ADD CONSTRAINT "TestimonialPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
