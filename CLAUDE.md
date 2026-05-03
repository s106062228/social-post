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
