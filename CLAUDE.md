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

### Phase 43: Public Post Preview Sharing
- [x] `ShareLink` model in Prisma (id, postId, userId, token unique, expiresAt?, views, createdAt) + migration — token-gated public access to post preview
- [x] POST `/api/posts/[id]/share` endpoint — create or return existing share link (auth required, idempotent)
- [x] DELETE `/api/posts/[id]/share` endpoint — revoke share link (auth required)
- [x] GET `/api/share/[token]` public endpoint — return sanitized post data (content, media, platform info, no user PII) for valid non-expired tokens; increment view count
- [x] Public preview page (`/share/[token]`) — renders post preview using PostPreview component; shows view count and expiry; no login required
- [x] Share button in posts list — client component with copy-to-clipboard share URL and revoke option, toast feedback
- [x] Unit tests for share API endpoints (POST create, DELETE revoke, GET public — auth, token validation, expiry, view count — 16 tests)

### Phase 44: Post Series & Campaigns
- [x] `Campaign` model in Prisma (id, userId, name, description?, goal?, startDate?, endDate?, isActive, createdAt, updatedAt) + `CampaignPost` join table (campaignId, postId, addedAt) + migration
- [x] CRUD API for campaigns (`GET /api/campaigns`, `POST /api/campaigns`, `GET /api/campaigns/[id]`, `PATCH /api/campaigns/[id]`, `DELETE /api/campaigns/[id]`)
- [x] Post membership API (`POST /api/campaigns/[id]/posts` to add a post, `DELETE /api/campaigns/[id]/posts/[postId]` to remove)
- [x] Campaigns list page in dashboard (`/campaigns`) — card grid with campaign name, description, post count, date range, active toggle, delete
- [x] Campaign detail page (`/campaigns/[id]`) — list posts in campaign with remove button, "Add Post" selector to attach existing posts
- [x] Add "Campaigns" to sidebar navigation
- [x] Unit tests for campaigns API (GET list, POST create, PATCH, DELETE, add/remove post — auth, ownership, validation — 16 tests)

### Phase 45: RSS Feed Integration & Content Import
- [x] `RssFeed` model in Prisma (id, userId, name, url, autoCreate, lastFetchedAt, createdAt, updatedAt) + `RssItem` model (id, feedId, guid, title, content, link, imageUrl, publishedAt, postId?, importedAt) + migration
- [x] RSS parsing service (`src/lib/rss.ts`) — server-side fetch of RSS 2.0 and Atom feeds; normalise items to {guid, title, content, link, imageUrl, publishedAt}
- [x] CRUD API for RSS feeds (`GET /api/rss-feeds`, `POST /api/rss-feeds`, `DELETE /api/rss-feeds/[id]`) + manual fetch endpoint (`POST /api/rss-feeds/[id]/fetch`) — auth + rate limit + zod validation
- [x] BullMQ RSS import worker (`src/lib/queue/workers/rss-import.ts`) — hourly cron, fetches all feeds, creates RssItem records, optionally creates DRAFT posts for new items when autoCreate=true
- [x] RSS feeds management page in dashboard (`/rss-feeds`) — list feeds, add form (name + URL + autoCreate toggle), delete button, manual "Fetch Now" button, show count of imported items
- [x] Add "RSS Feeds" to sidebar navigation
- [x] Unit tests for RSS feeds API (GET, POST, DELETE, fetch — auth, rate limit, validation, CRUD shape — 25 tests)

### Phase 46: Team Workspaces & Role-Based Access Control
- [x] `Team` model + `TeamMember` model (roles: OWNER, ADMIN, EDITOR, VIEWER) + `TeamInvite` model in Prisma + migration
- [x] Team CRUD API (`GET /api/teams`, `POST /api/teams`, `GET /api/teams/[id]`, `PATCH /api/teams/[id]`, `DELETE /api/teams/[id]`)
- [x] Team members API (`GET /api/teams/[id]/members`, `PATCH /api/teams/[id]/members/[userId]` role update, `DELETE /api/teams/[id]/members/[userId]` remove/leave)
- [x] Team invite API (`POST /api/teams/[id]/invite` creates invite link, `POST /api/teams/accept-invite` accepts via token)
- [x] Teams management page in dashboard (`/teams`) — list teams, create team, show member count and role
- [x] Team detail page (`/teams/[id]`) — member list with roles, invite form, leave/delete options
- [x] Add "Teams" to sidebar navigation
- [x] Unit tests for team management API (auth, ownership, role validation — 20 tests)

### Phase 47: API Key Management
- [x] `ApiKey` model in Prisma (id, userId, name, keyHash, prefix, lastUsedAt, expiresAt?, createdAt) + migration — stores hashed personal API keys, never the raw value
- [x] CRUD API for API keys (`GET /api/api-keys`, `POST /api/api-keys`, `DELETE /api/api-keys/[id]`) — create returns raw key once only; list/delete only expose prefix
- [x] API keys management page in dashboard (`/api-keys`) — list keys with prefix + creation/usage dates, create dialog (shows full key once with copy button), revoke with confirmation
- [x] Add "API Keys" to sidebar navigation
- [x] Unit tests for API keys API (GET list, POST create, DELETE revoke — auth, rate limit, max-keys limit, ownership, validation — 18 tests)

### Phase 48: Two-Factor Authentication (TOTP)
- [x] Add `totpSecret` (nullable encrypted), `totpEnabled` (bool), `totpBackupCodes` (string[]) to User model + Prisma migration
- [x] Install `otpauth` + `qrcode` packages; TOTP utility (`src/lib/totp.ts`) — generate secret, QR code data URL, verify code, backup code generation/hashing, HMAC challenge token
- [x] Extend `src/auth.ts` — store `totpEnabled`/`totpVerified` in JWT; `authorized` callback redirects to `/2fa` when TOTP pending; JWT `update` trigger verifies HMAC challenge token before promoting `totpVerified=true`
- [x] `GET /api/auth/2fa/setup` + `POST /api/auth/2fa/enable` + `POST /api/auth/2fa/disable` + `POST /api/auth/2fa/challenge` + `POST /api/auth/2fa/backup-codes` endpoints
- [x] `/2fa` challenge page — TOTP or backup-code input, calls challenge endpoint then `session.update()` to promote JWT
- [x] 2FA section in settings page — show status, enable (QR setup flow + backup codes display), disable with confirmation
- [x] Unit tests for all 2FA API endpoints (auth, state validation, valid/invalid codes, backup code consumption — 28 tests)

### Phase 49: Password Reset Flow
- [x] `PasswordResetToken` model in Prisma (id, userId, tokenHash unique, expiresAt, createdAt) + migration
- [x] `POST /api/auth/reset-password/request` endpoint — find user by email, generate random token, hash + store, send reset email (fire-and-forget, always returns 200 to avoid email enumeration)
- [x] `POST /api/auth/reset-password/confirm` endpoint — validate tokenHash + expiry, update user password hash, delete all reset tokens for that user
- [x] `/forgot-password` page — email input form, calls request endpoint, shows confirmation message
- [x] `/reset-password/[token]` page — new password + confirm input form, calls confirm endpoint, redirects to login on success
- [x] "Forgot password?" link on login page
- [x] Unit tests for both endpoints (valid flow, expired token, unknown token, invalid body — 14 tests)

### Phase 50: Scheduled Analytics Reports
- [x] `ReportSchedule` model in Prisma (id, userId, frequency: DAILY/WEEKLY/MONTHLY, recipientEmail, isActive, lastSentAt, nextSendAt, createdAt, updatedAt) + migration
- [x] CRUD API for report schedules (`GET /api/report-schedules`, `POST /api/report-schedules`, `DELETE /api/report-schedules/[id]`, `PATCH /api/report-schedules/[id]/toggle`)
- [x] BullMQ report worker (`src/lib/queue/workers/report.ts`) — daily cron, finds due schedules, computes analytics summary, sends styled HTML email report
- [x] Reports page in dashboard (`/reports`) — list schedules, inline create form (frequency + recipient email), toggle active/pause, delete
- [x] Add "Reports" to sidebar navigation
- [x] Unit tests for report schedules API (GET, POST, DELETE, toggle — auth, rate limit, validation, CRUD shape — 20 tests)

### Phase 51: Advanced Analytics Dashboard with Interactive Charts
- [x] Install `recharts` package for data visualization
- [x] Create `GET /api/analytics/dashboard` endpoint — accepts `?period=7d|30d|90d`, returns time-series daily post counts, platform publish distribution, hourly posting heatmap, top-level KPIs
- [x] Replace static analytics page with interactive client-side dashboard — Recharts line chart (posts over time), pie chart (platform distribution), bar chart (hourly activity), period selector (7d/30d/90d)
- [x] Unit tests for the analytics dashboard API endpoint (auth, rate limit, period validation, shape — 10 tests)

### Phase 52: Dark Mode & Theme Support
- [x] Install `next-themes` package; add `ThemeProvider` to root layout with `attribute="class"` and `enableSystem`
- [x] Update `globals.css` — switch dark mode trigger from `@media (prefers-color-scheme: dark)` to `.dark` class; add `@custom-variant dark` for Tailwind v4 `dark:` utilities
- [x] `ThemeToggle` component (`src/components/theme-toggle.tsx`) — icon button cycling light/dark/system, placed in sidebar footer
- [x] Fix hardcoded `bg-white` in sidebar and dashboard header to use semantic `bg-card`/`bg-background` tokens
- [x] Add `theme` field (`String @default("system")`) to User model in Prisma schema + migration
- [x] Extend `GET/PATCH /api/settings` to expose and accept `theme` field; extend `SettingsForm` to show a three-way theme selector (Light / Dark / System) that calls `setTheme()` and saves to DB
- [x] Unit tests for theme field in settings API (GET returns theme, PATCH accepts valid theme, rejects invalid theme — 6 tests)

### Phase 53: Post Import from CSV & Bulk Scheduling
- [x] `ImportBatch` model in Prisma (id, userId, filename, totalRows, successRows, failedRows, errors Json, status: ImportStatus, createdAt) + migration
- [x] `POST /api/posts/import` endpoint — accepts multipart CSV upload (content, scheduledAt, platforms, mediaType, mediaUrls columns), creates posts in bulk (max 100 rows), returns per-row validation results; `GET /api/posts/import` returns list of past batches
- [x] Import page in dashboard (`/import`) — drag-and-drop CSV file upload with column format guide, shows import summary (success count, failed rows with reason), import history timeline
- [x] Add "Import" to sidebar navigation
- [x] Unit tests for the import API (auth, rate limit, max-rows, file validation, full success, partial success, all-invalid — 16 tests)

### Phase 54: Global Command Palette & Keyboard Shortcuts
- [x] `CommandPalette` component (`src/components/command-palette.tsx`) — CMD+K / Ctrl+K opens a modal search/action palette using shadcn/ui `Command` component; supports navigation to any page, quick actions (new post, new template, new campaign)
- [x] Keyboard shortcut registry (`src/lib/shortcuts.ts`) — defines app-wide shortcut map, `useKeyboardShortcut` hook for components to register shortcuts
- [x] Global shortcut listener in dashboard layout — registers CMD+K for palette, `n` for new post, `?` for shortcut help overlay
- [x] Shortcut help overlay (`src/components/shortcut-help.tsx`) — modal listing all available keyboard shortcuts, triggered by `?` key
- [x] Unit tests for keyboard shortcut hook (registration, deregistration, modifier keys — 10 tests)

