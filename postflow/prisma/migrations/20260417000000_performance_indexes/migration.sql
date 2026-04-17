-- Performance indexes for common query patterns

-- SocialAccount: fetch all accounts for a user
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");

-- SocialAccount: token refresh job looks up active accounts with expiring tokens
CREATE INDEX "SocialAccount_isActive_tokenExpiresAt_idx" ON "SocialAccount"("isActive", "tokenExpiresAt");

-- Post: fetch all posts for a user (most common query)
CREATE INDEX "Post_userId_idx" ON "Post"("userId");

-- Post: filter user's posts by status (e.g. SCHEDULED, DRAFT)
CREATE INDEX "Post_userId_status_idx" ON "Post"("userId", "status");

-- Post: list user's posts ordered by newest first
CREATE INDEX "Post_userId_createdAt_idx" ON "Post"("userId", "createdAt" DESC);

-- Post: calendar view looks up posts by scheduled time
CREATE INDEX "Post_scheduledAt_idx" ON "Post"("scheduledAt");

-- Post: worker picks up SCHEDULED posts due for publishing
CREATE INDEX "Post_status_scheduledAt_idx" ON "Post"("status", "scheduledAt");

-- PublishResult: join to get all results for a post (most common)
CREATE INDEX "PublishResult_postId_idx" ON "PublishResult"("postId");

-- PublishResult: filter results by post and status (e.g. PENDING, PROCESSING)
CREATE INDEX "PublishResult_postId_status_idx" ON "PublishResult"("postId", "status");

-- PublishResult: global status filter (e.g. find all FAILED results)
CREATE INDEX "PublishResult_status_idx" ON "PublishResult"("status");
