# CLAUDE.md — PostFlow 社群排程管理系統

## 專案概述

PostFlow 是一個社群媒體排程自動化管理系統。用戶在網站上透過 OAuth 2.0 連接他們的 Facebook Page、Instagram Business/Creator、Threads 帳號，授權後系統取得 Access Token，可以代替用戶發布、排程、管理貼文。

**MVP 目標**：Meta 三合一（Facebook + Instagram + Threads），一個 Meta Developer App 覆蓋三個平台。

**Current state**: Python CLI tool (`social-post`) in project root. Migrating to Next.js PostFlow in `postflow/` subfolder.

---

## 技術棧

| Layer | 技術 | 理由 |
|-------|------|------|
| Framework | Next.js 15 (App Router) + TypeScript | 全端框架、SSR、API Routes 內建 |
| Database | PostgreSQL + Prisma ORM | 關聯式資料、型別安全、migration |
| Job Queue | BullMQ + Redis | 排程 delayed jobs、retry、concurrency |
| 媒體儲存 | Cloudflare R2 (S3-compatible) | IG 需要公開 URL、cost-effective |
| 影片處理 | FFmpeg | 轉碼到各平台規格 |
| Auth | NextAuth.js v5 | 用戶登入（非 OAuth 社群連接） |
| Styling | Tailwind CSS + shadcn/ui | 快速 UI 開發 |
| Deployment | Docker + Docker Compose | 本地開發和部署一致性 |

---

## 專案結構

```
social_post/                     # Project root
├── CLAUDE.md                    # This file
├── social_post/                 # Legacy Python CLI (keep for reference)
├── postflow/                    # Next.js PostFlow app (migration target)
│   ├── docker-compose.yml       # PostgreSQL + Redis + App
│   ├── .env.example             # 環境變數範本
│   ├── prisma/
│   │   └── schema.prisma        # Database schema
│   ├── src/
│   │   ├── app/                 # Next.js App Router
│   │   │   ├── (auth)/          # 登入/註冊頁面
│   │   │   ├── (dashboard)/     # 主要功能頁面
│   │   │   │   ├── posts/       # 貼文管理
│   │   │   │   ├── calendar/    # 排程日曆
│   │   │   │   ├── accounts/    # 社群帳號連接
│   │   │   │   └── analytics/   # 數據分析
│   │   │   └── api/
│   │   │       ├── auth/        # NextAuth endpoints
│   │   │       ├── oauth/       # Meta OAuth callback
│   │   │       ├── posts/       # 貼文 CRUD API
│   │   │       ├── publish/     # 發布 API
│   │   │       └── webhooks/    # Meta Webhooks
│   │   ├── lib/
│   │   │   ├── platforms/       # 平台 Adapter 層（核心）
│   │   │   │   ├── types.ts     # 統一介面定義
│   │   │   │   ├── facebook.ts  # FB Graph API adapter
│   │   │   │   ├── instagram.ts # IG Graph API adapter
│   │   │   │   ├── threads.ts   # Threads API adapter
│   │   │   │   └── media.ts     # 統一媒體上傳
│   │   │   ├── auth/
│   │   │   │   ├── meta-oauth.ts    # Meta OAuth 2.0 流程
│   │   │   │   └── token-manager.ts # Token 加密儲存 + 自動 refresh
│   │   │   ├── queue/
│   │   │   │   ├── scheduler.ts     # BullMQ 排程邏輯
│   │   │   │   └── workers/
│   │   │   │       ├── publish.ts   # 發布 worker
│   │   │   │       └── refresh.ts   # Token refresh worker
│   │   │   ├── db.ts               # Prisma client
│   │   │   └── encryption.ts       # AES-256-GCM token 加密
│   │   └── components/
│   │       ├── post-composer.tsx    # 貼文編輯器
│   │       ├── platform-selector.tsx# 平台選擇元件
│   │       ├── calendar-view.tsx    # 排程日曆
│   │       └── oauth-connect.tsx    # OAuth 連接按鈕
│   ├── workers/
│   │   └── queue-worker.ts          # 獨立的 BullMQ worker process
│   └── scripts/
│       └── seed.ts                  # 開發用種子資料
```