### Phase 55: Global Search
- [x] `GET /api/search` endpoint — auth + rate limit + `?q=` param (min 2 chars); searches posts (content), templates (name/content), campaigns (name/description), tags (name), hashtag groups (name); returns up to 5 results per category with type + id + label fields
- [x] Extend command palette to live-search content — debounce 300 ms, call `/api/search` when query ≥ 2 chars, show results as a "Content" group below navigation commands with loading state
- [x] Search results page in dashboard (`/search`) — tabbed results view (All / Posts / Templates / Campaigns / Tags) with links to respective pages
- [x] Add "Search" to sidebar navigation; add keyboard shortcut `/` to focus search from anywhere in dashboard
- [x] Unit tests for the search API (auth, rate limit, short query, empty results, mixed results — 10 tests)

### Phase 56: User Onboarding & Progress Checklist
- [x] Add `onboardingDismissed` (bool, default false) to User model + Prisma migration
- [x] `GET /api/onboarding/status` endpoint — dynamic checklist computed from DB: account connected, first post created, post published, queue slot configured; returns `{steps, allComplete, dismissed}`
- [x] `POST /api/onboarding/dismiss` endpoint — sets onboardingDismissed=true for current user
- [x] `OnboardingChecklist` component (`src/components/onboarding-checklist.tsx`) — collapsible card listing steps with checkmarks and a dismiss button
- [x] Integrate onboarding checklist into dashboard home page — visible when not dismissed and not all steps complete
- [x] Unit tests for onboarding API (auth, steps shape, dismissed state, all-complete — 10 tests)

### Phase 57: Webhook Event Delivery Log
- [x] `WebhookDelivery` model in Prisma (id, configId, event, statusCode?, success, durationMs, attemptedAt) + migration — persists every outgoing webhook dispatch attempt
- [x] Update `webhook-dispatch.ts` to record a `WebhookDelivery` row after each attempt (status code, success flag, elapsed ms)
- [x] `GET /api/webhook-configs/[id]/deliveries` endpoint — auth + ownership check, returns last 50 delivery records for that config
- [x] Delivery log panel in webhooks page — expandable per-webhook section showing recent deliveries with status badge, HTTP code, event name, and timestamp
- [x] Unit tests for the deliveries endpoint (auth, not-found, success shape — 8 tests)

### Phase 58: Post Pinning & Starring
- [x] Add `starred` (bool, default false) to Post model + Prisma migration
- [x] `PATCH /api/posts/[id]/star` endpoint — toggle starred status, return `{starred: boolean}`
- [x] Extend `GET /api/posts` to support `?starred=true` filter
- [x] `StarPostButton` client component — star/unstar icon toggle with optimistic UI, integrated into posts list row
- [x] "Starred" filter tab in posts list page
- [x] Unit tests for the star endpoint (auth, ownership, not-found, toggle on, toggle off — 8 tests)

### Phase 59: Post Recycling & Evergreen Content Queue
- [x] Add `isEvergreen` (bool, default false) to Post model + Prisma migration
- [x] `PATCH /api/posts/[id]/evergreen` endpoint — toggle isEvergreen status, return `{isEvergreen: boolean}`
- [x] `POST /api/posts/[id]/recycle` endpoint — creates a new DRAFT post copying content/media from a PUBLISHED post; accepts optional `scheduledAt` body field; logs activity; returns new post
- [x] Extend `GET /api/posts` to support `?evergreen=true` filter
- [x] `EvergreenButton` client component (`src/app/(dashboard)/posts/evergreen-button.tsx`) — toggle icon with optimistic UI, integrated into posts list row
- [x] `RecyclePostButton` client component (`src/app/(dashboard)/posts/recycle-post-button.tsx`) — recycle icon button for PUBLISHED posts, calls recycle endpoint, toasts, refreshes
- [x] "Evergreen" filter tab in posts list page alongside existing status tabs
- [x] Unit tests for evergreen toggle and recycle endpoints (16 tests)

### Phase 60: Saved Filter Presets
- [x] `FilterPreset` model in Prisma (id, userId, name, filters Json, createdAt) + migration — persists named filter combinations for the posts page
- [x] CRUD API for filter presets (`GET /api/filter-presets`, `POST /api/filter-presets`, `DELETE /api/filter-presets/[id]`) — auth + rate limit + zod validation
- [x] "Save Filter" button in posts page — opens name dialog, saves current filter state (status, platform, tag, search, starred, evergreen, from, to) as a preset
- [x] Filter preset dropdown in posts page — lists saved presets; applying one pushes all filter values into the URL
- [x] Unit tests for filter presets API (auth, rate limit, validation, CRUD shape — 14 tests)

### Phase 61: Post Scheduling Reminders
- [x] Add `reminderMinutes` (nullable Int) to Post model + Prisma migration — stores how many minutes before scheduledAt to fire the reminder
- [x] BullMQ reminder worker (`src/lib/queue/workers/reminder.ts`) — processes delayed reminder jobs; skips if post is no longer SCHEDULED; sends in-app notification via `createNotification`
- [x] `scheduleReminder` / `cancelReminder` functions in scheduler.ts — enqueue/remove a delayed BullMQ job keyed `reminder:{postId}`
- [x] `PATCH /api/posts/[id]/reminder` endpoint — auth + rate limit + zod validation; persists `reminderMinutes`; schedules/cancels BullMQ job when post is already SCHEDULED
- [x] Integrate reminder scheduling into `POST /api/posts` (accepts optional `reminderMinutes`; schedules job when new post is SCHEDULED) and `PATCH /api/posts/[id]` (reschedules when `scheduledAt` changes)
- [x] Reminder selector UI in post composer — `Bell` icon + native `<select>` (None / 30 min / 1 hr / 3 hr / 1 day); shown only when a scheduled time is set; submitted with post creation body
- [x] Register reminder worker in `workers/queue-worker.ts`; include in graceful shutdown
- [x] Unit tests for reminder endpoint (auth, rate limit, validation, DRAFT no-op, SCHEDULED schedule, clear+cancel — 13 tests)

### Phase 62: Post Performance Leaderboard & Content Scoring
- [x] Content score utility (`src/lib/content-score.ts`) — weighted engagement score from PostInsights (formula: reach×1 + likes×3 + comments×5 + shares×4 + impressions×0.5); export `computeScore(insights)` and `scoreLabel(score)`
- [x] `GET /api/analytics/leaderboard` endpoint — auth + rate limit + `?limit=20&period=7d|30d|90d|all`; returns top posts ranked by aggregate ContentScore with post content preview, platform breakdown, and total metrics
- [x] Leaderboard page in dashboard (`/leaderboard`) — ranked list of top posts with score bar, platform icons, engagement breakdown chips, period selector
- [x] Score badge in posts list row — small coloured pill showing the post's aggregate score when insights data exists
- [x] Add "Leaderboard" to sidebar navigation
- [x] Unit tests for content score utility and leaderboard API (score calculation, auth, rate limit, period filter, shape — 12 tests)

### Phase 63: Best Time to Post Recommendations
- [x] `GET /api/analytics/best-times` endpoint — auth + rate limit + `?platform=`; analyses historical PostInsights joined to PublishResult publishedAt timestamps; groups by hour-of-day and day-of-week; returns ranked slots (hour, dayOfWeek, avgEngagement, sampleSize) per platform
- [x] `BestTimesCard` component (`src/components/best-times-card.tsx`) — heatmap-style grid (7 days × 24 h) with colour intensity from engagement score; platform tab selector; "No data yet" empty state
- [x] Integrate `BestTimesCard` into the analytics dashboard page below the existing charts
- [x] Unit tests for best-times endpoint (auth, rate limit, platform filter, empty state, aggregation shape — 10 tests)

### Phase 64: Post Sentiment Analysis
- [x] Sentiment analysis utility (`src/lib/sentiment.ts`) — calls Claude AI (`claude-haiku-4-5`) to classify post content as POSITIVE/NEUTRAL/NEGATIVE with confidence score; uses prompt caching on system block
- [x] Add `sentiment` (nullable String) + `sentimentScore` (nullable Float) to Post model + Prisma migration (`20260505000000_add_post_sentiment`)
- [x] `POST /api/posts/[id]/analyze-sentiment` endpoint — auth + rate limit + ownership check; calls AI service, persists result; returns `{sentiment, sentimentScore}`; returns 503 when AI not enabled
- [x] Extend `GET /api/posts` to support `?sentiment=POSITIVE|NEUTRAL|NEGATIVE` filter
- [x] `SentimentBadge` component in posts list row — coloured chip (green/grey/red) showing detected sentiment
- [x] `AnalyzeSentimentButton` component in posts list row — calls analyze endpoint, toasts result, refreshes
- [x] Sentiment filter tabs in posts page (Positive / Neutral / Negative) alongside existing status/starred/evergreen tabs
- [x] Unit tests for analyze-sentiment endpoint (auth, rate limit, AI disabled, ownership, POSITIVE/NEUTRAL/NEGATIVE, error — 10 tests)

### Phase 65: Post A/B Testing
- [x] `PostABTest` model in Prisma (id, userId, name, postAId, postBId, winner?, notes?, createdAt, updatedAt) + migration — links two posts as A/B variants for performance comparison
- [x] CRUD API for A/B tests (`GET /api/ab-tests`, `POST /api/ab-tests`, `GET /api/ab-tests/[id]`, `DELETE /api/ab-tests/[id]`, `PATCH /api/ab-tests/[id]/conclude`) — auth + rate limit + zod validation; conclude sets winner (A/B/INCONCLUSIVE) and optional notes
- [x] A/B tests list page in dashboard (`/ab-tests`) — card grid of tests with variant post previews, winner badge, create form (name + select two posts)
- [x] A/B test detail page (`/ab-tests/[id]`) — side-by-side variant comparison with engagement metrics for each post (impressions, reach, likes, comments, shares), conclude test action
- [x] Add "A/B Tests" to sidebar navigation
- [x] Unit tests for A/B tests API (GET list, POST create, GET detail, DELETE, conclude — auth, rate limit, ownership, validation — 16 tests)

### Phase 66: First Comment Scheduling
- [x] Add `firstComment` (nullable String) to Post model + Prisma migration (`20260507000000_add_post_first_comment`)
- [x] Add optional `addComment(platformPostId, comment, token)` to `PlatformAdapter` interface; implement for Facebook (`/{postId}/comments`) and Instagram (`/{mediaId}/comments`); Threads adapter has no `addComment` (unsupported)
- [x] Extend publish worker — after a successful `PUBLISHED` result, call `adapter.addComment` if `post.firstComment` is set and `adapter.addComment` is defined; failures are logged as warnings but do not fail the publish job
- [x] Extend `POST /api/posts` and `PATCH /api/posts/[id]` to accept optional `firstComment` field (max 2200 chars, nullable)
- [x] First comment textarea in post composer — shown below main content when Facebook or Instagram accounts are selected; character counter (max 2200); label "First Comment (optional)"
- [x] Unit tests for first comment (worker integration, adapter mocks, API validation — 13 tests)

### Phase 67: Automated Performance Alerts
- [x] `PerformanceAlert` model in Prisma (id, userId, name, metric: AlertMetric, operator: AlertOperator, threshold Float, platform?, period String default "7d", isActive, lastTriggeredAt?, createdAt, updatedAt) + `AlertMetric` enum (IMPRESSIONS, REACH, LIKES, COMMENTS, SHARES, SCORE) + `AlertOperator` enum (ABOVE, BELOW) + migration (`20260508000000_add_performance_alert`)
- [x] CRUD API for performance alerts (`GET /api/performance-alerts`, `POST /api/performance-alerts`, `DELETE /api/performance-alerts/[id]`, `PATCH /api/performance-alerts/[id]/toggle`) — auth + rate limit + zod validation; max 20 alerts per user
- [x] BullMQ performance alert worker (`src/lib/queue/workers/performance-alert.ts`) — daily cron at 04:00 UTC; for each active alert aggregates PostInsights over the period, compares avg metric to threshold, fires in-app notification + updates lastTriggeredAt when condition met
- [x] Add `PERFORMANCE_ALERT_SCAN` to queue connection names; add `schedulePerformanceAlertScan()` to scheduler.ts; register worker + cron in `workers/queue-worker.ts`
- [x] Performance alerts page in dashboard (`/performance-alerts`) — table of alerts with metric/operator/threshold/platform/period/status, inline create form, toggle active/inactive, delete
- [x] Add "Alerts" to sidebar navigation
- [x] Unit tests for performance alerts API (GET list, POST create, DELETE, toggle — auth, rate limit, max-alerts limit, ownership, validation — 14 tests)

### Phase 68: Word Cloud & Content Pattern Analysis
- [x] Word frequency analysis utility (`src/lib/word-frequency.ts`) — counts word occurrences in post content, filters English stop words, returns sorted `{text, count}` pairs
- [x] `GET /api/analytics/word-cloud` endpoint — auth + rate limit + `?period=7d|30d|90d`; aggregates word frequency across user's PUBLISHED posts in the period; returns top 50 words
- [x] `WordCloudCard` component (`src/components/word-cloud-card.tsx`) — tag-cloud visualization with font-size proportional to frequency, period selector, "No posts yet" empty state
- [x] Integrate `WordCloudCard` into the analytics dashboard page below the best-times heatmap
- [x] Unit tests for word frequency utility and word-cloud endpoint (stop word filtering, frequency count, auth, rate limit, period filter, shape — 12 tests)

### Phase 69: Posting Consistency Score & Content Gap Analysis
- [x] Consistency score utility (`src/lib/consistency.ts`) — computes a 0-100 score from posting history, current streak (consecutive weeks with ≥1 post), average posts per week, and content gaps (periods ≥7 days with no posts)
- [x] `GET /api/analytics/consistency` endpoint — auth + rate limit + `?period=30d|90d|180d`; returns `{score, streak, avgPostsPerWeek, gaps, periodDays, totalPosts}`
- [x] `ConsistencyCard` component (`src/components/consistency-card.tsx`) — shows consistency score as a colour-coded progress bar, streak badge, avg posts/week, and a list of content gap warnings; period selector
- [x] Integrate `ConsistencyCard` into the analytics dashboard page below the word cloud
- [x] Unit tests for consistency utility (score edges, streak calculation, gap detection — 10 tests) and API endpoint (auth, rate limit, period validation, shape — 8 tests)

### Phase 70: Post Readability & Content Quality Score
- [x] Readability score utility (`src/lib/readability.ts`) — Flesch-Kincaid reading ease and grade level, word count, sentence count, average sentence length, estimated reading time; exports `analyzeReadability(content)` and `readabilityLabel(score)`
- [x] `GET /api/posts/[id]/readability` endpoint — auth + rate limit + ownership check; returns `{fleschKincaid, gradeLevel, wordCount, sentenceCount, avgWordsPerSentence, readingTimeSeconds, label}`
- [x] `ReadabilityIndicator` component (`src/components/readability-indicator.tsx`) — compact real-time readability badge (Easy/Medium/Hard/Very Hard) with tooltip showing word count, reading time, and FK score; integrated below the content textarea in post composer
- [x] Unit tests for readability utility (FK score calculation, grade level, word/sentence counts, edge cases — 10 tests) and API endpoint (auth, rate limit, ownership, response shape — 8 tests)

### Phase 71: Content Duplicate Detection & Similarity Analysis
- [x] Content similarity utility (`src/lib/similarity.ts`) — tokenizes text into word n-grams, computes Jaccard similarity coefficient between two strings; exports `computeSimilarity(a, b): number` (0–1 range) and `tokenize(text): Set<string>`
- [x] `POST /api/posts/check-duplicates` endpoint — auth + rate limit; accepts `{content, excludeId?}` body; computes similarity against the user's last 100 posts (excluding optional excludeId); returns top 5 similar posts with scores ≥ 0.4 threshold, sorted by score desc
- [x] `DuplicateWarning` component (`src/components/duplicate-warning.tsx`) — collapsible alert card showing similar posts with similarity % badge and link to original post; integrated into post composer with 600 ms debounce on content changes; hidden when no matches or content < 20 chars
- [x] Unit tests for similarity utility and duplicate check API (tokenization, Jaccard calculation, threshold filtering, auth, rate limit, ownership, empty result, matches — 12 tests)

### Phase 72: AI-Powered Content Repurposing
- [x] Add `repurposeContent(content, targetPlatforms)` to `src/lib/ai.ts` — calls Claude AI (`claude-haiku-4-5`) to rewrite content adapted to each target platform's style and character limits; uses prompt caching on system block; returns `{platform, content}[]`
- [x] `POST /api/posts/[id]/repurpose` endpoint — auth + rate limit + AI check + ownership; accepts optional `targetPlatforms` array (defaults to all three platforms); calls `repurposeContent`; returns `{variants: {platform, content}[]}`
- [x] `RepurposeDialog` component (`src/components/repurpose-dialog.tsx`) — modal with per-platform repurposed content preview showing character count vs limit, per-variant copy-to-clipboard and "Apply as Variant" button calling PUT `/api/posts/[id]/variants`, regenerate option
- [x] Repurpose button (wand icon) integrated into `PostsListClient` via `RepurposeDialog` — available on every post row
- [x] Unit tests for repurpose endpoint (auth, rate limit, AI disabled, not-found, ownership, all-platforms default, specific platforms, invalid platform, unexpected error — 9 tests)

### Phase 73: AI-Powered Scheduling Advisor
- [x] Add `generateScheduleAdvice(history, insights)` to `src/lib/ai.ts` — accepts posting history summary + engagement insights; calls Claude AI (`claude-haiku-4-5`) with prompt caching on system block; returns `{recommendations: {insight: string, action: string, priority: "high"|"medium"|"low"}[]}`
- [x] `POST /api/ai/schedule-advice` endpoint — auth + rate limit + zod validation; queries user's recent PostInsights and posting activity; calls `generateScheduleAdvice`; returns `{recommendations}` or 503 when AI not configured
- [x] `SchedulingAdvisorCard` component (`src/components/scheduling-advisor-card.tsx`) — client component showing AI recommendations as priority-badged cards with a refresh button and loading/empty state
- [x] Integrate `SchedulingAdvisorCard` into the analytics dashboard page below the consistency card
- [x] Unit tests for `POST /api/ai/schedule-advice` (auth, rate limit, AI disabled, success shape, empty history, error fallback — 8 tests)

### Phase 74: UTM Parameter Manager & Auto-Tagging
- [x] `UtmPreset` model in Prisma (id, userId, name, source, medium, campaign?, content?, term?, isDefault, createdAt) + migration — saved UTM parameter templates per user
- [x] CRUD API for UTM presets (`GET /api/utm-presets`, `POST /api/utm-presets`, `DELETE /api/utm-presets/[id]`, `PATCH /api/utm-presets/[id]/set-default`) — auth + rate limit + zod validation; max 20 presets per user
- [x] UTM tag utility (`src/lib/utm.ts`) — `appendUtmParams(url, preset)` builds tagged URL; `extractUrls(content)` finds all URLs in post content; `tagContentUrls(content, preset)` replaces all URLs with UTM-tagged versions
- [x] UTM tagging in post composer — "Tag URLs" button applies default UTM preset to all URLs in current content; shows count of URLs tagged; resets when content changes
- [x] UTM presets management page in dashboard (`/utm-presets`) — list presets, inline create form (name + source + medium + optional campaign/content/term), set-default toggle, delete
- [x] Add "UTM Tags" to sidebar navigation
- [x] Unit tests for UTM utility and presets API (URL extraction, tagging, auth, rate limit, max-presets, CRUD shape — 12 tests)

### Phase 75: Content Idea Board (Kanban)
- [x] `ContentIdea` model in Prisma (id, userId, title, description?, status: IdeaStatus, platform?, notes?, dueDate?, createdAt, updatedAt) + `IdeaStatus` enum (IDEA, RESEARCHING, DRAFTING, REVIEW, DONE) + migration
- [x] CRUD API for ideas (`GET /api/ideas`, `POST /api/ideas`, `PATCH /api/ideas/[id]`, `DELETE /api/ideas/[id]`) — auth + rate limit + zod validation
- [x] "Convert to Post" action (`POST /api/ideas/[id]/to-post`) — creates a DRAFT Post from the idea title/description, returns the new post id
- [x] Kanban board page in dashboard (`/ideas`) — five-column board (Idea / Researching / Drafting / Review / Done), inline idea creation, move-to-column action, delete, "Convert to Post" button per card
- [x] Add "Ideas" to sidebar navigation
- [x] Unit tests for ideas API (GET list, POST create, PATCH update, DELETE, to-post — auth, rate limit, validation, CRUD shape — 15 tests)

### Phase 76: Posting Goals & Progress Tracking
- [x] `PostingGoal` model in Prisma (id, userId, name, targetCount, period: GoalPeriod enum DAILY/WEEKLY/MONTHLY, platform?, isActive, createdAt, updatedAt) + migration (`20260511000000_add_posting_goal`)
- [x] CRUD API for posting goals (`GET /api/posting-goals`, `POST /api/posting-goals`, `DELETE /api/posting-goals/[id]`, `PATCH /api/posting-goals/[id]/toggle`) — auth + rate limit + zod validation; max 20 goals per user
- [x] Progress endpoint (`GET /api/posting-goals/progress`) — for each active goal computes publishedCount in the current period window vs targetCount; returns `{goalId, name, period, platform, targetCount, publishedCount, percentage, onTrack}`
- [x] Posting goals page in dashboard (`/posting-goals`) — list goals with circular progress indicators, inline create form (name + period + targetCount + optional platform), toggle active/pause, delete
- [x] Add "Goals" to sidebar navigation
- [x] Unit tests for posting goals API (GET list, POST create, DELETE, toggle, GET progress — auth, rate limit, max-goals, validation, CRUD shape — 24 tests)