---

## 核心架構決策

### 1. Platform Adapter Pattern

每個平台實作統一介面，讓排程邏輯與平台 API 細節完全解耦：

```typescript
interface PlatformAdapter {
  publish(post: Post, token: string): Promise<PublishResult>;
  getStatus(publishId: string, token: string): Promise<PostStatus>;
  deletePost(postId: string, token: string): Promise<void>;
  getInsights(postId: string, token: string): Promise<Insights>;
}
```

### 2. Meta OAuth 2.0 流程（三平台共用）

```
用戶點「連接」
  → GET https://www.facebook.com/v21.0/dialog/oauth
      ?client_id={APP_ID}
      &redirect_uri={CALLBACK_URL}
      &scope=pages_manage_posts,pages_read_engagement,pages_show_list,
             instagram_basic,instagram_content_publish,
             threads_basic,threads_content_publish,threads_manage_insights
      &state={CSRF_TOKEN}

後端處理
  1. 驗證 state（CSRF protection）
  2. POST /oauth/access_token 換 short-lived token（1hr）
  3. GET /oauth/access_token?grant_type=fb_exchange_token 換 long-lived token（60天）
  4. GET /me/accounts 取得 Pages 列表
  5. Page token 從 long-lived user token 衍生 → 永不過期
  6. GET /{page-id}?fields=instagram_business_account 取得 IG 帳號 ID
  7. AES-256-GCM 加密所有 tokens 後存入 PostgreSQL
```

### 3. 發文流程差異

**Facebook**：原生 `scheduled_publish_time` 排程
**Instagram**：非同步兩步驟 container → poll → publish（BullMQ delayed job）
**Threads**：類似 IG，base URL `graph.threads.net`（BullMQ delayed job）

### 4. Token 安全

- AES-256-GCM 加密，格式 `{iv}:{authTag}:{ciphertext}`
- 金鑰在 `TOKEN_ENCRYPTION_KEY` 環境變數
- 永不在 client-side 暴露 token

### 5. 排程系統

- Facebook：原生 `scheduled_publish_time`
- Instagram / Threads：BullMQ delayed job
- Worker 獨立 process
- Exponential backoff retry（max 3）

---

## Database Schema

```prisma
enum Platform { FACEBOOK INSTAGRAM THREADS }
enum PostStatus { DRAFT SCHEDULED PUBLISHING PUBLISHED PARTIALLY_PUBLISHED FAILED }
enum MediaType { NONE IMAGE VIDEO CAROUSEL }
enum PublishStatus { PENDING PROCESSING PUBLISHED FAILED }

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  accounts  SocialAccount[]
  posts     Post[]
  createdAt DateTime @default(now())
}

model SocialAccount {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id])
  platform          Platform
  platformAccountId String
  accountName       String
  encryptedToken    String
  tokenExpiresAt    DateTime?
  scopes            String
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  @@unique([userId, platform, platformAccountId])
}

model Post {
  id             String          @id @default(cuid())
  userId         String
  user           User            @relation(fields: [userId], references: [id])
  content        String
  mediaType      MediaType
  mediaUrls      String[]
  status         PostStatus
  scheduledAt    DateTime?
  publishResults PublishResult[]
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
}

model PublishResult {
  id             String        @id @default(cuid())
  postId         String
  post           Post          @relation(fields: [postId], references: [id])
  platform       Platform
  accountId      String
  platformPostId String?
  status         PublishStatus
  error          String?
  publishedUrl   String?
  publishedAt    DateTime?
  retryCount     Int           @default(0)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
}
```

---