### Phase 77: Content Snippet Library
- [x] `ContentSnippet` model in Prisma (id, userId, name, content, category?, createdAt, updatedAt) + migration
- [x] CRUD API for snippets (`GET /api/snippets`, `POST /api/snippets`, `PATCH /api/snippets/[id]`, `DELETE /api/snippets/[id]`) — auth + rate limit + zod validation; max 50 snippets per user
- [x] Snippets management page in dashboard (`/snippets`) — list, inline create form (name + category + content), edit-in-place, delete
- [x] "Insert Snippet" selector in post composer — dropdown listing snippets (optionally filtered by category), appends snippet content to post textarea
- [x] Add "Snippets" to sidebar navigation
- [x] Unit tests for snippets API (GET, POST, PATCH, DELETE — auth, rate limit, max-snippets, ownership, validation — 14 tests)

### Phase 78: Post Draft Auto-Save & Recovery
- [x] `DraftAutosave` model in Prisma (id, userId unique, content, scheduledAt?, firstComment?, selectedAccountIds[], tagIds[], platformVariants Json?, updatedAt) + migration — one row per user, upserted on every save
- [x] `GET /api/posts/autosave` + `PUT /api/posts/autosave` + `DELETE /api/posts/autosave` endpoints — retrieve / store / clear the in-progress draft; auth + rate limit + zod validation
- [x] `AutosaveIndicator` component (`src/components/autosave-indicator.tsx`) — compact status badge ("Saving…" / "Saved X ago" / "Error") shown above the content textarea
- [x] Auto-save integration in post composer — debounced useEffect (5 s after last keystroke), PUT to `/api/posts/autosave` when content is non-empty; clear autosave on successful post creation
- [x] Draft recovery modal in post composer — on mount, GET `/api/posts/autosave`; if a non-empty draft exists, show a dialog offering "Restore draft" or "Discard" before composing
- [x] Unit tests for autosave API (GET empty, GET with draft, PUT create/update, DELETE — auth, rate limit, validation, shape — 12 tests)

### Phase 79: LinkedIn Platform Integration
- [x] Add `LINKEDIN` to `Platform` enum in Prisma schema + migration (`20260514000000_add_linkedin_platform`)
- [x] LinkedIn OAuth utility (`src/lib/auth/linkedin-oauth.ts`) — `buildLinkedInOAuthUrl`, `exchangeLinkedInCode`, `getLinkedInProfile`; uses `openid profile w_member_social` scopes
- [x] LinkedIn connect route (`GET /api/oauth/linkedin/connect`) — CSRF state + redirect to LinkedIn OAuth dialog
- [x] LinkedIn callback route (`GET /api/oauth/linkedin/callback`) — exchange code, fetch profile, store encrypted token in SocialAccount
- [x] LinkedIn platform adapter (`src/lib/platforms/linkedin.ts`) — implements PlatformAdapter; supports text posts (NONE) and single-image posts (IMAGE) via LinkedIn REST API v202406
- [x] Update `character-limits.ts` — add `LINKEDIN: 3000` to `PLATFORM_CHAR_LIMITS`
- [x] Update `.env.example` with `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add LinkedIn connection card with status indicators and connect button
- [x] Unit tests for LinkedIn adapter (text post, image post, getStatus, deletePost, getInsights, error handling — 14 tests)

### Phase 80: Pinterest Platform Integration
- [x] Add `PINTEREST` to `Platform` enum in Prisma schema + migration (`20260515000000_add_pinterest_platform`)
- [x] Pinterest OAuth utility (`src/lib/auth/pinterest-oauth.ts`) — `buildPinterestOAuthUrl`, `exchangePinterestCode`, `getPinterestUserAndBoards`; uses `boards:read pins:read pins:write user_accounts:read` scopes
- [x] Pinterest connect route (`GET /api/oauth/pinterest/connect`) — CSRF state + redirect to Pinterest OAuth dialog
- [x] Pinterest callback route (`GET /api/oauth/pinterest/callback`) — exchange code, fetch user's first board, store encrypted token + board ID in SocialAccount
- [x] Pinterest platform adapter (`src/lib/platforms/pinterest.ts`) — implements PlatformAdapter; supports image posts (IMAGE) via Pinterest API v5; NONE/VIDEO/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `PINTEREST: 500` to `PLATFORM_CHAR_LIMITS`
- [x] Update `.env.example` with `PINTEREST_CLIENT_ID`, `PINTEREST_CLIENT_SECRET`, `PINTEREST_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add Pinterest connection card with status indicators and connect button
- [x] Unit tests for Pinterest adapter (image post, no-media error, NONE/VIDEO unsupported, getStatus, deletePost, getInsights empty/data — 12 tests)

### Phase 81: Slack & Discord Notification Integrations
- [x] `SlackIntegration` model in Prisma (id, userId, workspaceName, webhookUrl, events[], isActive, createdAt, updatedAt) + `DiscordIntegration` model (id, userId, channelName, webhookUrl, events[], isActive, createdAt, updatedAt) + migration
- [x] Slack notification dispatch (`src/lib/slack-notify.ts`) — sends Block Kit formatted message to Slack incoming webhook URL on post terminal events
- [x] Discord notification dispatch (`src/lib/discord-notify.ts`) — sends embed message to Discord webhook URL on post terminal events
- [x] CRUD API for Slack integrations (`GET /api/integrations/slack`, `POST /api/integrations/slack`, `DELETE /api/integrations/slack/[id]`, `PATCH /api/integrations/slack/[id]/toggle`) — auth + rate limit + zod validation
- [x] CRUD API for Discord integrations (`GET /api/integrations/discord`, `POST /api/integrations/discord`, `DELETE /api/integrations/discord/[id]`, `PATCH /api/integrations/discord/[id]/toggle`) — auth + rate limit + zod validation
- [x] Integrate both dispatchers into BullMQ publish worker — fire after post status is reconciled (same pattern as webhook dispatch)
- [x] Integrations page in dashboard (`/integrations`) — tabbed UI for Slack and Discord; add webhook URL + name, select events, toggle active/inactive, delete
- [x] Add "Integrations" to sidebar navigation
- [x] Unit tests for Slack and Discord integration API endpoints (GET, POST, DELETE, toggle — auth, rate limit, validation, CRUD shape — 34 tests)

### Phase 82: YouTube Platform Integration
- [x] Add `YOUTUBE` to `Platform` enum in Prisma schema + migration (`20260517000000_add_youtube_platform`)
- [x] YouTube OAuth utility (`src/lib/auth/youtube-oauth.ts`) — `buildYouTubeOAuthUrl`, `exchangeYouTubeCode`, `getYouTubeChannel`; uses `https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly` scopes
- [x] YouTube connect route (`GET /api/oauth/youtube/connect`) — CSRF state + redirect to Google OAuth dialog
- [x] YouTube callback route (`GET /api/oauth/youtube/callback`) — exchange code, fetch channel info, store encrypted token in SocialAccount
- [x] YouTube platform adapter (`src/lib/platforms/youtube.ts`) — implements PlatformAdapter; supports video posts (VIDEO) via YouTube Data API v3; NONE/IMAGE/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `YOUTUBE: 5000` to `PLATFORM_CHAR_LIMITS`
- [x] Update `.env.example` with `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add YouTube connection card with status indicators and connect button
- [x] Unit tests for YouTube adapter (video post, no-media error, NONE/IMAGE unsupported, getStatus, deletePost, getInsights — 12 tests)

### Phase 83: TikTok Platform Integration
- [x] Add `TIKTOK` to `Platform` enum in Prisma schema + migration (`20260518000000_add_tiktok_platform`)
- [x] TikTok OAuth utility (`src/lib/auth/tiktok-oauth.ts`) — `buildTikTokOAuthUrl`, `exchangeTikTokCode`, `getTikTokUserInfo`; uses `user.info.basic,video.publish` scopes
- [x] TikTok connect route (`GET /api/oauth/tiktok/connect`) — CSRF state + redirect to TikTok OAuth dialog
- [x] TikTok callback route (`GET /api/oauth/tiktok/callback`) — exchange code, fetch user info, store encrypted token in SocialAccount
- [x] TikTok platform adapter (`src/lib/platforms/tiktok.ts`) — implements PlatformAdapter; supports video posts (VIDEO) via TikTok Content Posting API v2; NONE/IMAGE/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `TIKTOK: 2200` to `PLATFORM_CHAR_LIMITS`
- [x] Update `.env.example` with `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add TikTok connection card with status indicators and connect button
- [x] Unit tests for TikTok adapter (video post, no-media error, NONE/IMAGE unsupported, getStatus, deletePost, getInsights — 12 tests)

### Phase 84: X (Twitter) Platform Integration
- [x] Add `TWITTER` to `Platform` enum in Prisma schema + migration (`20260519000000_add_twitter_platform`)
- [x] Twitter OAuth 2.0 PKCE utility (`src/lib/auth/twitter-oauth.ts`) — `buildTwitterOAuthUrl`, `exchangeTwitterCode`, `getTwitterUser`; uses `tweet.write tweet.read users.read offline.access` scopes; PKCE code verifier/challenge helpers
- [x] Twitter connect route (`GET /api/oauth/twitter/connect`) — CSRF state + PKCE code verifier stored in httpOnly cookies + redirect to Twitter OAuth dialog
- [x] Twitter callback route (`GET /api/oauth/twitter/callback`) — verify state + code verifier, exchange code, fetch user info, store encrypted token in SocialAccount
- [x] Twitter platform adapter (`src/lib/platforms/twitter.ts`) — implements PlatformAdapter; supports text posts (NONE) and single-image posts (IMAGE) via Twitter API v2; media upload via v1.1 endpoint; `addComment` posts a reply tweet
- [x] Update `character-limits.ts` — add `TWITTER: 280` to `PLATFORM_CHAR_LIMITS`
- [x] Update all `Record<Platform, ...>` maps across adapters, workers, and UI components to include TWITTER (and back-fill LINKEDIN/PINTEREST/YOUTUBE/TIKTOK where missing)
- [x] Update `.env.example` with `TWITTER_CLIENT_ID`, `TWITTER_CLIENT_SECRET`, `TWITTER_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add X (Twitter) connection card with status indicator and connect button
- [x] Unit tests for Twitter adapter (text post, content trim, API error, image post with media upload, media upload failure, skip upload when no URL, VIDEO/CAROUSEL unsupported, getStatus, deletePost, getInsights, addComment — 19 tests)

### Phase 85: Bluesky Platform Integration
- [x] Add `BLUESKY` to `Platform` enum in Prisma schema + migration (`20260520000000_add_bluesky_platform`)
- [x] Bluesky session utility (`src/lib/auth/bluesky-oauth.ts`) — `createBlueskySession(identifier, appPassword)`, `refreshBlueskySession(refreshJwt)`, `parseBlueskyToken`, `serializeBlueskyToken`; uses AT Protocol `com.atproto.server.createSession/refreshSession`
- [x] Bluesky connect route (`POST /api/oauth/bluesky/connect`) — accepts `{identifier, appPassword}` JSON body; calls `createBlueskySession`; stores encrypted `{did, handle, accessJwt, refreshJwt}` JSON in SocialAccount; rate-limited
- [x] Bluesky platform adapter (`src/lib/platforms/bluesky.ts`) — implements PlatformAdapter; supports text posts (NONE) and multi-image posts (IMAGE, up to 4 via blob upload) via `com.atproto.repo.createRecord`; `platformPostId` is the AT URI; VIDEO/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `BLUESKY: 300` to `PLATFORM_CHAR_LIMITS`
- [x] Update token-manager.ts — extend `RefreshableAccount` with optional `platform`; add BLUESKY-specific refresh path using `refreshBlueskySession` (refresh within 10 min of expiry, updates stored token + expiry)
- [x] Update publish worker — import and register `blueskyAdapter`; pass `platform` field to `getTokenWithRefresh`
- [x] Update `.env.example` — add Bluesky section noting no client credentials are required
- [x] Update accounts page — add Bluesky connection card (always enabled) linking to `/accounts/bluesky-connect`
- [x] Bluesky connect form page (`/accounts/bluesky-connect`) — client component form accepting handle + app password; POSTs to `/api/oauth/bluesky/connect`; redirects to `/accounts` on success; shows error inline
- [x] Unit tests for Bluesky adapter (text post, image post with blob upload, image fetch failure, blob upload failure, VIDEO/CAROUSEL unsupported, getStatus found, getStatus not-found, deletePost, getInsights, content truncation, AT URI rkey extraction — 12 tests)

### Phase 86: Mastodon Platform Integration
- [x] Add `MASTODON` to `Platform` enum in Prisma schema + migration (`20260521000000_add_mastodon_platform`)
- [x] Mastodon token utility (`src/lib/auth/mastodon-oauth.ts`) — `verifyMastodonToken(instanceUrl, accessToken)` verifies token via `/api/v1/accounts/verify_credentials`; `serializeMastodonToken`, `parseMastodonToken` for encrypted storage
- [x] Mastodon connect route (`POST /api/oauth/mastodon/connect`) — accepts `{instanceUrl, accessToken}` JSON body; verifies token with instance; stores encrypted `{instanceUrl, accessToken, accountId, username}` JSON in SocialAccount; rate-limited
- [x] Mastodon platform adapter (`src/lib/platforms/mastodon.ts`) — implements PlatformAdapter; supports text posts (NONE) and image posts (IMAGE, up to 4 images via `/api/v2/media` upload + `/api/v1/statuses`); VIDEO/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `MASTODON: 500` to `PLATFORM_CHAR_LIMITS`
- [x] Update publish worker — import and register `mastodonAdapter`; no token refresh needed (Mastodon tokens do not expire)
- [x] Update `.env.example` — add Mastodon section noting no client credentials are required
- [x] Update accounts page — add Mastodon connection card (always enabled) linking to `/accounts/mastodon-connect`
- [x] Mastodon connect form page (`/accounts/mastodon-connect`) — client component form accepting instance URL + access token; POSTs to `/api/oauth/mastodon/connect`; redirects to `/accounts` on success; shows error inline
- [x] Unit tests for Mastodon adapter (text post, content truncation, image post with media upload, image fetch failure, media upload failure, VIDEO/CAROUSEL unsupported, getStatus found, getStatus not-found, deletePost success, deletePost failure, getInsights, multiple images capped at 4 — 12 tests)

### Phase 87: Telegram Platform Integration
- [x] Add `TELEGRAM` to `Platform` enum in Prisma schema + migration (`20260522000000_add_telegram_platform`)
- [x] Telegram bot token utility (`src/lib/auth/telegram-oauth.ts`) — `verifyTelegramBotToken(botToken)` verifies via Bot API `getMe`; `serializeTelegramToken`, `parseTelegramToken` for encrypted storage
- [x] Telegram connect route (`POST /api/oauth/telegram/connect`) — accepts `{botToken, chatId}` JSON body; verifies token with Telegram API; stores encrypted `{botToken, chatId, botUsername, botName}` JSON in SocialAccount; rate-limited
- [x] Telegram platform adapter (`src/lib/platforms/telegram.ts`) — implements PlatformAdapter; supports text posts (NONE via `sendMessage`), single-image posts (IMAGE via `sendPhoto`), and multi-image posts (IMAGE/CAROUSEL via `sendMediaGroup`, up to 10); VIDEO throws unsupported error
- [x] Update `character-limits.ts` — add `TELEGRAM: 4096` to `PLATFORM_CHAR_LIMITS`
- [x] Update `.env.example` — add Telegram section noting no client credentials are required
- [x] Update accounts page — add Telegram connection card (always enabled) linking to `/accounts/telegram-connect`
- [x] Telegram connect form page (`/accounts/telegram-connect`) — client component form accepting bot token + chat ID; POSTs to `/api/oauth/telegram/connect`; redirects to `/accounts` on success; shows error inline
- [x] Update publish worker, publish route, sync-insights worker, insights route, retry route, and UI components (`platform-char-counter`, `platform-variants`, `post-composer`, `post-preview`, `queue-client`, `performance-alerts form`) to include TELEGRAM (and back-fill MASTODON where missing)
- [x] Unit tests for Telegram adapter (text post, content truncation, API error, single image via sendPhoto, caption truncation, media group for multiple images, 10-image cap, CAROUSEL as media group, VIDEO unsupported, getStatus always PUBLISHED, deletePost success, deletePost failure, getInsights empty — 13 tests)

### Phase 88: Multi-Language Post Support & Translation
- [x] Add `language` (nullable String, ISO 639-1 code, e.g. "en", "fr", "ja") to Post model + Prisma migration (`20260523000000_add_post_language`)
- [x] Add `translateContent(content, targetLanguages)` to `src/lib/ai.ts` — calls Claude AI (`claude-haiku-4-5`) to translate content into each requested language while preserving hashtags, mentions, and emojis; uses prompt caching on system block; returns `{language, content}[]`
- [x] `POST /api/posts/[id]/translate` endpoint — auth + rate limit + AI check + ownership; accepts `{targetLanguages: string[]}` body (ISO 639-1 codes, 1–5 languages); calls `translateContent`; returns `{translations: {language, content}[]}`; returns 503 when AI not configured
- [x] Language selector in post composer — compact `<select>` (None / English / Spanish / French / German / Japanese / Portuguese / Chinese / Arabic / Korean / Italian / custom code); sets `language` field submitted with post creation; shown below content textarea
- [x] `TranslateDialog` component (`src/components/translate-dialog.tsx`) — modal triggered by "Translate" button in posts list row; shows per-language translated content with copy-to-clipboard and "Apply as Variant" action calling PUT `/api/posts/[id]/variants`; regenerate button; loading and empty states
- [x] Unit tests for translate endpoint (auth, rate limit, AI disabled, not-found, ownership, success with 2 langs, max-languages exceeded, invalid body, AI error — 10 tests)

### Phase 89: Post Archive & Soft Delete
- [x] Add `archivedAt` (nullable DateTime) to Post model + Prisma migration (`20260524000000_add_post_archived`)
- [x] `PATCH /api/posts/[id]/archive` endpoint — toggle archive state (sets archivedAt to now() or null); auth + rate limit + ownership; logs activity
- [x] Extend `GET /api/posts` to exclude archived posts by default; support `?archived=true` to fetch only archived posts
- [x] `ArchivePostButton` client component (`src/app/(dashboard)/posts/archive-post-button.tsx`) — archive/unarchive icon toggle with optimistic UI and toast feedback, integrated into posts list row
- [x] "Archived" filter tab in posts list page alongside existing status/starred/evergreen/sentiment tabs
- [x] Unit tests for the archive endpoint (auth, ownership, not-found, archive on, archive off/restore — 8 tests)

### Phase 90: Zapier-Compatible Polling Triggers
- [x] API key auth middleware (`src/lib/api-key-auth.ts`) — validates `x-api-key` header against hashed ApiKey records, updates lastUsedAt, returns userId or error response
- [x] `GET /api/zap/posts` endpoint — returns newest posts (up to 10, created after optional `?since=ISO_DATE`); auth via API key header; Zapier-friendly flat response shape
- [x] `GET /api/zap/published` endpoint — returns recently PUBLISHED posts (since optional `?since=ISO_DATE`, default last 24 h); auth via API key; includes platform publish results
- [x] Zapier integration guide page in dashboard (`/zapier`) — instructions for creating a Zapier polling trigger, sample cURL, reminder to use API key from Settings → API Keys
- [x] Add "Zapier" to sidebar navigation
- [x] Unit tests for Zap API endpoints (valid key, invalid/missing key, expired key, posts shape, published shape, since filter — 13 tests)

### Phase 91: Reddit Platform Integration
- [x] Add `REDDIT` to `Platform` enum in Prisma schema + migration (`20260525000000_add_reddit_platform`)
- [x] Reddit OAuth 2.0 utility (`src/lib/auth/reddit-oauth.ts`) — `buildRedditOAuthUrl`, `exchangeRedditCode`, `getRedditUser`; uses `submit identity` scopes; stores `{accessToken, refreshToken, username, subreddits[]}` JSON
- [x] Reddit connect route (`GET /api/oauth/reddit/connect`) — CSRF state + redirect to Reddit OAuth dialog
- [x] Reddit callback route (`GET /api/oauth/reddit/callback`) — exchange code, fetch user info + subscribed subreddits, store encrypted token in SocialAccount
- [x] Reddit platform adapter (`src/lib/platforms/reddit.ts`) — implements PlatformAdapter; supports text posts (NONE via `kind=self`) and link posts (IMAGE via `kind=link`); targets subreddit from accountId; VIDEO/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `REDDIT: 40000` to `PLATFORM_CHAR_LIMITS`
- [x] Update `.env.example` with `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add Reddit connection card with status indicators and connect button
- [x] Unit tests for Reddit adapter (text post, link/image post, no-media error, VIDEO/CAROUSEL unsupported, getStatus, deletePost, getInsights, API error — 12 tests)