## 環境變數

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postflow
REDIS_URL=redis://localhost:6379
NEXTAUTH_SECRET=your-random-secret
NEXTAUTH_URL=http://localhost:3000
META_APP_ID=your-meta-app-id
META_APP_SECRET=your-meta-app-secret
META_OAUTH_CALLBACK_URL=http://localhost:3000/api/oauth/meta/callback
TOKEN_ENCRYPTION_KEY=your-32-byte-hex-key
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=postflow-media
R2_PUBLIC_URL=https://media.your-domain.com
```

---

## 開發規範

- TypeScript strict mode，不要 `any`
- 所有 API routes 用 zod validation + error handling
- 平台 API 呼叫 try-catch + retry logic
- Prisma transaction 確保原子性
- 永不 console.log token
- Token 只在 server-side 解密
- OAuth state 用 crypto.randomBytes

---

## 已知限制

1. **Meta App Review**：Development Mode 只有 App 角色成員能用
2. **IG 媒體需公開 URL**：需先上傳到 R2
3. **Threads API 獨立 base URL**：`graph.threads.net`
4. **API 版本**：用 v21.0
5. **Rate Limits**：FB/IG 200 req/hr/account, Threads 250 posts/24hr, IG 50 posts/24hr

---

## Migration Roadmap (Auto-Development)

The scheduled agent picks the next unchecked `[ ]` item, implements it, commits, and pushes to main.

### Phase 1: Next.js Project Scaffold
- [x] Initialize Next.js 15 with App Router + TypeScript in `postflow/`
- [x] Set up Tailwind CSS + shadcn/ui
- [x] Set up Prisma ORM with PostgreSQL schema
- [x] Create docker-compose.yml (PostgreSQL + Redis)
- [x] Create .env.example with all required vars
- [x] Set up ESLint + TypeScript strict mode

### Phase 2: Auth & Database
- [x] Set up NextAuth.js v5 (email/password or magic link)
- [x] Run Prisma migration for core tables (User, SocialAccount, Post, PublishResult)
- [x] Create Prisma client singleton (`src/lib/db.ts`)
- [x] Implement AES-256-GCM token encryption (`src/lib/encryption.ts`)

### Phase 3: Meta OAuth 2.0 Flow
- [x] Implement OAuth connect route (`/api/oauth/meta/connect`)
- [x] Implement OAuth callback route (`/api/oauth/meta/callback`)
- [x] Token exchange: short-lived → long-lived → page tokens
- [x] Store encrypted tokens in SocialAccount table
- [x] Token refresh logic (`src/lib/auth/token-manager.ts`)

### Phase 4: Platform Adapters
- [x] Define unified PlatformAdapter interface (`src/lib/platforms/types.ts`)
- [x] Implement Facebook adapter (text, image, video, native scheduling)
- [x] Implement Instagram adapter (two-step container + publish)
- [x] Implement Threads adapter (two-step, graph.threads.net base URL)
- [x] Media upload to Cloudflare R2 (`src/lib/platforms/media.ts`)

### Phase 5: Post Management API
- [x] CRUD API routes for posts (`/api/posts`)
- [x] Zod validation for all API inputs
- [x] Publish API route (`/api/publish`)
- [x] Post status tracking (DRAFT → SCHEDULED → PUBLISHING → PUBLISHED)

### Phase 6: BullMQ Scheduling
- [x] Set up BullMQ with Redis connection
- [x] Publish worker (`src/lib/queue/workers/publish.ts`)
- [x] Token refresh worker (`src/lib/queue/workers/refresh.ts`)
- [x] Scheduler logic for delayed jobs (`src/lib/queue/scheduler.ts`)
- [x] Independent worker process (`workers/queue-worker.ts`)
- [x] Retry logic with exponential backoff (max 3 retries)

### Phase 7: Frontend UI
- [x] Dashboard layout with sidebar navigation
- [x] Social accounts page — OAuth connect buttons, account list
- [x] Post composer — text editor, platform selector, media upload
- [x] Calendar view — scheduled posts visualization
- [x] Post list — status, actions (edit, delete, reschedule)

### Phase 8: Polish & Production
- [x] Error handling across all API routes
- [x] Webhook endpoint for Meta status updates
- [x] Analytics/insights page (basic)
- [x] Seed script for development data
- [x] README with setup instructions

### Phase 9: Production Hardening
- [x] Environment variable validation on startup (`src/lib/env.ts`)
- [x] Health check API endpoint (`/api/health`) for Docker/K8s
- [x] GitHub Actions CI workflow (lint + type-check on push)

### Phase 10: Observability & Reliability
- [x] API rate limiting middleware (Redis sliding window, per-user and per-IP)
- [x] Structured logging with pino (replace console.log in server code)
- [x] Database performance indexes (Prisma migration for common query patterns)
- [x] Unit tests for encryption.ts and rate-limit.ts (Jest + ts-jest)
- [x] Automated token expiry cron job (BullMQ repeatable job, daily check)

### Phase 11: Platform Adapter Unit Tests
- [x] Unit tests for Facebook platform adapter (mocked fetch)
- [x] Unit tests for Instagram platform adapter (mocked fetch)
- [x] Unit tests for Threads platform adapter (mocked fetch)
- [x] Extend CI workflow to run jest unit tests on push (no DB/Redis needed)

### Phase 12: API Route Integration Tests
- [x] Integration tests for GET /api/health (mock Prisma, healthy + degraded states)
- [x] Integration tests for GET /api/posts and POST /api/posts (mock auth, Prisma, rate limiter)
- [x] Integration tests for GET/PATCH/DELETE /api/posts/[id] (mock auth, Prisma)

### Phase 13: Remaining Route & Worker Tests
- [x] Integration tests for POST /api/publish (publishing flow, conflict states, partial success)
- [x] Integration tests for GET/POST /api/webhooks/meta (hub challenge, HMAC signature, status updates)
- [x] Integration tests for GET /api/oauth/meta/connect (state generation, redirect URL)
- [x] Unit tests for BullMQ publish worker (mocked adapters, Prisma, queue)
- [x] Unit tests for BullMQ token refresh and token-expiry workers

### Phase 14: End-to-End Tests with Playwright
- [x] Install and configure Playwright in postflow/ (TypeScript, chromium only for CI speed)
- [x] E2E test: unauthenticated redirect (visiting /dashboard redirects to /login)
- [x] E2E test: login flow (fill credentials, submit, land on dashboard)
- [x] E2E test: post composer — create a draft post and verify it appears in post list
- [x] E2E test: accounts page renders connect buttons for FB/IG/Threads
- [x] Add Playwright E2E job to GitHub Actions CI (uses built app, runs headed=false)

### Phase 15: Security Hardening
- [x] Security headers middleware (X-Frame-Options, HSTS, CSP, X-Content-Type-Options, Referrer-Policy) via Next.js middleware
- [x] Server-side input sanitization for post content (strip HTML, control chars, zero-width chars)
- [x] Unit tests for the sanitization utility

### Phase 16: Monitoring & Observability
- [x] Fix TypeScript strict-mode violations in worker test files (Worker cast via unknown)
- [x] Prometheus-compatible `/api/metrics` endpoint (request counts, queue depth, error rates via Redis counters)
- [x] Request-ID tracing middleware (attach unique `x-request-id` to every request/response and log it)
- [x] Unit tests for the metrics module

### Phase 17: User Experience Improvements
- [x] Toast notification system for user actions (post saved, published, deleted, errors)
- [x] Retry button for failed posts (POST /api/posts/[id]/retry endpoint + UI)
- [x] Unit tests for the retry API endpoint

### Phase 18: Advanced Content Management
- [x] Post duplication endpoint (`POST /api/posts/[id]/duplicate`) + duplicate button in UI
- [x] Post keyword search (extend GET /api/posts + posts page search input)
- [x] Unit tests for the duplicate API endpoint

### Phase 19: Content Templates
- [x] Template model in Prisma (id, userId, name, content, mediaType, mediaUrls) + migration
- [x] CRUD API for templates (`GET /api/templates`, `POST /api/templates`, `DELETE /api/templates/[id]`)
- [x] Templates page in dashboard (`/templates`) — list, delete
- [x] "Save as Template" button in posts list (saves post content as a named template)
- [x] Template selector in post composer (load template to pre-fill content)
- [x] Unit tests for the templates API

### Phase 20: Bulk Post Operations
- [x] Bulk delete endpoint (`DELETE /api/posts/bulk`) — accepts array of post IDs, validates ownership, skips PUBLISHING posts
- [x] Posts list client component with checkbox-based bulk selection and "Delete Selected" button
- [x] Unit tests for the bulk delete endpoint

### Phase 21: Recurring Post Schedules
- [x] `RecurringSchedule` model in Prisma (id, userId, name, content, mediaType, mediaUrls, platforms, cronExpr, timezone, isActive, lastRunAt, nextRunAt) + migration
- [x] CRUD API for recurring schedules (`GET /api/schedules`, `POST /api/schedules`, `DELETE /api/schedules/[id]`, `POST /api/schedules/[id]/toggle`)
- [x] BullMQ recurring schedule worker (minutely cron, finds due schedules, creates Posts, dispatches to publish queue)
- [x] Recurring schedules page in dashboard (`/schedules`) — list, toggle active/pause, delete, inline create form
- [x] Add "Schedules" to sidebar navigation
- [x] Unit tests for the recurring schedules API (25 tests)

### Phase 22: User Settings & Preferences
- [x] Extend User model with preferences fields (timezone, emailNotifications) + Prisma migration
- [x] GET/PATCH `/api/settings` endpoint — fetch and update user profile + preferences
- [x] Settings page in dashboard (`/settings`) — profile name, timezone selector, email notifications toggle
- [x] Add "Settings" to sidebar navigation
- [x] Unit tests for the settings API (GET and PATCH)

### Phase 23: Post Activity Log & Audit Trail
- [x] `ActivityLog` model in Prisma (id, userId, action, entityId, entityType, metadata, createdAt) + migration
- [x] Activity logging helper (`src/lib/activity-log.ts`) — fire-and-forget log writer
- [x] Integrate activity logging in post routes (create, update, delete, duplicate, retry, publish)
- [x] GET `/api/activity` endpoint — paginated activity feed for the current user
- [x] Activity feed page in dashboard (`/activity`) — timeline of recent actions
- [x] Add "Activity" to sidebar navigation
- [x] Unit tests for the activity log endpoint

### Phase 24: Email Notifications for Post Events
- [x] Install nodemailer (SMTP email transport)
- [x] Email service (`src/lib/email.ts`) — SMTP transport singleton, HTML templates (published / failed / partially published), fire-and-forget `notifyPostOutcome` respecting user's emailNotifications preference
- [x] Integrate `notifyPostOutcome` into BullMQ publish worker — called after post status is reconciled
- [x] Update `.env.example` with optional SMTP vars (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
- [x] Unit tests for email service (16 tests — template rendering, sendEmail with/without SMTP, notifyPostOutcome for all terminal statuses)

### Phase 25: Analytics API & CSV Export
- [x] Analytics summary API (`GET /api/analytics/summary`) — JSON endpoint: post counts by status, platform publish breakdown, overall success rate, daily activity for last 14 days
- [x] CSV export endpoint (`GET /api/posts/export`) — streams all user posts as a downloadable CSV (id, content, status, mediaType, scheduledAt, createdAt, platforms published to)
- [x] Export button in posts list page — links to `/api/posts/export` with current filters (status, search) passed as query params
- [x] Unit tests for analytics summary API (auth, rate limit, counts shape)
- [x] Unit tests for CSV export API (auth, correct Content-Disposition header, row content)

### Phase 26: In-App Notification Center
- [x] `Notification` model in Prisma (id, userId, type, title, body, read, entityId, entityType, createdAt) + migration
- [x] GET `/api/notifications` + POST `/api/notifications/[id]/read` + POST `/api/notifications/read-all` endpoints
- [x] Notification helper (`src/lib/notifications.ts`) — fire-and-forget createNotification, used by publish worker on terminal post states
- [x] Notification bell icon in dashboard header with unread count badge (client component, polling every 30s)
- [x] Notification dropdown panel with list of recent notifications, mark as read on click
- [x] Unit tests for the notifications API endpoints

### Phase 27: Social Account Management
- [x] DELETE `/api/accounts/[id]` endpoint — soft-disconnect a social account (set isActive=false, log activity)
- [x] POST `/api/accounts/[id]/check` endpoint — verify stored token validity via Graph API `/me` call
- [x] Disconnect button in accounts page UI (client component, confirmation prompt, toast feedback)
- [x] Unit tests for account management endpoints (DELETE and POST /check)

### Phase 28: Media Library & Asset Management
- [x] `MediaAsset` model in Prisma (id, userId, filename, mimeType, size, r2Key, publicUrl, createdAt) + migration
- [x] `GET /api/media` + `POST /api/media` endpoints — list user assets (paginated) and upload a file to R2
- [x] `DELETE /api/media/[id]` endpoint — remove asset from R2 and DB
- [x] Media library page in dashboard (`/media`) — grid view of uploaded assets with upload button, delete, copy-URL actions
- [x] Add "Media" to sidebar navigation
- [x] Unit tests for media API endpoints (GET, POST, DELETE)

### Phase 29: Post Tags & Categorization
- [x] `Tag` model (id, userId, name, color) + `PostTag` join table (postId, tagId) in Prisma + migration
- [x] CRUD API for tags (`GET /api/tags`, `POST /api/tags`, `DELETE /api/tags/[id]`)
- [x] Extend `POST /api/posts` to accept optional `tagIds` array; extend `GET /api/posts` to filter by `?tag=tagId`; include tags in post responses
- [x] `TagSelector` component — multi-select chip input with inline tag creation, integrated into post composer
- [x] Tag filter in posts list page — dropdown to filter posts by tag; tag chips displayed on each post row
- [x] Unit tests for tags API (GET, POST, DELETE — auth, rate limit, CRUD shape)

### Phase 30: Hashtag Groups & Management
- [x] `HashtagGroup` model in Prisma (id, userId, name, hashtags[]) + migration
- [x] CRUD API for hashtag groups (`GET /api/hashtags`, `POST /api/hashtags`, `DELETE /api/hashtags/[id]`)
- [x] Hashtag groups page in dashboard (`/hashtags`) — list, inline create form, delete
- [x] "Insert Hashtags" dropdown in post composer — select a group and append its hashtags to content
- [x] Add "Hashtags" to sidebar navigation
- [x] Unit tests for hashtags API (GET, POST, DELETE — auth, rate limit, CRUD shape)

### Phase 31: Advanced Filtering & Bulk Reschedule
- [x] Date range filter for posts (`GET /api/posts?from=&to=`) — filter by scheduledAt or createdAt within ISO date range
- [x] Platform filter for posts (`GET /api/posts?platform=FACEBOOK`) — filter by publishResults platform
- [x] Bulk reschedule endpoint (`PATCH /api/posts/bulk-reschedule`) — accepts array of SCHEDULED post IDs + shiftMinutes, shifts scheduledAt forward/backward
- [x] Date range pickers and platform filter pills in posts page UI (client-side filter controls)
- [x] Unit tests for the bulk reschedule endpoint (auth, validation, success, partial match)

### Phase 32: Post Preview & Per-Platform Character Counting
- [x] Platform character limits utility (`src/lib/character-limits.ts`) — defines per-platform limits (FB: 63,206, IG: 2,200, Threads: 500), `getCharacterInfo`, `getStrictestLimit`, `isContentOverLimitForAny`
- [x] Per-platform character counter component (`src/components/platform-char-counter.tsx`) — shows count/limit per selected platform with colour indicators (green → yellow at 90% → red over limit)
- [x] Post preview component (`src/components/post-preview.tsx`) — simulated platform-style preview cards for FB/IG/Threads with truncation and hashtag colouring
- [x] Integrate character counter and collapsible post preview into post composer
- [x] Unit tests for character limits utility (limits, remaining, over-limit detection, strictest limit, any-over-limit — 15 tests)

### Phase 33: Optimal Posting Queue
- [x] `PostQueueSlot` model in Prisma (id, userId, label, platform?, hour, minute, daysOfWeek[], isActive) + migration — stores preferred posting time windows per user
- [x] CRUD API for queue slots (`GET /api/queue-slots`, `POST /api/queue-slots`, `DELETE /api/queue-slots/[id]`)
- [x] `findNextAvailableSlot` library (`src/lib/queue-slots.ts`) — finds the next unoccupied slot datetime within 30 days, respecting user timezone and existing SCHEDULED posts
- [x] POST `/api/posts/[id]/queue` endpoint — assigns a DRAFT post to the next available queue slot (sets scheduledAt + status=SCHEDULED)
- [x] Queue management page in dashboard (`/queue`) — list/create/delete time slots, show next 7 upcoming slot previews
- [x] Add "Queue" to sidebar navigation
- [x] "Add to Queue" button in post composer — alternative to manual datetime picker, calls queue endpoint after saving draft
- [x] Unit tests for queue-slots API and post-queue endpoint (auth, validation, slot logic)

### Phase 34: Outgoing Integration Webhooks
- [x] `WebhookConfig` model in Prisma (id, userId, url, events[], secret, isActive, createdAt, updatedAt) + migration
- [x] CRUD API for webhook configs (`GET /api/webhook-configs`, `POST /api/webhook-configs`, `DELETE /api/webhook-configs/[id]`, `PATCH /api/webhook-configs/[id]/toggle`)
- [x] Webhook dispatch helper (`src/lib/webhook-dispatch.ts`) — HMAC-SHA256 signed POST to configured URLs, fire-and-forget
- [x] Integrate webhook dispatch into BullMQ publish worker — fire after post status is reconciled
- [x] Webhook configs page in dashboard (`/webhooks`) — list, add, delete, toggle active/inactive
- [x] Add "Webhooks" to sidebar navigation
- [x] Unit tests for webhook dispatch utility and webhook configs API

### Phase 35: AI-Powered Content Suggestions
- [x] Install `@anthropic-ai/sdk`; add `ANTHROPIC_API_KEY` (optional) to `.env.example` and `src/lib/env.ts`
- [x] AI service (`src/lib/ai.ts`) — `generateContentVariants(topic, tone, platforms)` and `suggestHashtags(content, platforms)` using `claude-haiku-4-5` with prompt caching on system blocks
- [x] `POST /api/ai/suggest` route — auth + rate limit + zod validation, returns `{variants: string[]}`
- [x] `POST /api/ai/hashtags` route — auth + rate limit + zod validation, returns `{hashtags: string[]}`
- [x] "AI Suggest" dialog in post composer — button opens modal with topic/tone inputs, shows 3 content variants to select from
- [x] "Suggest Hashtags" button in post composer — calls `/api/ai/hashtags` with current content, appends suggestions
- [x] Unit tests for AI API routes (auth, rate limit, validation, success, AI disabled, error — 20 tests)

### Phase 36: Post Version History
- [x] `PostVersion` model in Prisma (id, postId, userId, content, mediaType, mediaUrls, createdAt) + migration
- [x] GET `/api/posts/[id]/versions` endpoint — list up to 20 versions for a post (auth + ownership check)
- [x] POST `/api/posts/[id]/versions` endpoint — manually snapshot current post content
- [x] POST `/api/posts/[id]/versions/[versionId]/restore` endpoint — saves current state as new version then restores chosen version
- [x] Auto-snapshot in PATCH `/api/posts/[id]` — saves old content as a version before applying content/media changes
- [x] Version history page (`/posts/[id]/versions`) — timeline of versions with preview and restore buttons
- [x] History button in posts list linking to the version history page
- [x] Unit tests for versions API (GET list, POST snapshot, restore — auth, ownership, conflict states)

### Phase 37: Per-Platform Content Variants
- [x] `PostVariant` model in Prisma (id, postId, platform, content, mediaType, mediaUrls, createdAt, updatedAt) + migration — stores platform-specific content override for a post
- [x] GET `/api/posts/[id]/variants` endpoint — list all variants for a post (auth + ownership check)
- [x] PUT `/api/posts/[id]/variants` endpoint — upsert variants for a post (replaces all, zod-validated)
- [x] Extend publish worker to use variant content when available (falls back to post.content if no variant for platform)
- [x] `PlatformVariants` component (`src/components/platform-variants.tsx`) — tab UI per selected platform with per-platform content/media overrides, integrated into post composer below main content
- [x] Unit tests for variant API endpoints (GET and PUT — auth, ownership, validation, CRUD shape — 12 tests)

### Phase 38: Link Preview & URL Metadata
- [x] OG metadata fetch service (`src/lib/og-preview.ts`) — server-side fetch of og:title, og:description, og:image for a given URL; results cached in Redis for 24 h
- [x] `GET /api/og-preview` endpoint — accepts `?url=` query param, auth + rate limit + URL validation, returns `{title, description, image, url}` or `{}`
- [x] `LinkPreviewCard` component (`src/components/link-preview-card.tsx`) — renders title, description, and thumbnail for a link preview result; shows skeleton while loading
- [x] Integrate link preview into post composer — debounced useEffect extracts first URL from content, fetches preview and displays `LinkPreviewCard` below the textarea
- [x] Unit tests for `GET /api/og-preview` (auth, rate limit, missing/invalid URL, successful fetch with mocked HTML, empty response for non-OG pages — 10 tests)

### Phase 39: iCal Calendar Export & Personal Feed
- [x] `CalendarToken` model in Prisma (id, userId, token unique, createdAt) + migration — enables stateless iCal URL access without session
- [x] iCal generation utility (`src/lib/ical.ts`) — formats SCHEDULED/PUBLISHED posts as RFC 5545 VCALENDAR/VEVENT text
- [x] `GET /api/calendar/export` endpoint — returns `text/calendar` iCal feed; auth via session OR `?token=` query param
- [x] `GET /api/calendar/token` endpoint — generate (if none exists) and return the user's personal subscription token (auth required)
- [x] `DELETE /api/calendar/token` endpoint — revoke and regenerate subscription token (invalidates old feed URL)
- [x] Export/Subscribe UI in calendar page — modal showing subscription URL + one-click copy, download .ics button, regenerate token option
- [x] Unit tests for calendar export and token endpoints (session auth, token auth, invalid token, iCal format, CRUD shape — 12 tests)

### Phase 40: Content Collaboration Notes
- [x] `PostComment` model in Prisma (id, postId, userId, authorName, comment, resolved, createdAt, updatedAt) + migration
- [x] CRUD API for post comments (`GET /api/posts/[id]/comments`, `POST /api/posts/[id]/comments`, `DELETE /api/posts/[id]/comments/[commentId]`, `PATCH /api/posts/[id]/comments/[commentId]/resolve`)
- [x] `PostComments` component (`src/components/post-comments.tsx`) — threaded comment list with add/resolve/delete actions, integrated into the post versions page
- [x] Unit tests for comments API (GET list, POST create, DELETE, PATCH resolve — auth, ownership, validation — 14 tests)

### Phase 41: Post Approval Workflow
- [x] Add `ApprovalStatus` enum (NONE, PENDING, APPROVED, REJECTED) + `approvalStatus` field + `approverNote` field to Post model + Prisma migration
- [x] POST `/api/posts/[id]/request-approval` endpoint — sets approvalStatus=PENDING (only for DRAFT posts), logs activity, creates notification
- [x] POST `/api/posts/[id]/approve` endpoint — sets approvalStatus=APPROVED (only when PENDING), logs activity, creates notification
- [x] POST `/api/posts/[id]/reject` endpoint — sets approvalStatus=REJECTED with optional note (only when PENDING), logs activity, creates notification
- [x] Approval status badge in posts list (PENDING/APPROVED/REJECTED chip) + "Request Approval" button for eligible draft posts
- [x] Approvals page in dashboard (`/approvals`) — lists all posts with PENDING approval status, approve/reject actions with optional rejection note
- [x] Add "Approvals" to sidebar navigation
- [x] Unit tests for approval API endpoints (request-approval, approve, reject — auth, ownership, state validation, note validation — 18 tests)

### Phase 42: Post Engagement Metrics & Insights Sync
- [x] `PostInsights` model in Prisma (id, publishResultId, impressions, reach, likes, comments, shares, syncedAt) + migration — stores per-platform engagement metrics linked to each PublishResult
- [x] `GET /api/posts/[id]/insights` endpoint — returns per-platform insights + aggregate totals for a post (auth + ownership check)
- [x] `POST /api/posts/[id]/sync-insights` endpoint — calls getInsights on each platform adapter for PUBLISHED results, upserts PostInsights records
- [x] BullMQ repeatable job (`sync-insights`) — daily, finds all PUBLISHED posts updated in last 30 days, dispatches sync-insights jobs per post
- [x] Insights panel on the post versions page — shows per-platform engagement cards (impressions, reach, likes, comments, shares) with a "Sync Now" button
- [x] Unit tests for insights API (GET and POST sync — auth, ownership, aggregation shape, adapter mock — 13 tests)