### Phase 92: Nostr Platform Integration
- [x] Add `NOSTR` to `Platform` enum in Prisma schema + migration (`20260526000000_add_nostr_platform`)
- [x] Install `nostr-tools` npm package
- [x] Nostr key utility (`src/lib/auth/nostr-oauth.ts`) — `verifyNostrPrivateKey(privateKey)` validates hex/nsec key and derives public key; `serializeNostrToken`, `parseNostrToken` for encrypted storage
- [x] Nostr connect route (`POST /api/oauth/nostr/connect`) — accepts `{privateKey, relayUrls}` JSON body; validates key; stores encrypted `{privateKey, publicKey, relayUrls}` JSON in SocialAccount; rate-limited
- [x] Nostr platform adapter (`src/lib/platforms/nostr.ts`) — implements PlatformAdapter; supports text posts (NONE) and image posts with URL embedding (IMAGE); publishes kind-1 events to user-provided relays; VIDEO/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `NOSTR: 4096` to `PLATFORM_CHAR_LIMITS`
- [x] Update `.env.example` — add Nostr section noting no client credentials are required
- [x] Update accounts page — add Nostr connection card (always enabled) linking to `/accounts/nostr-connect`
- [x] Nostr connect form page (`/accounts/nostr-connect`) — client component form accepting private key (hex or nsec) + relay URLs (newline-separated); POSTs to `/api/oauth/nostr/connect`; redirects to `/accounts` on success; shows error inline
- [x] Update publish worker — import and register `nostrAdapter`
- [x] Update all `Record<Platform, ...>` maps and UI components to include NOSTR
- [x] Unit tests for Nostr adapter (text post, image post with URL, content truncation, VIDEO/CAROUSEL unsupported, getStatus, deletePost, getInsights, relay timeout, invalid key — 12 tests)

### Phase 93: Tumblr Platform Integration
- [x] Add `TUMBLR` to `Platform` enum in Prisma schema + migration (`20260527000000_add_tumblr_platform`)
- [x] Tumblr OAuth 2.0 utility (`src/lib/auth/tumblr-oauth.ts`) — `buildTumblrOAuthUrl`, `exchangeTumblrCode`, `getTumblrUser`; uses `basic write offline_access` scopes; `serializeTumblrToken`/`parseTumblrToken`
- [x] Tumblr connect route (`GET /api/oauth/tumblr/connect`) — CSRF state + redirect to Tumblr OAuth dialog
- [x] Tumblr callback route (`GET /api/oauth/tumblr/callback`) — exchange code, fetch user + primary blog, store encrypted token in SocialAccount
- [x] Tumblr platform adapter (`src/lib/platforms/tumblr.ts`) — implements PlatformAdapter; supports text posts (NONE via NPF text block) and image posts (IMAGE via NPF image blocks, up to N images); VIDEO/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `TUMBLR: 4096` to `PLATFORM_CHAR_LIMITS`
- [x] Update publish worker, retry route, insights route, sync-insights worker, and UI components (`platform-char-counter`, `platform-variants`, `post-preview`, `post-composer`, `queue-client`, `performance-alerts form`) to include TUMBLR
- [x] Update `.env.example` with `TUMBLR_CLIENT_ID`, `TUMBLR_CLIENT_SECRET`, `TUMBLR_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add Tumblr connection card with status indicators and connect button
- [x] Unit tests for Tumblr adapter (text post, content truncation, API error, image post with NPF blocks, multiple images, VIDEO/CAROUSEL unsupported, getStatus published/queued/draft/missing/error, deletePost success/404/error, getInsights with data/empty/error — 19 tests)

### Phase 94: WordPress.com Platform Integration
- [x] Add `WORDPRESS` to `Platform` enum in Prisma schema + migration (`20260528000000_add_wordpress_platform`)
- [x] WordPress.com OAuth 2.0 utility (`src/lib/auth/wordpress-oauth.ts`) — `buildWordPressOAuthUrl`, `exchangeWordPressCode`, `getWordPressSites`; uses `posts global` scopes; `serializeWordPressToken`/`parseWordPressToken` storing `{accessToken, siteId, siteUrl, blogName}`
- [x] WordPress connect route (`GET /api/oauth/wordpress/connect`) — CSRF state + redirect to WordPress.com OAuth dialog
- [x] WordPress callback route (`GET /api/oauth/wordpress/callback`) — exchange code, fetch user's primary site, store encrypted token in SocialAccount
- [x] WordPress platform adapter (`src/lib/platforms/wordpress.ts`) — implements PlatformAdapter; supports text posts (NONE via post content/title) and image posts (IMAGE via media upload + featured image); VIDEO/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `WORDPRESS: 200000` to `PLATFORM_CHAR_LIMITS`
- [x] Update publish worker, retry route, insights route, sync-insights worker, and UI components (`platform-char-counter`, `platform-variants`, `post-preview`, `post-composer`, `queue-client`, `performance-alerts form`) to include WORDPRESS
- [x] Update `.env.example` with `WORDPRESS_CLIENT_ID`, `WORDPRESS_CLIENT_SECRET`, `WORDPRESS_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add WordPress.com connection card with status indicators and connect button
- [x] Unit tests for WordPress adapter (text post, image post with media upload, image fetch failure, media upload failure, VIDEO/CAROUSEL unsupported, getStatus published/pending/draft/missing, deletePost success/error, getInsights — 14 tests)

### Phase 95: Medium.com Platform Integration
- [x] Add `MEDIUM` to `Platform` enum in Prisma schema + migration (`20260529000000_add_medium_platform`)
- [x] Medium OAuth utility (`src/lib/auth/medium-oauth.ts`) — `buildMediumOAuthUrl`, `exchangeMediumCode`, `getMediumUser`; uses `basicProfile publishPost` scopes; `serializeMediumToken`/`parseMediumToken`
- [x] Medium connect route (`GET /api/oauth/medium/connect`) — CSRF state + redirect to Medium OAuth dialog
- [x] Medium callback route (`GET /api/oauth/medium/callback`) — exchange code, fetch user info, store encrypted token in SocialAccount
- [x] Medium platform adapter (`src/lib/platforms/medium.ts`) — implements PlatformAdapter; supports text posts (NONE via HTML story) and image posts (IMAGE with embedded image URL in HTML); VIDEO/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `MEDIUM: 100000` to `PLATFORM_CHAR_LIMITS`
- [x] Update publish worker, retry route, insights route, sync-insights worker, and UI components (`platform-char-counter`, `platform-variants`, `post-preview`, `post-composer`, `queue-client`, `performance-alerts form`) to include MEDIUM
- [x] Update `.env.example` with `MEDIUM_CLIENT_ID`, `MEDIUM_CLIENT_SECRET`, `MEDIUM_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add Medium connection card with status indicators and connect button
- [x] Unit tests for Medium adapter (text post, image post with embedded URL, VIDEO/CAROUSEL unsupported, getStatus, deletePost no-op, getInsights empty — 8 tests)

### Phase 96: Ghost CMS Platform Integration
- [x] Add `GHOST` to `Platform` enum in Prisma schema + migration (`20260530000000_add_ghost_platform`)
- [x] Ghost Admin API key utility (`src/lib/auth/ghost-oauth.ts`) — `verifyGhostAdminKey(instanceUrl, adminApiKey)` verifies via Admin API `/ghost/api/admin/site/`; `generateGhostJwt(adminApiKey)` creates short-lived JWT from `{id}:{secret}` key; `serializeGhostToken`/`parseGhostToken` for encrypted storage
- [x] Ghost connect route (`POST /api/oauth/ghost/connect`) — accepts `{instanceUrl, adminApiKey}` JSON body; verifies key with Ghost instance; stores encrypted `{instanceUrl, adminApiKey, siteTitle, siteUrl}` JSON in SocialAccount; rate-limited
- [x] Ghost platform adapter (`src/lib/platforms/ghost.ts`) — implements PlatformAdapter; supports text posts (NONE via HTML post) and image posts (IMAGE with featured image); VIDEO/CAROUSEL throw unsupported errors; uses Admin API `/ghost/api/admin/posts/`
- [x] Update `character-limits.ts` — add `GHOST: 100000` to `PLATFORM_CHAR_LIMITS`
- [x] Update publish worker, retry route, insights route, sync-insights worker, and UI components (`platform-char-counter`, `platform-variants`, `post-preview`, `post-composer`, `queue-client`, `performance-alerts form`) to include GHOST
- [x] Update `.env.example` — add Ghost section noting no client credentials are required (uses Admin API key)
- [x] Update accounts page — add Ghost connection card (always enabled) linking to `/accounts/ghost-connect`
- [x] Ghost connect form page (`/accounts/ghost-connect`) — client component form accepting Ghost instance URL + Admin API key (`{id}:{secret}` format); POSTs to `/api/oauth/ghost/connect`; redirects to `/accounts` on success; shows error inline
- [x] Unit tests for Ghost adapter (text post, content truncation, API error, image post with featured image, image fetch failure, VIDEO/CAROUSEL unsupported, getStatus published/draft/scheduled, deletePost success/error, getInsights — 14 tests)

### Phase 97: Dev.to Platform Integration
- [x] Add `DEVTO` to `Platform` enum in Prisma schema + migration (`20260531000000_add_devto_platform`)
- [x] Dev.to API key utility (`src/lib/auth/devto-oauth.ts`) — `verifyDevToApiKey(apiKey)` verifies via `GET /api/users/me` with `api-key` header; `serializeDevToToken`/`parseDevToToken` for encrypted storage
- [x] Dev.to connect route (`POST /api/oauth/devto/connect`) — accepts `{apiKey}` JSON body; verifies with Dev.to API; stores encrypted `{apiKey, username, name}` JSON in SocialAccount; rate-limited
- [x] Dev.to platform adapter (`src/lib/platforms/devto.ts`) — implements PlatformAdapter; supports text posts (NONE via Markdown article body) and image posts (IMAGE with embedded image URL in Markdown); VIDEO/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `DEVTO: 100000` to `PLATFORM_CHAR_LIMITS`
- [x] Update publish worker, retry route, insights route, sync-insights worker, and UI components (`platform-char-counter`, `platform-variants`, `post-preview`, `post-composer`, `queue-client`, `performance-alerts form`) to include DEVTO
- [x] Update `.env.example` — add Dev.to section noting no client credentials are required (uses personal API key)
- [x] Update accounts page — add Dev.to connection card (always enabled) linking to `/accounts/devto-connect`
- [x] Dev.to connect form page (`/accounts/devto-connect`) — client component form accepting personal API key; POSTs to `/api/oauth/devto/connect`; redirects to `/accounts` on success; shows error inline
- [x] Unit tests for Dev.to adapter (text post, title extraction, image post with embedded URL, VIDEO/CAROUSEL unsupported, getStatus published/draft, deletePost no-op, getInsights — 17 tests)

### Phase 98: Stripe Billing & Subscription Management
- [x] Install `stripe` npm package; add `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID` (all optional) to `.env.example` and `src/lib/env.ts`
- [x] Extend User model with `stripeCustomerId` (nullable String), `planTier` (String default "free"), `planExpiresAt` (nullable DateTime) + Prisma migration (`20260601000000_add_billing`)
- [x] Stripe service (`src/lib/stripe.ts`) — `getStripeClient()`, `createCheckoutSession(userId, email, priceId)`, `createPortalSession(customerId)`, `syncSubscription(event)` helpers; gracefully returns null when Stripe is not configured
- [x] `POST /api/billing/checkout` endpoint — creates Stripe Checkout session for PRO upgrade; auth + zod validation; returns `{url}`
- [x] `POST /api/billing/portal` endpoint — creates Stripe Customer Portal session; auth; returns `{url}`
- [x] `GET /api/billing/status` endpoint — returns `{planTier, planExpiresAt, stripeCustomerId, stripeEnabled}`; auth
- [x] `POST /api/webhooks/stripe` endpoint — verifies Stripe signature; handles `checkout.session.completed` and `customer.subscription.deleted` events; updates User.planTier and planExpiresAt
- [x] Billing page in dashboard (`/billing`) — shows current plan (Free/Pro), plan expiry, Upgrade button (links to checkout), Manage Subscription button (links to portal); gracefully handles Stripe not configured with a "Stripe not configured" notice
- [x] Add "Billing" to sidebar navigation
- [x] Unit tests for billing endpoints (auth, checkout returns URL, portal returns URL, status shape, Stripe not configured, webhook signature validation, subscription sync — 18 tests)

### Phase 99: Hashnode Platform Integration
- [x] Add `HASHNODE` to `Platform` enum in Prisma schema + migration (`20260602000000_add_hashnode_platform`)
- [x] Hashnode token utility (`src/lib/auth/hashnode-oauth.ts`) — `verifyHashnodeToken(apiToken)` verifies via Hashnode GraphQL API (`/` + `me` query), returns username + name + first publicationId/URL; `serializeHashnodeToken`/`parseHashnodeToken` for encrypted storage
- [x] Hashnode connect route (`POST /api/oauth/hashnode/connect`) — accepts `{apiToken}` JSON body; verifies with Hashnode GraphQL API; stores encrypted `{apiToken, username, name, publicationId, publicationUrl}` JSON in SocialAccount; rate-limited
- [x] Hashnode platform adapter (`src/lib/platforms/hashnode.ts`) — implements PlatformAdapter; supports text posts (NONE via Markdown article, first line = title) and image posts (IMAGE, images embedded as Markdown in body); VIDEO/CAROUSEL throw unsupported errors; uses `publishPost` GraphQL mutation
- [x] Update `character-limits.ts` — add `HASHNODE: 40000` to `PLATFORM_CHAR_LIMITS`
- [x] Update publish worker, retry route, insights route, sync-insights worker, and publish route to include `hashnodeAdapter`
- [x] Update UI components (`platform-char-counter`, `platform-variants`, `post-preview`, `post-composer`, `queue-client`, `performance-alerts form`) to include HASHNODE
- [x] Update `.env.example` — add Hashnode section noting no client credentials are required (uses personal access token)
- [x] Update accounts page — add Hashnode connection card (always enabled) linking to `/accounts/hashnode-connect`
- [x] Hashnode connect form page (`/accounts/hashnode-connect`) — client component form accepting personal access token; POSTs to `/api/oauth/hashnode/connect`; redirects to `/accounts` on success; shows error inline
- [x] Unit tests for Hashnode adapter (text post, title extraction, content truncation, GraphQL error, HTTP error, image post with Markdown embed, multiple images, VIDEO/CAROUSEL unsupported, getStatus found/null/error, deletePost success/404/error, getInsights with data/null fields/null post/error — 19 tests)

### Phase 100: AI Caption Generation from Media
- [x] Add `generateCaptionsFromImageUrl(imageUrl, platforms)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` with image vision (image_url content block) to analyze the image and suggest platform-optimized captions; returns `{platform, content}[]`; uses prompt caching on system block
- [x] `POST /api/ai/caption` endpoint — auth + rate limit + AI check + zod validation (`imageUrl: string`, `platforms: Platform[]`); calls `generateCaptionsFromImageUrl`; returns `{captions: {platform, content}[]}`; returns 503 when AI not configured
- [x] `ImageCaptionDialog` component (`src/components/image-caption-dialog.tsx`) — modal with per-platform caption previews showing character count vs limit, per-caption copy-to-clipboard and "Use as Content" button that fills the post composer content field, regenerate button, loading/empty states
- [x] Integrate "AI Caption" button (camera + sparkle icon) into post composer — visible when `mediaUrls` has at least one entry; opens `ImageCaptionDialog` with the first media URL
- [x] Unit tests for the caption endpoint (auth, rate limit, AI disabled, success shape with 2 platforms, invalid body, AI error — 8 tests)

### Phase 101: Link-in-Bio Page Builder
- [x] `LinkBioPage` model in Prisma (id, userId, slug unique, title, bio?, isPublished, createdAt, updatedAt) + `LinkBioItem` model (id, pageId, label, url, icon?, order, isActive, clicks, createdAt, updatedAt) + migration (`20260603000001_add_link_bio`)
- [x] CRUD API for bio pages (`GET /api/bio-pages`, `POST /api/bio-pages`, `GET /api/bio-pages/[id]`, `PATCH /api/bio-pages/[id]`, `DELETE /api/bio-pages/[id]`) — auth + rate limit + zod validation; max 10 pages per user; slug uniqueness check with 409 conflict
- [x] Items API (`POST /api/bio-pages/[id]/items`, `PATCH /api/bio-pages/[id]/items/[itemId]`, `DELETE /api/bio-pages/[id]/items/[itemId]`) — auth + ownership check; max 30 items per page; URL validation
- [x] Public bio page API (`GET /api/bio/[slug]`) — no auth required; returns active items only; 404 for unpublished pages
- [x] Click tracking endpoint (`POST /api/bio/[slug]/click/[itemId]`) — public; increments item click counter
- [x] Bio pages management page in dashboard (`/bio-pages`) — list pages with publish toggle, copy URL, open preview, edit slug/title/bio; expand each page to manage links (add, toggle active/inactive, delete, click count)
- [x] Public bio page (`/bio/[slug]`) — server-rendered; shows avatar initial, title, bio, active links with click-tracking; `generateMetadata` for SEO; no auth required
- [x] Add "Bio Pages" to sidebar navigation
- [x] Unit tests for bio pages API (GET list, POST create, GET page+items, PATCH, DELETE, add item, update item, delete item, public GET, click tracking — 31 tests)

### Phase 102: Embeddable Social Feed Widget
- [x] `FeedWidget` model in Prisma (id, userId, name, accountIds[], maxPosts Int default 10, theme String default "light", showPlatformIcons Boolean default true, showTimestamps Boolean default true, createdAt, updatedAt) + migration (`20260604000000_add_feed_widget`)
- [x] CRUD API for feed widgets (`GET /api/feed-widgets`, `POST /api/feed-widgets`, `PATCH /api/feed-widgets/[id]`, `DELETE /api/feed-widgets/[id]`) — auth + rate limit + zod validation; max 10 widgets per user
- [x] Public widget data endpoint (`GET /api/widget/[id]`) — no auth required; returns PUBLISHED posts for the widget's accountIds (up to maxPosts, newest first), sanitized (content, mediaUrls, platform, publishedAt only); cached in Redis for 5 min
- [x] Feed widget management page in dashboard (`/feed-widgets`) — list widgets, create form (name, max posts, theme toggle), copy embed code (iframe snippet pointing to `/widget/[id]`), delete
- [x] Public embeddable widget page (`/widget/[id]`) — server-rendered; renders posts as a clean card feed using theme; no login required; used as the iframe src
- [x] Add "Feed Widgets" to sidebar navigation
- [x] Unit tests for feed widgets API (GET list, POST create, PATCH, DELETE, public GET — auth, rate limit, max-widgets, ownership, shape — 20 tests)

### Phase 103: Content Pillars & Post Organization
- [x] `ContentPillar` model in Prisma (id, userId, name, color, description?, isActive, createdAt, updatedAt) + add `pillarId` FK to Post + migration (`20260605000000_add_content_pillars`)
- [x] CRUD API for content pillars (`GET /api/content-pillars`, `POST /api/content-pillars`, `PATCH /api/content-pillars/[id]`, `DELETE /api/content-pillars/[id]`) + analytics endpoint — auth + rate limit + zod validation
- [x] Content pillars management page in dashboard (`/content-pillars`) — list pillars with color swatch, post count, inline create/edit/delete
- [x] Add "Pillars" to sidebar navigation
- [x] Unit tests for content pillars API (GET, POST, PATCH, DELETE — auth, rate limit, CRUD shape)

### Phase 104: Post Expiry & Auto-Unpublish
- [x] Add `expiresAt` (nullable DateTime) to Post model + Prisma migration (`20260607000000_add_post_expiry`) with index on `expiresAt`
- [x] `PATCH /api/posts/[id]/expiry` endpoint — auth + rate limit + ownership; sets/clears expiresAt; returns updated post
- [x] BullMQ expiry worker — daily cron; finds PUBLISHED posts where expiresAt ≤ now(); marks them archived or failed; fires in-app notification
- [x] Expiry date selector in post composer — datetime picker shown when scheduling; sets expiresAt along with scheduledAt
- [x] Unit tests for expiry endpoint (auth, ownership, set date, clear date, expired post handling)

### Phase 105: Custom Branded Short Links
- [x] `ShortLink` model in Prisma (id, userId, slug unique, originalUrl, title?, clicks, expiresAt?, createdAt, updatedAt) + migration (`20260608000000_add_short_links`)
- [x] CRUD API for short links (`GET /api/short-links`, `POST /api/short-links`, `PATCH /api/short-links/[id]`, `DELETE /api/short-links/[id]`) — auth + rate limit + zod validation; max 200 links per user; auto-generates 6-char slug if not specified; slug uniqueness check with 409 conflict
- [x] Public redirect endpoint (`GET /s/[slug]`) — no auth; 302 redirect to originalUrl; increment clicks counter; 404 for expired links
- [x] Short links management page in dashboard (`/short-links`) — table with slug, original URL, click count, expiry, copy short URL, delete
- [x] Add "Short Links" to sidebar navigation
- [x] Unit tests for short links API (GET list, POST create, PATCH, DELETE, public redirect — auth, rate limit, slug uniqueness, click tracking, expiry — 18 tests)

### Phase 106: Web Push Notifications
- [x] `PushSubscription` model in Prisma (id, userId, endpoint unique, p256dhKey, authKey, userAgent?, createdAt) + migration (`20260611000000_add_push_subscriptions`)
- [x] `GET /api/push/vapid-key` endpoint — returns public VAPID key for browser subscription; `POST /api/push/subscribe` — registers push subscription; auth + rate limit
- [x] Web Push dispatch helper — sends push notification to all user's subscriptions on post terminal events
- [x] Service worker integration in dashboard — registers service worker, subscribes to push; persists subscription across sessions
- [x] Unit tests for push API endpoints (auth, subscribe, vapid key shape)

### Phase 107: Scheduling Blackout Periods
- [x] `BlackoutPeriod` model in Prisma (id, userId, name, startDate, endDate, isRecurring, daysOfWeek[], createdAt, updatedAt) + migration (`20260612000000_add_blackout_periods`)
- [x] CRUD API for blackout periods (`GET /api/blackout-periods`, `POST /api/blackout-periods`, `PATCH /api/blackout-periods/[id]`, `DELETE /api/blackout-periods/[id]`) — auth + rate limit + zod validation
- [x] Integrate blackout periods into `findNextAvailableSlot` — skip slots that fall within any active blackout period
- [x] Blackout periods management page in dashboard (`/blackout-periods`) — list periods with date range, recurring toggle, delete; inline create form
- [x] Add "Blackouts" to sidebar navigation
- [x] Unit tests for blackout periods API and blackout utility (GET, POST, PATCH, DELETE — auth, rate limit, validation, CRUD shape)

### Phase 108: Brand Kit & Voice Guidelines
- [x] `BrandKit` model in Prisma (id, userId unique, primaryColor?, secondaryColor?, accentColor?, logoUrl?, tagline?, voiceGuide?, doKeywords[], dontKeywords[], createdAt, updatedAt) + migration (`20260613000000_add_brand_kit`)
- [x] `GET /api/brand-kit` + `POST /api/brand-kit` endpoint — upsert brand kit for current user; auth + rate limit + zod validation
- [x] Brand kit management page in dashboard (`/brand-kit`) — color pickers, logo URL input, tagline, voice guide textarea, do/don't keyword lists
- [x] Add "Brand Kit" to sidebar navigation
- [x] Unit tests for brand kit API (GET, POST upsert — auth, rate limit, CRUD shape)

### Phase 109: Brand Compliance Scanner
- [x] Brand compliance utility (`src/lib/brand-compliance.ts`) — checks post content against user's BrandKit: detects forbidden `dontKeywords`, verifies presence of at least one `doKeyword` (when list is non-empty), warns when content is unusually short; returns `{violations: {type: "forbidden"|"missing_do"|"too_short", message: string, keyword?: string}[], compliant: boolean, score: number}`
- [x] `POST /api/brand-compliance` content-based endpoint — auth + rate limit; accepts `{content}` body; fetches user's BrandKit; returns compliance report; returns `{compliant: true, violations: [], score: 100}` when no BrandKit configured
- [x] `POST /api/posts/[id]/check-compliance` endpoint — auth + rate limit + ownership check; fetches user's BrandKit and post content; runs compliance utility; returns compliance report
- [x] `BrandComplianceIndicator` component (`src/components/brand-compliance-indicator.tsx`) — compact badge (green "Compliant" / red "X Violations") with expandable list of violations; integrated below the content textarea in post composer with 600 ms debounce; hidden when no content
- [x] Unit tests for brand compliance utility and endpoints (utility: clean, forbidden, multiple forbidden, missing do-keyword, empty do list, too-short, combined, score range; API: auth, rate limit, no kit, violations, compliant; post route: auth, rate limit, not found, ownership, no kit, violations — 20 tests)

### Phase 110: AI-Powered Content Calendar Planning
- [x] Add `generateContentCalendar(options)` to `src/lib/ai.ts` — calls Claude AI (`claude-haiku-4-5`) with date range, postsPerWeek, platforms, optional tone, brand kit context, and best-times context; returns `{days: [{date, suggestions: [{platform, contentType, draft, reasoning}]}]}`; uses prompt caching on system block
- [x] `POST /api/ai/content-calendar` endpoint — auth + rate limit + zod validation; accepts `{startDate, endDate, postsPerWeek, platforms[], tone?}`; queries brand kit and PostInsights for best-times context; calls `generateContentCalendar`; returns `{days}`; 503 when AI not configured
- [x] `CalendarPlannerDialog` component (`src/components/calendar-planner-dialog.tsx`) — modal with date pickers, posts-per-week input, tone selector, platform multi-select chips; calls content-calendar endpoint; shows day-by-day plan with accept/reject toggle per suggestion; accepted suggestions batch-create DRAFT posts via `POST /api/posts`
- [x] "AI Plan" button in calendar page header — opens CalendarPlannerDialog
- [x] Unit tests for content-calendar endpoint (auth, rate limit, AI disabled, invalid JSON, startDate > endDate, empty platforms, success without brand kit, brand context included, AI error — 9 tests)

### Phase 111: Notification Preferences & Digest Emails
- [x] `NotificationPreference` model in Prisma (id, userId, notificationType, inApp Boolean default true, email Boolean default true, updatedAt) + `@@unique([userId, notificationType])` + migration (`20260614000000_add_notification_preferences`)
- [x] `GET /api/notification-preferences` endpoint — returns list of preferences for current user, with defaults (inApp=true, email=true) filled in for any notification types that have no stored row yet; auth + rate limit
- [x] `PATCH /api/notification-preferences` endpoint — accepts `{preferences: [{type, inApp, email}][]}`, upserts each preference row; auth + rate limit + zod validation
- [x] Update `createNotification` in `src/lib/notifications.ts` — async-check the user's `NotificationPreference.inApp` before creating the notification row (skip if inApp=false); cache look-up is fire-and-forget, defaulting to true when no preference exists
- [x] Update `_notifyPostOutcomeAsync` in `src/lib/email.ts` — additionally check the per-type email preference before sending (falls back to true when no row); respects existing `emailNotifications` global toggle as the outer gate
- [x] Digest email worker (`src/lib/queue/workers/digest.ts`) — weekly cron Monday 09:00 UTC; for each user with `emailNotifications=true` and at least one unread notification in the past 7 days, sends a single digest HTML email summarising unread notifications (title + body, max 20); add `NOTIFICATION_DIGEST` to `QUEUE_NAMES`; register worker + cron in `workers/queue-worker.ts`
- [x] `NotificationPreferences` client component (`src/components/notification-preferences.tsx`) — table showing each notification type as a row with In-App and Email toggle switches; calls `PATCH /api/notification-preferences` on change; loading skeleton while fetching; integrated as a new Card in the Settings page
- [x] Unit tests for notification-preferences API (GET returns defaults for unknown types, GET returns stored values, PATCH upserts, PATCH invalid body, auth, rate limit — 10 tests)

### Phase 112: Inspiration Boards & URL Content Import
- [x] `InspirationItem` model in Prisma (id, userId, url, title?, description?, imageUrl?, notes?, platform?, createdAt, updatedAt) + migration (`20260615000000_add_inspiration`)
- [x] CRUD API for inspiration items (`GET /api/inspiration`, `POST /api/inspiration`, `PATCH /api/inspiration/[id]`, `DELETE /api/inspiration/[id]`) — auth + rate limit + zod validation; max 200 items per user; auto-fetch URL OG metadata on create
- [x] `POST /api/inspiration/[id]/to-post` endpoint — auth + rate limit; creates DRAFT post from item; optional `useAi` flag calls `generateInspiredContent` (AI-rewritten) or falls back to plain title+description
- [x] Add `generateInspiredContent(title, description, notes, platforms)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` with prompt caching on system block
- [x] Inspiration board page in dashboard (`/inspiration`) — masonry card grid with preview image, title, description, notes, platform badge, URL link; "Create Post" and "AI Inspire" buttons per card; inline add form
- [x] Add "Inspiration" to sidebar navigation
- [x] Unit tests for inspiration API (GET list, POST create with OG fetch, POST max-items, PATCH, DELETE, to-post without AI, to-post with AI, AI fallback — 15 tests)

### Phase 113: Audience Growth & Follower Tracking
- [x] `AudienceMetric` model in Prisma (id, accountId, followersCount Int?, followingCount Int?, syncedAt DateTime @default(now())) + migration (`20260616000000_add_audience_metrics`); add `audienceMetrics AudienceMetric[]` to SocialAccount model
- [x] Daily BullMQ audience sync worker (`src/lib/queue/workers/audience-sync.ts`) — for each active SocialAccount, fetches follower counts from Facebook (fan_count), Instagram (followers_count/follows_count), and Twitter (public_metrics) APIs; creates AudienceMetric records; skips other platforms gracefully; add `AUDIENCE_SYNC` to QUEUE_NAMES; add `scheduleAudienceSync()` to scheduler.ts (daily 05:00 UTC); register worker + cron in `workers/queue-worker.ts`
- [x] `GET /api/audience/metrics` endpoint — auth + rate limit; returns per-account 90-day time-series follower data; supports `?accountId=` filter; returns `{accounts: [{accountId, accountName, platform, metrics: [{syncedAt, followersCount, followingCount}]}]}`
- [x] `AudienceGrowthCard` component (`src/components/audience-growth-card.tsx`) — Recharts line chart of follower count over time; per-account toggle buttons; period selector (7d/30d/90d); "No data yet" empty state
- [x] Audience page in dashboard (`/audience`) — shows `AudienceGrowthCard` with all connected accounts
- [x] Add "Audience" to sidebar navigation
- [x] Unit tests for audience metrics API (auth, rate limit, no-filter returns all, accountId filter, empty result, account shape, metric shape, null followingCount, ascending sort, error — 10 tests)

### Phase 114: Social Account Groups
- [x] `AccountGroup` model in Prisma (id, userId, name, accountIds[], createdAt, updatedAt) + migration (`20260617000000_add_account_groups`)
- [x] CRUD API for account groups (`GET /api/account-groups`, `POST /api/account-groups`, `PATCH /api/account-groups/[id]`, `DELETE /api/account-groups/[id]`) — auth + rate limit + zod validation; max 20 groups per user; validate that accountIds belong to current user
- [x] Account groups management page in dashboard (`/account-groups`) — list groups with account chips, inline create form (name + multi-select accounts), edit name/accounts inline, delete
- [x] Group selector in post composer — compact dropdown above account toggles; selecting a group auto-selects all its accounts (does not deselect already selected accounts outside the group)
- [x] Add "Account Groups" to sidebar navigation
- [x] Unit tests for account groups API (GET list, POST create, PATCH update, DELETE — auth, rate limit, max-groups, ownership, validation, account ownership check — 14 tests)

### Phase 115: Evergreen Auto-Recycling Scheduler
- [x] Add `recycleInterval` (nullable Int, days) + `lastRecycledAt` (nullable DateTime) to Post model + Prisma migration (`20260618000000_add_evergreen_recycle_config`)
- [x] `PATCH /api/posts/[id]/recycle-config` endpoint — auth + rate limit + ownership; sets/clears `recycleInterval` on evergreen posts only; returns `{recycleInterval, lastRecycledAt}`
- [x] BullMQ evergreen recycle worker (`src/lib/queue/workers/evergreen-recycle.ts`) — daily cron 03:00 UTC; finds evergreen PUBLISHED posts where `recycleInterval` is set and (`lastRecycledAt` is null OR `lastRecycledAt` ≤ now − recycleInterval days); creates a new DRAFT copy via existing recycle logic; updates `lastRecycledAt`; logs activity; fires in-app notification
- [x] Add `EVERGREEN_RECYCLE` to `QUEUE_NAMES` in connection.ts; add `scheduleEvergreenRecycle()` to scheduler.ts; register worker + cron in `workers/queue-worker.ts`
- [x] `RecycleConfigButton` client component (`src/app/(dashboard)/posts/recycle-config-button.tsx`) — compact interval selector (Off / 7d / 14d / 30d / 60d / 90d) shown only for evergreen posts; calls PATCH endpoint on change; toast feedback
- [x] Integrate `RecycleConfigButton` into posts list row alongside `EvergreenButton` (visible when `isEvergreen` is true)
- [x] Unit tests for recycle-config endpoint and evergreen recycle worker logic (auth, ownership, non-evergreen rejection, set interval, clear interval, worker due detection, worker skips recent — 14 tests)
