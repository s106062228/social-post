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

### Phase 116: Hashtag Performance Analytics
- [x] Hashtag analytics utility (`src/lib/hashtag-analytics.ts`) — `extractHashtags(content)` returns unique lowercased hashtags; `computeEngagementScore(insights)` applies weighted formula (likes×3 + comments×5 + shares×4 + reach×1 + impressions×0.5); `computeHashtagStats(posts, limit)` returns per-hashtag stats with postCount, aggregate metrics, and avgEngagement ranked descending
- [x] `GET /api/analytics/hashtags` endpoint — auth + rate limit + `?period=7d|30d|90d&platform=&limit=`; queries user's PUBLISHED posts with publishResults and PostInsights; returns top 30 hashtags ranked by avgEngagement with postCount and total metrics; `platform` filter scopes results to one platform
- [x] `HashtagPerformanceCard` component (`src/components/hashtag-performance-card.tsx`) — ranked list of top 15 hashtags with engagement progress bar, post count badge, per-hashtag metric breakdown (likes/comments/shares/reach), copy-to-clipboard button, period selector (7d/30d/90d), empty state
- [x] Integrate `HashtagPerformanceCard` into analytics dashboard page below the Word Cloud card
- [x] Unit tests for hashtag analytics utility and endpoint (extractHashtags, computeEngagementScore, computeHashtagStats, auth, rate limit, period filter, platform filter, empty state, response shape — 28 tests)

### Phase 117: Content Performance Predictions (AI)
- [x] Add `predictPostPerformance(content, platforms, historicalSummary)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to predict per-platform engagement (HIGH/MEDIUM/LOW) with confidence score, reasoning, and suggested improvements; uses prompt caching on system block
- [x] `POST /api/ai/predict-performance` endpoint — auth + rate limit + zod validation; queries user's recent PostInsights to build historical context summary; calls `predictPostPerformance`; returns `{predictions: PlatformPrediction[]}`; 503 when AI not configured
- [x] `PerformancePredictionCard` component (`src/components/performance-prediction-card.tsx`) — collapsible card with per-platform prediction badges (HIGH/MEDIUM/LOW with colour coding), confidence %, reasoning text, and improvement suggestions; 800 ms debounce; integrated into post composer below BrandComplianceIndicator
- [x] Unit tests for predict-performance API endpoint (auth, rate limit, AI disabled, missing content, empty platforms, success with no history, historical summary shape, multi-platform, AI error — 11 tests)

### Phase 118: Weekly Content Planner & Goal Integration
- [x] `GET /api/planner` endpoint — auth + rate limit + `?weekOf=YYYY-MM-DD` (defaults to current week); returns 7 days (Mon–Sun) of posts grouped by day (scheduledAt within the week), with per-day posting goal comparison (queries active PostingGoal model for DAILY goals + active WEEKLY goals); returns `{weekStart, weekEnd, days: [{date, dayOfWeek, posts: [...], dailyGoal: {target, achieved, onTrack} | null, weeklyGoal: {target, achieved, onTrack} | null}]}`
- [x] Planner page in dashboard (`/planner`) — 7-column week grid showing scheduled/published posts per day as compact cards (with truncated content + platform badges); daily goal progress bar per day column; prev/next week navigation with "Today" shortcut; weekly goal summary banner
- [x] `PlannerDayColumn` component (`src/components/planner-day-column.tsx`) — shows date header (Mon 16), goal progress bar (achieved/target or "No goal"), post cards with platform abbreviations and status colour chips, "+" add button linking to post composer
- [x] Add "Planner" to sidebar navigation (icon: `CalendarRange`)
- [x] Unit tests for planner API (auth, rate limit, defaults to 7 days, weekStart/weekEnd for known date, posts in correct day bucket, dailyGoal present, weeklyGoal present, null goals when no goals, day order Mon–Sun, invalid weekOf fallback — 10 tests)

### Phase 119: Post Collaboration Assignments
- [x] Add `assigneeId` (nullable String FK to User) to Post model + Prisma migration (`20260620000000_add_post_assignee`)
- [x] `PATCH /api/posts/[id]/assign` endpoint — auth + rate limit + ownership check; accepts `{assigneeId: string | null}` body; validates assignee exists; updates post; creates in-app notification to assignee when set; logs activity; returns `{assigneeId}`
- [x] Extend `GET /api/posts` to support `?assignee=me` filter — returns posts where assigneeId equals current user
- [x] `AssigneeSelector` client component (`src/app/(dashboard)/posts/assignee-selector.tsx`) — compact dropdown of all users; "Assign" button per post row; calls PATCH assign endpoint; toast feedback; optimistic UI
- [x] "Assigned to Me" filter tab in posts list page alongside existing status/starred/evergreen/archived tabs
- [x] Unit tests for assign endpoint (auth, rate limit, ownership, set assignee, clear assignee, nonexistent assignee, notification fired, invalid body — 10 tests)

### Phase 120: Dynamic Caption Variables (Merge Tags)
- [x] `CaptionVariable` model in Prisma (id, userId, key, value, description?, createdAt, updatedAt) + `@@unique([userId, key])` + migration (`20260621000000_add_caption_variables`)
- [x] CRUD API for caption variables (`GET /api/caption-variables`, `POST /api/caption-variables`, `PATCH /api/caption-variables/[id]`, `DELETE /api/caption-variables/[id]`) — auth + rate limit + zod validation; max 50 variables per user; key regex `[a-zA-Z0-9_]+`; 409 conflict on duplicate key
- [x] Caption variable utility (`src/lib/caption-variables.ts`) — `substituteVariables(content, vars)` replaces all `{{key}}` placeholders; `extractPlaceholders(content)` returns unique placeholder keys found in content
- [x] Integrate variable substitution into BullMQ publish worker — loads user's `CaptionVariable` records and calls `substituteVariables` on resolved content before publishing
- [x] Caption variables management page in dashboard (`/caption-variables`) — card grid with `{{key}}` → value display, copy-placeholder button, inline create form (key + value + optional description), edit-in-place, delete
- [x] "Insert Variable" dropdown in post composer — lists available variables; selecting one appends `{{key}}` to current post content
- [x] Add "Variables" to sidebar navigation (icon: `Braces`)
- [x] Unit tests for caption variable utility (`substituteVariables`, `extractPlaceholders` — 15 tests) and CRUD API (GET, POST, PATCH, DELETE — auth, rate limit, max-vars, key validation, duplicate conflict, ownership — 25 tests)

### Phase 121: AI-Powered Content Brief Generator
- [x] Add `generateContentBrief(topic, audience, goals, platforms)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` with prompt caching on system block; returns `{title, keyMessages: string[], tone, contentStructure: string[], hashtagSuggestions: string[], callToAction, estimatedLength: string}`
- [x] `POST /api/ai/content-brief` endpoint — auth + rate limit + zod validation; accepts `{topic: string, audience?: string, goals?: string, platforms: Platform[]}`; calls `generateContentBrief`; returns `{brief}`; 503 when AI not configured
- [x] `ContentBriefDialog` component (`src/components/content-brief-dialog.tsx`) — modal with topic, audience, goals inputs + platform checkboxes; calls `/api/ai/content-brief`; shows structured brief sections (key messages, tone, content structure, hashtags, CTA); "Apply to Composer" button fills post content with a draft based on the brief; copy-all button; loading/empty states
- [x] "Brief" button in post composer — opens `ContentBriefDialog`
- [x] Unit tests for `POST /api/ai/content-brief` (auth, rate limit, AI disabled, missing topic, empty platforms, success shape, AI error — 9 tests)

### Phase 122: Schedule Time Presets
- [x] `ScheduleTimePreset` model in Prisma (id, userId, name, hour, minute, daysOfWeek[], timezone) + migration (`20260622000000_add_schedule_time_presets`)
- [x] CRUD API for time presets (`GET /api/schedule-presets`, `POST /api/schedule-presets`, `DELETE /api/schedule-presets/[id]`) — auth + rate limit + zod validation; max 30 presets per user
- [x] Schedule time preset utility (`src/lib/schedule-time-presets.ts`) — `findNextOccurrence` computes next datetime ≥5 min from now matching hour/minute/daysOfWeek in timezone; `formatPresetLabel` human-readable summary; `toDatetimeLocal` formats Date for datetime-local input
- [x] `SchedulePresetSelector` component (`src/components/schedule-preset-selector.tsx`) — dropdown button that fetches user's presets and applies selected preset to the schedule datetime input via `findNextOccurrence`
- [x] Integrate `SchedulePresetSelector` into post composer — "Presets" dropdown button next to the datetime-local input in the Schedule section
- [x] Schedule presets management page in dashboard (`/schedule-presets`) — list presets with time/days/timezone, inline create form (name, hour, minute selector :00/:15/:30/:45, day-of-week toggle chips, timezone dropdown), delete
- [x] Add "Time Presets" to sidebar navigation (icon: `Clock`)
- [x] Unit tests for presets API (GET list, POST create, DELETE — auth, rate limit, max-presets, validation, CRUD shape — 12 tests) and utility (formatPresetLabel, toDatetimeLocal, findNextOccurrence — 10 tests)

### Phase 123: Content Calendar Year View & Heatmap
- [x] `GET /api/analytics/heatmap` endpoint — auth + rate limit + `?year=YYYY` param (defaults to current year); returns `{year, totalPosts, maxDay, days: [{date, count}]}` with a full 365/366-day array of post counts (PUBLISHED by updatedAt, SCHEDULED by scheduledAt)
- [x] `PostingHeatmapCard` component (`src/components/posting-heatmap-card.tsx`) — GitHub-contribution-style 52-week × 7-day grid; colour intensity proportional to post count (0=muted, 4 shades of green); month labels above columns; day-of-week labels on left; hover tooltip with date + count; year prev/next navigation; total posts count; legend
- [x] Integrate `PostingHeatmapCard` into analytics dashboard page below the Scheduling Advisor card
- [x] Unit tests for the heatmap API endpoint (auth, rate limit, invalid year, 365 days for non-leap year, 366 days for leap year, zero counts, published/scheduled date bucketing, day range boundaries — 9 tests)

### Phase 124: Social Account Health Dashboard
- [x] `GET /api/analytics/account-health` endpoint — auth + rate limit; for each of the user's active SocialAccounts computes: postsPublished30d, avgEngagementRate (avg (likes+comments+shares)/reach across PostInsights), followerGrowth30d (latest minus 30d-ago AudienceMetric followersCount), lastPublishedAt, daysSinceLastPost, healthScore (0–100: activity 0–50 + engagement 0–30 + recency 0–20); returns `{accounts: [{accountId, accountName, platform, isActive, healthScore, healthLabel, metrics}]}`
- [x] `AccountHealthCard` component (`src/components/account-health-card.tsx`) — grid of per-account cards, each showing: platform icon badge, account name, colour-coded health score circle (green ≥70 / yellow ≥40 / red <40), health label (Healthy/Fair/Needs Attention), metric chips (posts/30d, avg engagement %, follower growth, days since last post); empty state when no accounts connected
- [x] Account health page in dashboard (`/account-health`) — full-page view showing `AccountHealthCard`; summary banner with fleet-wide average health score
- [x] Add "Account Health" to sidebar navigation (icon: `HeartPulse`)
- [x] Unit tests for account-health API (auth, rate limit, no accounts, postsPublished30d count, avgEngagementRate calculation, followerGrowth with data, followerGrowth no data, healthScore bounds, healthLabel mapping, full response shape — 10 tests)

### Phase 125: Post Media Alt Text & Accessibility
- [x] Add `altTexts` (String[], default []) to Post model + Prisma migration (`20260623000000_add_post_alt_texts`)
- [x] Extend `PostContent` interface (`src/lib/platforms/types.ts`) to include `altTexts?: string[]`
- [x] Update Facebook adapter — pass `alt_text` field when uploading a single photo via `/{pageId}/photos`
- [x] Update Instagram adapter — pass `alt_text` field in single-image container creation params
- [x] Update Twitter adapter — call `POST /1.1/media/metadata/create` with `alt_text` after media upload when alt text is provided
- [x] Extend `POST /api/posts` and `PATCH /api/posts/[id]` zod schemas to accept optional `altTexts: string[]` (max 2200 chars per item, array length capped at 10)
- [x] `AltTextInput` component (`src/components/alt-text-input.tsx`) — one labelled textarea per media URL with character counter (max 2200 chars); compact, collapsible; integrated into post composer media section below the media URL list
- [x] Unit tests for alt text in posts API (POST create with altTexts saved, PATCH update altTexts, altTexts validation — 8 tests)

### Phase 126: AI-Generated Image Alt Text
- [x] Add `generateImageAltText(imageUrl, context?)` to `src/lib/ai.ts` — calls Claude AI (`claude-haiku-4-5`) vision feature to analyze the image and generate descriptive alt text (under 125 words); uses prompt caching on system block; returns `{altText: string}`
- [x] `POST /api/ai/alt-text` endpoint — auth + rate limit + AI check + zod validation (`imageUrl: string url`, `context?: string max 500 chars`); calls `generateImageAltText`; returns `{altText: string}`; returns 503 when AI not configured
- [x] Update `AltTextInput` component — add "Auto-generate" sparkle button per image field; calls `/api/ai/alt-text`; fills field on success; shows loading state; shows error toast on failure
- [x] Unit tests for alt-text endpoint (auth, rate limit, AI disabled, invalid JSON, missing imageUrl, invalid URL, success with altText, context forwarded, AI error — 8 tests)

### Phase 127: Media Asset Organization & Smart Tagging
- [x] Add `tags` (String[], default []) + `description` (nullable String) to MediaAsset model + Prisma migration (`20260624000000_add_media_asset_tags`)
- [x] Add `generateMediaTags(imageUrl)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to analyze image content and return up to 10 descriptive tags; uses prompt caching on system block; returns `{tags: string[]}`
- [x] `POST /api/media/[id]/tags` endpoint — auto-generate and save AI tags for a media asset; auth + rate limit + ownership check; returns `{tags: string[]}`; 503 when AI not configured
- [x] `PATCH /api/media/[id]` endpoint — update description and/or tags for a media asset; auth + rate limit + ownership check; zod validation; returns updated asset
- [x] Extend `GET /api/media` to support `?tag=` filter (match assets containing that tag) and `?search=` filter (match filename or description)
- [x] Media library UI updates — show tag chips on asset cards; tag filter input; description field in asset detail hover/modal; "Auto-tag" button per image asset
- [x] Unit tests for media tags and PATCH endpoint (auth, rate limit, AI disabled, not-found, ownership, success shape, search filter, tag filter — 14 tests)

### Phase 128: Dashboard Widget Customization
- [x] `DashboardWidget` model in Prisma (id, userId, widgetKey String, visible Boolean default true, position Int, createdAt, updatedAt) + `@@unique([userId, widgetKey])` + migration (`20260625000000_add_dashboard_widgets`)
- [x] `GET /api/dashboard-widgets` endpoint — returns per-user widget config; fills in defaults (all visible, sorted by position) when no rows exist; auth + rate limit
- [x] `PATCH /api/dashboard-widgets` endpoint — accepts `{widgets: [{widgetKey, visible, position}][]}`, upserts all rows in a transaction; returns updated config; auth + rate limit + zod validation
- [x] `DashboardCustomizeDialog` component (`src/components/dashboard-customize-dialog.tsx`) — modal with toggle-switch list for all 11 widget slots, "Show all" shortcut, calls PATCH on save
- [x] Update analytics dashboard — fetch widget config on mount via `useWidgetConfig` hook; wrap each section in `isVisible(key)` guard; add "Customize" button in header that opens `DashboardCustomizeDialog`
- [x] Unit tests for dashboard widgets API (GET returns defaults, GET returns stored values, GET all keys present, PATCH auth, PATCH rate limit, PATCH invalid key, PATCH saves config, PATCH visible:false — 10 tests)

### Phase 129: Smart Schedule Optimizer
- [x] Smart schedule utility (`src/lib/smart-schedule.ts`) — queries user's historical PostInsights + PublishResult publishedAt timestamps to find top-engagement (hour, dayOfWeek) slots; for each top slot finds the next unoccupied datetime within 14 days (skips occupied SCHEDULED posts ±15 min and blackout periods); returns top 3 `{datetime, reason, score}` suggestions
- [x] `POST /api/posts/suggest-schedule` endpoint — auth + rate limit + zod validation; accepts `{platforms?: Platform[], timezone?: string}`; calls smart schedule utility; returns `{suggestions: [{datetime: string, dayLabel: string, timeLabel: string, reason: string, score: number}]}`; returns empty array when no historical data
- [x] `SmartScheduleSuggestions` component (`src/components/smart-schedule-suggestions.tsx`) — collapsible "Suggested times" panel; lazy-loads on demand when user clicks "Suggest time" button; shows up to 3 datetime chips (day + time + reason tooltip); clicking a chip sets the parent scheduledAt; shows loading spinner; shows "No data yet" when suggestions is empty
- [x] Integrate `SmartScheduleSuggestions` into post composer — rendered below the datetime-local input row when at least one account is selected; passes `selectedPlatforms` and calls `setScheduledAt` on chip click
- [x] Unit tests for smart schedule utility and endpoint (empty history returns empty, top slot returned first, occupied slot skipped, blackout period skipped, auth required, rate limit enforced — 10 tests)

### Phase 130: Saved Analytics Views
- [x] `SavedAnalyticsView` model in Prisma (id, userId, name, reportType String, config Json, createdAt, updatedAt) + migration (`20260627000000_add_saved_analytics_views`)
- [x] CRUD API for saved analytics views (`GET /api/analytics/saved-views`, `POST /api/analytics/saved-views`, `DELETE /api/analytics/saved-views/[id]`) — auth + rate limit + zod validation; max 20 saved views per user
- [x] "Save View" button in analytics dashboard header — opens name dialog, captures current period as config, POSTs to saved-views endpoint
- [x] Saved views dropdown in analytics dashboard — lists saved views; applying one restores the saved period setting
- [x] Unit tests for saved analytics views API (GET list, POST create, POST max-limit, DELETE auth, DELETE not-found, DELETE ownership, DELETE success — 10 tests)

### Phase 131: Content Mix Analysis & Post Categorization
- [x] `ContentCategory` enum in Prisma (EDUCATIONAL, PROMOTIONAL, ENTERTAINING, ENGAGING, INSPIRING, NEWS, BEHIND_THE_SCENES, USER_GENERATED) + `contentCategory ContentCategory?` on Post model + migration (`20260628000000_add_content_category`)
- [x] Extend `POST /api/posts` and `PATCH /api/posts/[id]` zod schemas to accept optional `contentCategory` field
- [x] `GET /api/analytics/content-mix` endpoint — auth + rate limit + `?period=7d|30d|90d`; groups PUBLISHED posts by contentCategory (null → UNCATEGORIZED), returns count, percentage, avgEngagement (likes+comments+shares) sorted by count desc
- [x] `ContentMixCard` component (`src/components/content-mix-card.tsx`) — Recharts PieChart of category distribution, table with count/percentage/avgEngagement per category, period selector, "No data yet" empty state
- [x] Integrate `ContentMixCard` into analytics dashboard; add `"content_mix"` widget key to dashboard widget customization
- [x] Category selector in post composer — `<select>` below language selector with all 8 enum values; submitted with post creation body
- [x] Unit tests for content-mix endpoint (auth, rate limit, period validation, response shape, sort order, null→UNCATEGORIZED, avgEngagement calculation — 9 tests)

### Phase 132: Emergency Publishing Pause & Global Controls
- [x] Add `publishingPaused` (Boolean, default false) + `publishingPausedReason` (nullable String) + `publishingPausedAt` (nullable DateTime) to User model + Prisma migration (`20260629000000_add_publishing_pause`)
- [x] `GET /api/settings/publishing-pause` endpoint — returns `{paused, reason, pausedAt}`; auth + rate limit
- [x] `PATCH /api/settings/publishing-pause` endpoint — toggle or set pause state with optional reason (max 500 chars); auth + rate limit + zod validation; logs activity (publishing.paused / publishing.resumed); returns `{paused, reason, pausedAt}`
- [x] Update BullMQ publish worker — before publishing any post, check the user's `publishingPaused` flag; if true, re-queue the job with a 30-minute delay (up to 48h total); log warning
- [x] `PublishingPauseBanner` component (`src/components/publishing-pause-banner.tsx`) — red alert banner shown at the top of all dashboard pages when publishing is paused; displays reason + time paused; "Resume Publishing" button calls PATCH endpoint; fetched on mount
- [x] Integrate `PublishingPauseBanner` into dashboard layout
- [x] `PublishingControls` component (`src/app/(dashboard)/settings/publishing-controls.tsx`) — toggle switch + reason textarea card; integrated into Settings page
- [x] Unit tests for publishing pause API (GET default state, GET paused state, GET 404, PATCH pause with reason, PATCH pause without reason, PATCH resume clears fields, PATCH logs activity, PATCH invalid body, auth, rate limit — 12 tests)

### Phase 133: Bulk Tag Operations & Post Categorization Tools
- [x] `POST /api/posts/bulk-tag` endpoint — accepts `{postIds[], tagIds[], action: "add"|"remove"}`; auth + rate limit + zod validation; verifies tag ownership; skips PUBLISHING posts; upserts or removes PostTag rows; returns `{updated, skipped}`
- [x] `POST /api/posts/bulk-categorize` endpoint — accepts `{postIds[], contentCategory: ContentCategory | null}`; auth + rate limit + zod validation; updates contentCategory for all owned posts; returns `{updated}`
- [x] `BulkTagButton` client component (`src/app/(dashboard)/posts/bulk-tag-button.tsx`) — dialog with Add/Remove toggle, tag chip selector, calls bulk-tag endpoint; integrated into posts list bulk action bar
- [x] `BulkCategorizeButton` client component (`src/app/(dashboard)/posts/bulk-categorize-button.tsx`) — dialog with category list selector, calls bulk-categorize endpoint; integrated into posts list bulk action bar
- [x] Unit tests for bulk-tag endpoint (auth, rate limit, invalid JSON, missing action, tag not found, add tags + skip PUBLISHING, remove tags, all-PUBLISHING returns updated=0, multi-post multi-tag — 9 tests) and bulk-categorize endpoint (auth, rate limit, invalid JSON, invalid category, set category, clear category null, empty postIds, all valid categories — 8 tests)

### Phase 134: Content Moderation & Spam Detection
- [x] Add `moderateContent(content)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to analyze post content for spam, toxicity, misinformation, policy violations, and quality issues; returns `{safe: boolean, issues: {type, severity: "low"|"medium"|"high", description}[], score: number, reason?}`; uses prompt caching on system block
- [x] `POST /api/ai/moderate` endpoint — auth + rate limit + AI check + zod validation (`content: string min 1 max 10000`); calls `moderateContent`; returns moderation result; returns 503 when AI not configured
- [x] `ContentModerationBadge` component (`src/components/content-moderation-badge.tsx`) — compact badge (green "Safe" / severity-coloured "N issues") with expandable issue list showing severity dots, type labels, and overall reason; 800 ms debounce on content changes; loading "Checking…" state; hidden when content < 10 chars; integrated into post composer below BrandComplianceIndicator
- [x] Unit tests for content moderation endpoint (auth, rate limit, AI disabled, invalid JSON, missing content, safe result, flagged result with issues, AI error — 8 tests)

### Phase 135: Webhook Ping & Delivery Retry
- [x] Export `deliverWebhook` from `src/lib/webhook-dispatch.ts`; change return type to `Promise<{success, statusCode?, durationMs}>`; add `"ping"` to `WebhookEvent` union
- [x] `POST /api/webhook-configs/[id]/ping` endpoint — auth + rate limit + ownership check; sends a test `ping` event payload to the webhook URL; records a WebhookDelivery row; returns `{success, statusCode?, durationMs}`
- [x] `POST /api/webhook-configs/[id]/deliveries/[deliveryId]/retry` endpoint — auth + rate limit + ownership check via configId; looks up original delivery event; re-dispatches with `{_retried_from: deliveryId}` data; records a new WebhookDelivery row; returns `{success, statusCode?, durationMs}`
- [x] "Send Test Ping" button (⚡) per webhook config in webhooks page UI — shows animated state while pending; toasts delivery result (status code + duration)
- [x] "Retry" button per failed delivery row in delivery log — shows spinner while pending; toasts result; refreshes log after completion; hidden for successful deliveries
- [x] Add `"ping"` to `EVENT_LABELS` in webhooks-client component
- [x] Unit tests for ping endpoint and retry endpoint (auth, ownership, success, HTTP error, not found, mismatched config — 15 tests)

### Phase 136: Post Content Diff Viewer
- [x] Text diff utility (`src/lib/text-diff.ts`) — LCS-based word-level diff between two strings; exports `computeDiff(before, after): DiffChunk[]` and `diffStats(chunks)` returning `{added, removed, unchanged}` word counts
- [x] `GET /api/posts/[id]/versions/diff` endpoint — auth + rate limit + ownership; accepts `?from=versionId&to=versionId|"current"`; returns `{diff, stats, fromVersion, toVersion}`; 400 when params missing or invalid; 404 when version not found
- [x] `VersionDiffViewer` component (`src/components/version-diff-viewer.tsx`) — inline diff panel with green additions, red-strikethrough removals, grey unchanged; `+N / -N` stats badge in header; close button; integrated into post versions page
- [x] Update post versions page — add "Diff" button per version row comparing it to the current version; highlighted ring on the selected comparison version; diff viewer appears above the version list
- [x] Unit tests for text diff utility (empty strings, all-added, all-removed, identical, word substitution, appended/removed word, multiline, reconstruction invariant, diffStats — 16 tests) and diff endpoint (auth, rate limit, not-found, missing/invalid params, two-version diff, current target, reconstruction — 12 tests)

### Phase 137: Post Engagement Benchmarking & Industry Comparisons
- [x] Industry benchmark data utility (`src/lib/engagement-benchmarks.ts`) — defines per-platform industry-average engagement rates (FB: 0.64%, IG: 1.22%, TikTok: 5.53%, Twitter: 0.04%, LinkedIn: 0.35%, and 8 more); exports `computePerformance`, `computeBenchmarkComparisons`, `PLATFORM_BENCHMARKS`
- [x] `GET /api/analytics/benchmarks` endpoint — auth + rate limit + `?period=30d|90d|180d|all&platform=`; queries user's PUBLISHED PostInsights per platform; computes avgEngagementRate; compares to hardcoded benchmarks; classifies each platform as above/at/below/insufficient (insufficient when < 3 posts); returns `{period, comparisons, benchmarkedPlatforms}`
- [x] `BenchmarkCard` component (`src/components/benchmark-card.tsx`) — per-platform rows with your engagement rate vs industry benchmark, diff %, performance label (above/at/below/insufficient), period selector (30d/90d/180d/all), "No posts yet" empty state
- [x] Integrate `BenchmarkCard` into analytics dashboard; add `"benchmarks"` widget key to dashboard widget customization
- [x] Unit tests for engagement benchmarks utility (computePerformance above/at/below/null, diffPct, computeBenchmarkComparisons aggregation, avgEngagementRate, insufficient threshold, unknown platform, zero-reach, sort order — 14 tests) and API endpoint (auth, rate limit, period validation, platform filter, empty state, shape, insufficient, above/below classification, multi-platform, error — 14 tests)

### Phase 138: AI-Powered Batch Post Scheduling
- [x] `POST /api/ai/batch-schedule` endpoint — auth + rate limit + zod validation; accepts `{postIds: string[], timezone?: string}`; verifies ownership and DRAFT status for each post; calls `getSmartScheduleSuggestions` sequentially (updating DB between posts so each successive call sees prior slots as occupied); falls back to evenly-spaced daily slots at 10 AM local time when no historical data; updates each DRAFT post to `scheduledAt + status=SCHEDULED`; logs activity per post; returns `{scheduled: [{postId, scheduledAt, reason}], failed: [{postId, reason}]}`
- [x] `BatchScheduleDialog` component (`src/components/batch-schedule-dialog.tsx`) — modal showing count of selected DRAFT posts and a "Schedule All" CTA; calls `/api/ai/batch-schedule`; displays loading state; shows per-post results (green success with time / red failure with reason); "Done" closes dialog and refreshes list
- [x] `BatchScheduleButton` client component (`src/app/(dashboard)/posts/batch-schedule-button.tsx`) — renders in the bulk action bar when ≥2 DRAFT posts are selected; opens `BatchScheduleDialog` with the selected post IDs
- [x] Integrate `BatchScheduleButton` into `PostsListClient` bulk action bar alongside existing `BulkRescheduleButton` and `BulkDeleteButton`
- [x] Unit tests for batch-schedule endpoint (auth, rate limit, invalid JSON, empty postIds, non-draft rejection, non-owned rejection, success with smart-schedule mock, fallback when no history, partial success — 10 tests)

### Phase 139: Cross-Post Analytics Comparison
- [x] `GET /api/analytics/compare` endpoint — auth + rate limit + `?postId[]=` query params (2–5 post IDs); verifies ownership via userId in where clause; returns per-post engagement data with per-platform breakdown and aggregate totals; computes `winnerId` as the post with the highest engagement score (null when tied or all scores zero)
- [x] `PostComparisonDialog` component (`src/components/post-comparison-dialog.tsx`) — modal with side-by-side comparison table (Total Score, Impressions, Reach, Likes, Comments, Shares per post column); winner column highlighted with amber "Winner 🏆" badge; per-platform breakdown section; loading/error states; "No insights data" message when all metrics are zero
- [x] `ComparePostsButton` client component (`src/app/(dashboard)/posts/compare-posts-button.tsx`) — renders in the bulk action bar when 2–5 posts are selected; opens `PostComparisonDialog` with selected post IDs
- [x] Integrate `ComparePostsButton` into `PostsListClient` bulk action bar
- [x] Unit tests for compare endpoint (auth, rate limit, too few/many/no postIds, ownership filter, comparison shape, winnerId determination, winnerId null when all zero, per-platform breakdown — 10 tests)

### Phase 140: Post Content SEO Score & Optimization Hints
- [x] SEO analysis utility (`src/lib/seo-analysis.ts`) — checks post content against 6 optimization signals: content length (≥50 words), hashtag presence, hashtag count not excessive (≤10), link inclusion, avg sentence length (≤20 words), engagement trigger (question or CTA keyword); computes a 0–100 score; exports `analyzeSeo(content): SeoResult` and `seoScoreColor(score): string`
- [x] `GET /api/posts/[id]/seo` endpoint — auth + rate limit + ownership check; calls `analyzeSeo` on post content; returns `{score, label, checks}`
- [x] `SeoAnalysisCard` component (`src/components/seo-analysis-card.tsx`) — shows animated score ring (green/yellow/orange/red), score label, passed/total summary; expandable checklist with green checkmarks for passed checks and red × with hint text for failed checks; integrated into post versions page below insights panel
- [x] Unit tests for SEO analysis utility (empty content, min_length, hashtags_present, hashtags_not_excessive, has_link, readable_sentences, engagement_trigger, score 100, Excellent label, proportional score, seoScoreColor — 21 tests) and API endpoint (auth, rate limit, invalid ID, not-found, wrong user, success shape, content forwarded to utility, 500 on DB error — 8 tests)

### Phase 141: Multi-Platform Thread & Carousel Post Builder
- [x] `ThreadPost` model in Prisma (id, postId, order, content, mediaUrls[], mediaType) + migration (`20260630000000_add_thread_posts`) — stores individual follow-up items for multi-part posts
- [x] CRUD API for thread items (`GET /api/posts/[id]/threads`, `POST /api/posts/[id]/threads`, `PUT /api/posts/[id]/threads` bulk-replace, `PATCH /api/posts/[id]/threads/[threadId]`, `DELETE /api/posts/[id]/threads/[threadId]`) — auth + rate limit + zod validation; max 25 items per PUT
- [x] Extend `PostContent` interface (`src/lib/platforms/types.ts`) to include optional `threadItems?: ThreadItem[]` field
- [x] Update Twitter adapter — `publishSingleTweet` private helper; `publishThread` chains reply tweets; main `publish` method publishes first tweet then replies for each `threadItems` entry
- [x] `ThreadBuilder` component (`src/components/thread-builder.tsx`) — collapsible multi-item editor with per-item textarea, character counter (per `charLimit`), order controls (move up/down), add/remove items; shown in post composer when Twitter/X is selected
- [x] Integrate `ThreadBuilder` into post composer — shown below first-comment section when Twitter is in selected platforms; saves thread items via `PUT /api/posts/[id]/threads` after post creation
- [x] Update BullMQ publish worker — loads `ThreadPost` records for Twitter platform and passes them as `threadItems` in `PostContent`
- [x] Unit tests for thread API (GET list, POST create with auto-order, POST with explicit order, PUT bulk-replace, PUT max-items, PATCH update content, PATCH no-fields, PATCH ownership, DELETE success, DELETE ownership, auth + rate limit — 20 tests) and Twitter adapter thread publishing (thread reply chain, solo publish without items — 2 tests)

### Phase 142: AI Spell Check & Grammar Suggestions
- [x] Add `checkGrammar(content)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to check spelling and grammar; returns `{correctedContent: string, suggestions: {original: string, replacement: string, explanation: string}[], issueCount: number}`; uses prompt caching on system block; returns original content unchanged when AI not configured
- [x] `POST /api/ai/grammar-check` endpoint — auth + rate limit + AI check + zod validation (`content: string min 1 max 10000`); calls `checkGrammar`; returns grammar check result; returns 503 when AI not configured
- [x] `GrammarCheckButton` component (`src/components/grammar-check-button.tsx`) — button with spellcheck icon in post composer toolbar; calls `/api/ai/grammar-check` with current content; shows loading state; on result, opens `GrammarSuggestionsDialog`
- [x] `GrammarSuggestionsDialog` component (`src/components/grammar-suggestions-dialog.tsx`) — modal showing: corrected content preview, list of individual suggestions (original → replacement + explanation), "Apply All Corrections" button that replaces content with correctedContent, individual "Apply" buttons per suggestion, close button
- [x] Unit tests for grammar-check endpoint (auth, rate limit, AI disabled, invalid JSON, missing content, content too long, success with suggestions, success with no issues, AI error — 9 tests)

### Phase 143: AI-Powered Hashtag Research & Discovery
- [x] Add `researchHashtags(topic, platforms, count)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to research and suggest relevant hashtags for a topic; returns `{hashtags: {tag: string, category: "niche"|"medium"|"popular", estimatedReach: "low"|"medium"|"high", relevanceScore: number}[]}`; uses prompt caching on system block; returns empty array when AI not configured
- [x] `POST /api/ai/research-hashtags` endpoint — auth + rate limit + zod validation (`topic: string min 2 max 200`, `platforms: Platform[]`, `count?: number 5–50 default 20`); calls `researchHashtags`; returns `{hashtags}`; 503 when AI not configured
- [x] `HashtagResearchDialog` component (`src/components/hashtag-research-dialog.tsx`) — modal with topic input, platform multi-select chips, count slider (5–50); calls `/api/ai/research-hashtags`; shows results grouped by category (Popular / Medium / Niche) with reach badge; per-hashtag copy button and "Add to Post" checkbox; "Insert Selected" button appends checked hashtags to post content; "Save as Group" button creates a new HashtagGroup via `POST /api/hashtags`
- [x] "Research Hashtags" button (search + hash icon) in post composer hashtag section — opens `HashtagResearchDialog` with current platforms pre-selected
- [x] Unit tests for `POST /api/ai/research-hashtags` (auth, rate limit, AI disabled, missing topic, empty platforms, count out of range, success shape with categories, AI error — 12 tests)

### Phase 144: AI Writing Personas
- [x] `AiPersona` model in Prisma (id, userId, name, description?, writingStyle, tone, audienceDescription?, exampleContent?, createdAt, updatedAt) + migration (`20260701000000_add_ai_personas`) — stores reusable writing style profiles per user
- [x] CRUD API for AI personas (`GET /api/ai-personas`, `POST /api/ai-personas`, `PATCH /api/ai-personas/[id]`, `DELETE /api/ai-personas/[id]`) — auth + rate limit + zod validation; max 10 personas per user
- [x] Extend `generateContentVariants` in `src/lib/ai.ts` to accept optional `AiPersonaContext` — when persona provided, injects writing style, audience, and example content into the prompt
- [x] Update `POST /api/ai/suggest` to accept optional `personaId` — loads persona from DB and passes to `generateContentVariants`
- [x] AI Personas management page in dashboard (`/ai-personas`) — list personas with tone badge, writing style preview, expandable example content, inline create/edit (name, description, writing style, tone, audience, example) + delete
- [x] Persona selector in post composer AI Suggest dialog — dropdown of user's personas; selecting one auto-sets the tone field; persona context is sent with content generation request
- [x] Add "AI Personas" to sidebar navigation (icon: `Bot`)
- [x] Unit tests for AI personas API (GET list, POST create, POST max-limit, POST invalid body, PATCH update, PATCH not-found, DELETE success, DELETE not-found, DELETE ownership, auth, rate limit — 19 tests)

### Phase 145: Content Gap Analysis & AI Topic Suggestions
- [x] Add `suggestContentGaps(coveredTopics, platforms, brandKitContext?)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to suggest underexplored content topics based on what the user has already posted; uses prompt caching on system block; returns `{suggestions: {topic, reason, priority: "high"|"medium"|"low", contentIdea}[]}`
- [x] `POST /api/ai/content-gaps` endpoint — auth + rate limit + AI check; queries user's last 90 days of PUBLISHED posts, extracts top topics via word-frequency utility, fetches optional brand kit context; calls `suggestContentGaps`; returns `{suggestions, coveredTopicsCount}`; 503 when AI not configured
- [x] `ContentGapCard` component (`src/components/content-gap-card.tsx`) — shows covered topics count, AI-suggested topics as priority-badged cards with topic name, reason, and content idea; "Create Post" link per suggestion; "Refresh" button; loading/empty states
- [x] Integrate `ContentGapCard` into analytics dashboard below `BenchmarkCard`; add `"content_gaps"` widget key to dashboard widget customization
- [x] Unit tests for content gaps endpoint (auth, rate limit, AI disabled, success shape, empty suggestions, coveredTopicsCount 0, topics extracted from posts, brand kit context passed, brand kit absent, DB error — 10 tests)

### Phase 146: AI Content Tone Analyzer & Brand Voice Consistency
- [x] Add `tone` (nullable String) + `toneTraits` (String[], default []) to Post model + Prisma migration (`20260703000000_add_post_tone`)
- [x] Add `analyzeTone(content)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to identify tone (professional/casual/humorous/inspirational/educational/urgent/friendly/authoritative) with confidence score and key traits; uses prompt caching on system block; returns `{tone: string, confidence: number, traits: string[]}`
- [x] `POST /api/posts/[id]/analyze-tone` endpoint — auth + rate limit + ownership check; calls AI service; persists `tone` + `toneTraits`; returns `{tone, toneTraits}`; returns 503 when AI not configured
- [x] Extend `GET /api/posts` to support `?tone=` filter (exact match on stored tone field)
- [x] `GET /api/analytics/tone-consistency` endpoint — auth + rate limit + `?period=7d|30d|90d`; reads stored tone data from PUBLISHED posts in period; computes consistency score (% posts matching dominant tone), dominant tone, and tone distribution; returns `{consistency, dominantTone, toneDistribution, analyzedPosts, totalPosts}`
- [x] `ToneConsistencyCard` component (`src/components/tone-consistency-card.tsx`) — consistency score progress bar, dominant tone badge, distribution bar chart using Recharts, period selector, "No data" empty state; integrated into analytics dashboard
- [x] `AnalyzeToneButton` client component in posts list row — calls `POST /api/posts/[id]/analyze-tone`, toasts result, refreshes; visible on all posts
- [x] `ToneBadge` component in posts list row — coloured chip showing detected tone when `post.tone` is set
- [x] Add `"tone_consistency"` widget key to dashboard widget customization
- [x] Unit tests for analyze-tone endpoint (auth, rate limit, AI disabled, not-found, ownership, success shape, error — 8 tests) and tone-consistency endpoint (auth, rate limit, period validation, empty state, distribution shape, consistency calculation — 8 tests)

### Phase 147: AI Auto-Tagging & Smart Tag Suggestions
- [x] Add `suggestTagsForContent(content, existingTags)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to match post content against user's existing tag names and suggest the most relevant ones (up to 5); also returns new tag name suggestions when no existing tags match well; uses prompt caching on system block; returns `{suggestions: {tagId?: string, name: string, reason: string, isNew: boolean}[]}`
- [x] `POST /api/posts/[id]/suggest-tags` endpoint — auth + rate limit + ownership check; loads user's existing tags; calls `suggestTagsForContent`; returns `{suggestions}`; 503 when AI not configured
- [x] `POST /api/posts/bulk-auto-tag` endpoint — auth + rate limit + zod validation; accepts `{postIds: string[], applyTopN?: number default 3}`; for each owned post calls `suggestTagsForContent`, creates missing tags, applies top N tag suggestions as PostTag records; returns `{tagged, created, skipped}`
- [x] `AutoTagButton` client component (`src/app/(dashboard)/posts/auto-tag-button.tsx`) — button per post row that calls suggest-tags endpoint, shows suggestions dialog with checkboxes, applies selected tags via existing `POST /api/posts/[id]` PATCH or tag endpoints; toast feedback; optimistic UI
- [x] "Auto-tag All" bulk action in posts list — appears in bulk action bar when posts are selected; calls bulk-auto-tag endpoint; shows result toast with counts
- [x] Unit tests for suggest-tags endpoint (auth, rate limit, AI disabled, not-found, ownership, success shape, empty tags list, new tag suggestions — 10 tests) and bulk-auto-tag endpoint (auth, rate limit, invalid JSON, empty postIds, ownership filter, applyTopN, tag creation, skips publishing posts — 10 tests)

### Phase 148: Post Quality Score Dashboard
- [x] Quality score utility (`src/lib/quality-score.ts`) — aggregates readability (FK score), SEO score, sentiment mapping (POSITIVE=100/NEUTRAL=65/NEGATIVE=30), and brand compliance score into a weighted 0-100 quality score; exports `computeQualityScore(signals: QualitySignals): QualityScore` and `qualityLabel(score)`
- [x] `GET /api/posts/[id]/quality` endpoint — auth + rate limit + ownership check; runs readability + SEO synchronously and fetches post sentiment + brand kit in parallel; returns `{qualityScore, label, breakdown: {readability, seo, sentiment, compliance}}`
- [x] `QualityScoreBadge` component (`src/components/quality-score-badge.tsx`) — compact coloured pill (green ≥80 / yellow ≥60 / orange ≥40 / red <40) showing aggregate quality score; shown per post row in posts list when quality data is available; fetches lazily on hover
- [x] `QualityDashboard` component (`src/components/quality-dashboard.tsx`) — expandable panel showing all four quality signal breakdowns with score bars and labels; "Refresh" button re-fetches; integrated into post versions page below SeoAnalysisCard
- [x] Unit tests for quality score utility and API endpoint (score calculation, label boundaries, null signals normalised, auth, rate limit, ownership, response shape, all signals present — 12 tests)

### Phase 149: Drag-and-Drop Calendar Rescheduling
- [x] Install `@dnd-kit/core` package for drag-and-drop primitives
- [x] `useCalendarReschedule` hook (`src/hooks/use-calendar-reschedule.ts`) — manages local post state, exposes `handleDrop(postId, year, month, day)` which calls `PATCH /api/posts/[id]` with updated `scheduledAt` (preserving original time-of-day), performs optimistic update with rollback on error; `isDraggable(postId)` returns true only for DRAFT and SCHEDULED posts
- [x] Update `CalendarView` component — wrap in `DndContext`; post cards become draggable via `useDraggable` (cursor-grab, opacity-50 when dragging, disabled for non-reschedulable statuses); day cells become droppable via `useDroppable` (highlight with blue tint on hover); `DragOverlay` shows a ghost card while dragging; on drag end calls `handleDrop` and shows toast feedback
- [x] Unit tests for `useCalendarReschedule` hook (initial state, successful drop updates scheduledAt, failed API call rolls back, fetch exception rolls back, unknown postId is no-op, preserves time-of-day, isDraggable true for DRAFT/SCHEDULED, isDraggable false for PUBLISHED — 8 tests)

### Phase 150: Interactive Onboarding Tour & Feature Walkthrough
- [x] `TourProgress` model in Prisma (id, userId unique, completedSteps String[], dismissed Boolean default false, createdAt, updatedAt) + migration (`20260704000000_add_tour_progress`)
- [x] `GET /api/tour` endpoint — returns `{completedSteps, dismissed, totalSteps}`; creates default row if none exists; auth + rate limit
- [x] `PATCH /api/tour` endpoint — accepts `{completedStep?: string, dismissed?: boolean}`; upserts TourProgress; auth + rate limit + zod validation
- [x] `TOUR_STEPS` constant + `TourStep` type in `src/lib/tour.ts` — defines 10 key dashboard features with `key`, `title`, `description`, `targetPath`, `icon`
- [x] `useTour` hook (`src/hooks/use-tour.ts`) — fetches progress on mount; exposes `currentStep`, `isActive`, `start()`, `next()`, `prev()`, `skip()`, `completedSteps`, `totalSteps`, `progressPercent`
- [x] `ProductTour` component (`src/components/product-tour.tsx`) — fixed bottom-right floating card showing current step title/description, step N/M counter, prev/next/skip/finish buttons; step progress dots; uses `useTour` hook
- [x] "Take Tour" button in dashboard header (next to notification bell) — starts tour; hidden when tour dismissed; shows completed badge when all steps done
- [x] Unit tests for tour API (GET defaults for new user, GET with progress, PATCH complete step appends to array, PATCH dismiss sets flag, PATCH invalid body, auth, rate limit — 10 tests)

### Phase 151: Social Media Poll Builder & Interactive Content
- [x] `PostPoll` model in Prisma (id, postId unique, question, options String[], durationHours Int default 24, createdAt) + migration (`20260705000000_add_post_poll`) — one poll per post
- [x] Extend `PostContent` interface (`src/lib/platforms/types.ts`) to include optional `poll?: { question: string; options: string[]; durationHours: number }`
- [x] Update Twitter adapter — when `post.poll` is present, include `poll: { options, duration_minutes }` field in tweet creation body; throw error when poll has <2 or >4 options; falls back to regular tweet when no poll
- [x] Update LinkedIn adapter — when `post.poll` is present, include `specificContent.com.linkedin.ugc.ShareContent.media` poll block via LinkedIn Poll API; falls back to regular post when no poll
- [x] `PollBuilder` component (`src/components/poll-builder.tsx`) — collapsible section in post composer shown when Twitter or LinkedIn accounts are selected; question input (max 140 chars); 2–4 dynamic option inputs (add/remove, max 25 chars each); duration selector (1h / 6h / 24h / 72h / 168h); minimum 2 options enforced
- [x] Extend `POST /api/posts` and `PATCH /api/posts/[id]` zod schemas to accept optional `poll: { question, options: string[] (2–4), durationHours }` field; persist as `PostPoll` record
- [x] CRUD API for post polls (`GET /api/posts/[id]/poll`, `PUT /api/posts/[id]/poll`, `DELETE /api/posts/[id]/poll`) — auth + rate limit + ownership check; PUT upserts poll; returns poll data
- [x] Update BullMQ publish worker — loads `PostPoll` record and passes as `poll` field in `PostContent` for each platform
- [x] Unit tests for poll CRUD API (GET, PUT create, PUT update, DELETE — auth, rate limit, not-found, ownership, option count validation — 10 tests) and adapter poll tests (Twitter with poll, Twitter poll option limits, LinkedIn with poll, LinkedIn fallback without poll — 8 tests)

### Phase 152: Enhanced Home Dashboard with Activity Summary & Quick Actions
- [x] `GET /api/dashboard/home` endpoint — auth + rate limit; returns `{stats: {totalPosts, scheduledCount, publishedThisWeek, failedCount, connectedAccounts, draftsCount}, upcomingPosts: (next 5 SCHEDULED posts with platform info), failedPosts: (last 5 FAILED posts), recentActivity: (last 5 ActivityLog entries), platformBreakdown: ({platform, publishedCount}[])}`
- [x] `UpcomingPostsCard` component (`src/components/upcoming-posts-card.tsx`) — lists next 5 SCHEDULED posts with platform icon chips, relative countdown ("in 2h 30m"), content preview (truncated to 60 chars), and a quick "Edit" link
- [x] `FailedPostsAlert` component (`src/components/failed-posts-alert.tsx`) — amber alert card listing up to 5 FAILED posts with content preview, failed platform chips, and a "Retry" button per post (calls `POST /api/posts/[id]/retry`); hidden when no failed posts
- [x] `PlatformPublishBreakdown` component (`src/components/platform-publish-breakdown.tsx`) — compact horizontal bar chart (using CSS widths, no external chart lib) showing published post counts per platform for the last 30 days; "No data yet" empty state
- [x] Replace static dashboard home page with enhanced version — uses `GET /api/dashboard/home` endpoint; integrates all new components alongside existing stats cards and recent posts; adds "Failed Posts" section above recent posts when failures exist
- [x] Unit tests for home dashboard API (auth, rate limit, stats shape, upcomingPosts ordered by scheduledAt asc, failedPosts ordered by updatedAt desc, recentActivity count, platformBreakdown shape, empty state when no posts — 10 tests)

### Phase 153: Post Writing Style Analytics
- [x] Writing stats utility (`src/lib/writing-stats.ts`) — `analyzeWritingStats(posts)` computes: avgWordCount, avgCharCount, avgHashtagCount, avgSentenceCount, postsWithLinksPercent, postsWithEmojisPercent, topEmojis (up to 10), postingDayDistribution (Sun–Sat counts), postingHourDistribution (0–23 counts)
- [x] `GET /api/analytics/writing-stats` endpoint — auth + rate limit + `?period=30d|90d|180d|all`; queries user's PUBLISHED posts; returns `{period, totalPosts, avgWordCount, avgCharCount, avgHashtagCount, avgSentenceCount, postsWithLinksPercent, postsWithEmojisPercent, topEmojis, postingDayDistribution, postingHourDistribution}`
- [x] `WritingStatsCard` component (`src/components/writing-stats-card.tsx`) — stat grid (avg words, avg chars, avg hashtags, links %, emojis %), top emojis badge row, posting day bar chart (Recharts), period selector (30d/90d/180d/all), "No data yet" empty state
- [x] Integrate `WritingStatsCard` into analytics dashboard below ToneConsistencyCard; add `"writing_stats"` widget key to dashboard widget customization
- [x] Unit tests for writing stats utility (avgWordCount, avgHashtagCount, emoji detection, link detection, day/hour distribution, empty input — 8 tests) and API endpoint (auth, rate limit, period validation, response shape, empty state — 8 tests)

### Phase 154: Monthly Content Summary Dashboard
- [x] `GET /api/analytics/monthly-summary` endpoint — auth + rate limit + `?year=YYYY&month=1-12` params (defaults to current month); returns `{year, month, totalPosts, byStatus: Record<string, number>, byPlatform: {platform, count}[], avgPostsPerDay, busiestDay: {date, count} | null, quietDays: number, weekdayDistribution: {dayName, count}[]}` from PUBLISHED + SCHEDULED posts in the specified month
- [x] `MonthlySummaryCard` component (`src/components/monthly-summary-card.tsx`) — shows month/year title with prev/next navigation, total posts KPI, status breakdown progress bars, platform distribution chips, busiest day callout, avg posts/day, weekday distribution bar chart (Recharts); "No posts this month" empty state
- [x] Integrate `MonthlySummaryCard` into analytics dashboard below `WritingStatsCard`; add `"monthly_summary"` widget key to WIDGET_KEYS array in `src/app/api/dashboard-widgets/route.ts`
- [x] Unit tests for monthly-summary endpoint (auth, rate limit, invalid params, defaults to current month, response shape, busiest day, quietDays count, weekday distribution, empty month, SCHEDULED posts use scheduledAt — 10 tests)

### Phase 155: AI Performance Coaching & Weekly Insights
- [x] `CoachingInsight` model in Prisma (id, userId, weekOf DateTime, summary String, highlights String[], improvements String[], nextWeekFocus String, overallScore Int, createdAt) + migration (`20260706000000_add_coaching_insights`) — stores per-user weekly AI coaching reports
- [x] Add `generatePerformanceCoaching(metrics, goals, recentInsights)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` with aggregated weekly metrics (posts published, avg engagement, top/bottom performers), active PostingGoal progress, and top 5 PostInsights; returns `{summary, highlights: string[], improvements: string[], nextWeekFocus: string, overallScore: number}`; uses prompt caching on system block; returns null when AI not configured
- [x] `POST /api/ai/performance-coaching` endpoint — auth + rate limit + AI check; queries last 7 days PostInsights and PostingGoals progress; calls `generatePerformanceCoaching`; stores result in `CoachingInsight`; returns `{coaching, weekOf}`; 503 when AI not configured
- [x] `GET /api/ai/performance-coaching` endpoint — auth + rate limit; returns most recent `CoachingInsight` for the current user; returns `{coaching: null}` when none exists
- [x] BullMQ coaching worker (`src/lib/queue/workers/coaching.ts`) — weekly cron Sunday 01:00 UTC; for each user with at least 3 PUBLISHED posts in the past 7 days, generates coaching insights and stores them; add `COACHING_SCAN` to `QUEUE_NAMES`; add `scheduleCoachingScan()` to scheduler.ts; register worker + cron in `workers/queue-worker.ts`
- [x] `PerformanceCoachingCard` component (`src/components/performance-coaching-card.tsx`) — collapsible card showing overall score badge, AI-generated summary, bullet highlights, improvement suggestions, and next-week focus; "Regenerate" button calls POST endpoint; "No insights yet" empty state with "Generate Now" CTA; integrated into analytics dashboard below `MonthlySummaryCard`
- [x] Add `"performance_coaching"` widget key to `WIDGET_KEYS` array and `DashboardCustomizeDialog`
- [x] Unit tests for performance coaching endpoints (GET empty, GET with data, POST auth, POST rate limit, POST AI disabled, POST success shape, POST stores insight, POST AI error — 10 tests)

### Phase 156: Platform Publishing Reliability & Error Analytics
- [x] Publishing reliability utility (`src/lib/publish-reliability.ts`) — `computePlatformReliability(results)` groups PublishResult records by platform; for each platform computes successRate (0–100), totalAttempts, successCount, failedCount, avgRetryCount, commonErrors (top 3 error messages sorted by frequency), avgPublishLatencyMs (avg time from post.scheduledAt to publishedAt for PUBLISHED results with both timestamps); returns array sorted by totalAttempts descending
- [x] `GET /api/analytics/publish-reliability` endpoint — auth + rate limit + `?period=7d|30d|90d|all` (default 30d); queries PublishResult records for the user's posts filtered by status PUBLISHED/FAILED and date range; calls `computePlatformReliability`; returns `{period, platforms: PlatformReliabilityData[], overallSuccessRate, totalPublished, totalFailed}`
- [x] `PlatformReliabilityCard` component (`src/components/platform-reliability-card.tsx`) — overall success rate summary box, per-platform rows with colour-coded progress bars (green ≥90% / yellow ≥70% / red <70%), success/fail counts, avg retry badge, avg publish latency, expandable common error list; period selector (7d/30d/90d/all); loading skeleton; empty state
- [x] Integrate `PlatformReliabilityCard` into analytics dashboard below `PerformanceCoachingCard`; add `"publish_reliability"` widget key and label to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route
- [x] Unit tests for `GET /api/analytics/publish-reliability` (auth, rate limit, invalid period, default period, empty state shape, overall success rate calculation, per-platform shape, common errors captured, avg latency calculation, sort order, DB error — 11 tests)

### Phase 157: User Achievements & Posting Milestones
- [x] `Achievement` model in Prisma (id, userId, type String, awardedAt DateTime, metadata Json?) + migration (`20260707000000_add_achievements`) + `@@unique([userId, type])`
- [x] Achievement types constant map + checker utility (`src/lib/achievements.ts`) — defines 10 milestone types (FIRST_POST, TEN_POSTS, FIFTY_POSTS, HUNDRED_POSTS, FIRST_PUBLISH, FIRST_SCHEDULE, MULTI_PLATFORM, CONSISTENT_POSTER, HIGH_ENGAGER, FIRST_CAMPAIGN); `checkAndAwardAchievements(userId, db)` queries user stats and awards new achievements; returns `string[]` of newly awarded types; never throws
- [x] `GET /api/achievements` endpoint — auth + rate limit; returns all achievement types with earned status, awardedAt for earned ones, label/description/icon metadata sorted alphabetically
- [x] `POST /api/achievements/check` endpoint — auth + rate limit; calls `checkAndAwardAchievements`; returns `{ awarded: string[] }`
- [x] Achievements page in dashboard (`/achievements`) — grid of achievement cards (earned: coloured + green border + award date; locked: dimmed + dashed border); "Check for new achievements" button with toast feedback
- [x] Add "Achievements" to sidebar navigation (icon: `Award`)
- [x] Unit tests for achievements API (GET 401, GET 429, GET all-unearned, GET earned with awardedAt, GET shape; POST 401, POST 429, POST empty awarded, POST awarded list, POST correct userId — 10 tests)

### Phase 158: AI-Powered Engagement Reply Suggestions
- [x] Add `generateReplySuggestions(postContent, comment, tone?)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to generate 3 thoughtful reply suggestions for a given comment on a post; uses prompt caching on system block; returns `string[]`
- [x] `POST /api/ai/reply-suggestions` endpoint — auth + rate limit (20/min) + zod validation (`postContent`, `comment`, `tone?`); calls `generateReplySuggestions`; returns `{replies: string[]}`; returns 503 when AI not configured
- [x] `ReplySuggestionsDialog` component (`src/components/reply-suggestions-dialog.tsx`) — modal showing 3 AI-generated reply suggestions with copy-to-clipboard buttons, regenerate option, and loading state
- [x] Integrate "AI Reply" button (Sparkles icon) into `PostComments` component — opens `ReplySuggestionsDialog` for that specific comment; passes post content and comment text
- [x] Unit tests for reply-suggestions endpoint (auth, rate limit, AI disabled, invalid JSON, missing fields, success shape, AI error — 8 tests)

### Phase 159: Content Fatigue Detection & Audience Refresh Alerts
- [x] Content fatigue utility (`src/lib/content-fatigue.ts`) — `detectContentFatigue(posts)` compares recent 7-day avg engagement to prior 23-day baseline per platform; computes `fatigueScore` (0–100, 100 = healthy), `isFatigued` (score ≤70), and `trend` (improving/stable/declining); returns `{overallFatigued, platforms: PlatformFatigueData[], analyzedAt}`
- [x] `GET /api/analytics/content-fatigue` endpoint — auth + rate limit + optional `?platform=` filter; queries user's PUBLISHED posts with PostInsights from last 30 days; returns fatigue analysis result
- [x] `ContentFatigueCard` component (`src/components/content-fatigue-card.tsx`) — overall health banner (green healthy / amber declining / red fatigued), per-platform rows with score progress bar, trend arrow icon, recent vs baseline engagement numbers, post counts; "No data yet" empty state; integrated into analytics dashboard below `PlatformReliabilityCard`
- [x] Add `"content_fatigue"` widget key and label to `WIDGET_KEYS`, `WIDGET_LABELS`, and `DashboardCustomizeDialog`
- [x] Unit tests for content fatigue utility (empty posts, improving trend, stable trend, declining trend, fatigued threshold at 70%, no baseline returns neutral, overall fatigued flag, platform filter — 10 tests) and API endpoint (auth, rate limit, platform filter, response shape, fatigued state — 6 tests)

### Phase 160: Analytics Performance Snapshots & Historical Comparison
- [x] `AnalyticsSnapshot` model in Prisma (id, userId, name, data Json, createdAt) + migration (`20260708000000_add_analytics_snapshots`) — stores point-in-time performance metric snapshots per user
- [x] `GET /api/analytics/snapshots` endpoint — lists user's snapshots ordered by createdAt desc; auth + rate limit
- [x] `POST /api/analytics/snapshots` endpoint — creates snapshot capturing current metrics (post counts by status, publish results, platform breakdown, connected accounts, success rate); auth + rate limit + zod validation; max 20 snapshots per user
- [x] `DELETE /api/analytics/snapshots/[id]` endpoint — deletes snapshot with ownership check; auth + rate limit; returns 204
- [x] `GET /api/analytics/snapshots/compare` endpoint — accepts `?from=id&to=id`; returns delta comparison with `{from, to, change, changePct}` for each key metric (totalPosts, publishedPosts, failedPosts, scheduledPosts, draftPosts, overallSuccessRate, connectedAccounts); auth + rate limit
- [x] Snapshots page in dashboard (`/analytics/snapshots`) — list view with create button, click-to-select A/B comparison, side-by-side delta grid with colour-coded change indicators, delete button per snapshot
- [x] Add "Snapshots" to sidebar navigation (icon: `Camera`) after Analytics entry
- [x] Unit tests for snapshots API (GET list auth/rate limit/data, POST auth/rate limit/invalid body/max-limit/success/captured metrics, DELETE auth/rate limit/404/204, GET compare auth/rate limit/missing params/404/deltas/null changePct — 21 tests)

### Phase 161: Post Content Checklist & Pre-publish Validation
- [x] `ChecklistItem` model in Prisma (id, userId, label, description?, order, isActive, createdAt, updatedAt) + `PostChecklistRecord` model (id, postId unique, userId, checks Json, updatedAt) + migration (`20260709000000_add_checklist`)
- [x] CRUD API for checklist items (`GET /api/checklist-items`, `POST /api/checklist-items`, `PATCH /api/checklist-items/[id]`, `DELETE /api/checklist-items/[id]`) — auth + rate limit + zod validation; max 20 items per user
- [x] Post checklist state API (`GET /api/posts/[id]/checklist`, `PUT /api/posts/[id]/checklist`) — fetch and upsert per-post checklist completion state; auth + rate limit + ownership check; returns `{items, checks}`
- [x] `PrePublishChecklist` component (`src/components/pre-publish-checklist.tsx`) — collapsible panel showing active checklist items with checkboxes and done/total count badge; calls PUT on checkbox change; "No checklist items" empty state with link to `/checklist`
- [x] Checklist management page in dashboard (`/checklist`) — list active/inactive items with label, description, order badge; toggle active/inactive button; delete button; inline create form (label, description, order)
- [x] Add "Checklist" to sidebar navigation (icon: `CheckSquare`)
- [x] Unit tests for checklist items API (GET, POST, PATCH, DELETE — auth, rate limit, max-items, ownership, validation — 20 tests) and post checklist API (GET, PUT — auth, rate limit, not-found, shape — 7 tests)

### Phase 162: Post Collection & Folder Organization
- [x] `PostCollection` model in Prisma (id, userId, name, description?, color String default "#6366f1", createdAt, updatedAt) + `CollectionPost` join table (collectionId, postId, addedAt) + migration (`20260710000000_add_post_collections`)
- [x] CRUD API for collections (`GET /api/collections`, `POST /api/collections`, `PATCH /api/collections/[id]`, `DELETE /api/collections/[id]`) — auth + rate limit + zod validation; max 50 collections per user
- [x] Post membership API (`POST /api/collections/[id]/posts` to add a post, `DELETE /api/collections/[id]/posts/[postId]` to remove)
- [x] Extend `GET /api/posts` to support `?collectionId=` filter — returns posts belonging to the specified collection
- [x] Collections list page in dashboard (`/collections`) — card grid with name, description, color swatch, post count; inline create form; delete button
- [x] Collection detail page (`/collections/[id]`) — list posts in collection with remove button; "Add Post" modal selector to attach existing posts by searching
- [x] Add "Collections" to sidebar navigation (icon: `FolderOpen`)
- [x] Unit tests for collections API (GET list, POST create, POST max-limit, PATCH update, DELETE, add post, remove post, collectionId filter on posts — 18 tests)

### Phase 163: Post Schedule Conflict Detection & Auto-Resolution
- [x] Schedule conflict detection utility (`src/lib/schedule-conflicts.ts`) — `detectConflicts(posts, windowMinutes): ScheduleConflict[]` finds SCHEDULED posts overlapping within window per platform; `buildResolutionPlan(conflicts, spacingMinutes): ResolutionItem[]` computes new times that space conflicting posts evenly
- [x] `GET /api/posts/schedule-conflicts` endpoint — auth + rate limit + `?windowMinutes=30` param; queries all user's SCHEDULED posts; returns `{conflicts: ScheduleConflict[], totalConflicts}` with pairs of conflicting post IDs, platform, and overlap window
- [x] `POST /api/posts/resolve-conflicts` endpoint — auth + rate limit + zod validation; accepts `{windowMinutes?: number, spacingMinutes?: number}`; computes resolution plan, batch-updates scheduledAt for each conflicting post; returns `{resolved: number, updates: {postId, newScheduledAt}[]}`
- [x] `ScheduleConflictBanner` component (`src/components/schedule-conflict-banner.tsx`) — amber alert banner shown in posts page when conflicts detected; shows conflict count and platform breakdown; "Auto-Resolve" button calls resolve-conflicts endpoint, toasts result, and refreshes; hidden when no conflicts
- [x] Unit tests for schedule conflict utility and API endpoints (detectConflicts: no conflict, same-platform conflict, cross-platform no conflict, multiple overlaps; buildResolutionPlan spacing; GET: auth, rate limit, windowMinutes param, empty, conflicts shape; POST: auth, rate limit, resolves, returns updates — 16 tests)

### Phase 164: Bio Page Click Analytics & QR Code Generation
- [x] `BioPageClick` model in Prisma (id, itemId, clickedAt, referrer?, deviceType?) + `clickEvents BioPageClick[]` relation on `LinkBioItem` + migration (`20260711000000_add_bio_page_clicks`) — time-series click events for bio page items
- [x] Update `POST /api/bio/[slug]/click/[itemId]` to also create a `BioPageClick` record (fire-and-forget alongside existing counter increment); parses `User-Agent` header for device type (mobile/tablet/desktop) and reads `Referer` header
- [x] `GET /api/bio-pages/[id]/analytics` endpoint — auth + ownership check + rate limit; returns `{totalClicks, items: [{itemId, label, clicks, clicksLast7d, clicksTotal}], dailyClicks: [{date, count}][], deviceBreakdown: [{device, count}]}`; aggregates 30-day daily series and device type distribution
- [x] `GET /api/bio-pages/[id]/qr` endpoint — auth + ownership check + rate limit; generates PNG QR code for the bio page public URL using `qrcode` package (`QRCode.toBuffer`); returns `image/png` with `Content-Disposition: attachment`
- [x] Bio pages dashboard UI updated — QR download button (QrCode icon) in page header toolbar; Analytics expand toggle per page showing daily clicks Recharts line chart, device breakdown badges, per-item click table (sorted by total clicks), and "Download QR Code" button
- [x] Unit tests for analytics endpoint (auth, rate limit, not-found, ownership, response shape, totalClicks aggregation, 30 daily entries, device breakdown, item stats, no-clicks page — 10 tests) and QR endpoint (auth, rate limit, not-found, ownership, PNG content-type, content-disposition, QRCode.toBuffer call — 7 tests)

### Phase 165: Google Business Profile Integration
- [x] Add `GOOGLE_BUSINESS` to `Platform` enum in Prisma schema + migration (`20260712000000_add_google_business_platform`)
- [x] Google Business Profile OAuth utility (`src/lib/auth/google-business-oauth.ts`) — `buildGoogleBusinessOAuthUrl`, `exchangeGoogleBusinessCode`, `getGoogleBusinessAccount`; uses `https://www.googleapis.com/auth/business.manage` scope; `serializeGoogleBusinessToken`/`parseGoogleBusinessToken` storing `{accessToken, refreshToken, accountName, locationName, businessName}` JSON
- [x] Google Business connect route (`GET /api/oauth/google-business/connect`) — CSRF state + redirect to Google OAuth dialog
- [x] Google Business callback route (`GET /api/oauth/google-business/callback`) — exchange code, fetch first GBP account and location, store encrypted token in SocialAccount
- [x] Google Business Profile platform adapter (`src/lib/platforms/google-business.ts`) — implements PlatformAdapter; supports text posts (NONE) and image posts (IMAGE via `media[].sourceUrl`); VIDEO/CAROUSEL throw unsupported errors; publishes via GBP Local Posts API v4
- [x] Update `character-limits.ts` — add `GOOGLE_BUSINESS: 1500` to `PLATFORM_CHAR_LIMITS`
- [x] Update `.env.example` with `GOOGLE_BUSINESS_CLIENT_ID`, `GOOGLE_BUSINESS_CLIENT_SECRET`, `GOOGLE_BUSINESS_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add Google Business Profile connection card with status indicators and connect button (requires credentials)
- [x] Update publish worker, retry route, insights route, sync-insights worker, publish route, content validator, and UI components (`platform-char-counter`, `platform-variants`, `post-preview`, `post-composer`, `queue-client`, `performance-alerts form`, and all other `Record<Platform,...>` maps) to include GOOGLE_BUSINESS
- [x] Unit tests for Google Business adapter (text post, image post with photo URL, first-image-only, content truncation, VIDEO/CAROUSEL unsupported, API error, getStatus LIVE/REJECTED/unknown/error, deletePost success/404/500, getInsights returns zeros — 15 tests)

### Phase 166: Beehiiv Newsletter Integration
- [x] Add `BEEHIIV` to `Platform` enum in Prisma schema + migration (`20260713000000_add_beehiiv_platform`)
- [x] Beehiiv API key utility (`src/lib/auth/beehiiv-oauth.ts`) — `verifyBeehiivApiKey(apiKey, publicationId)` verifies via Beehiiv API v2 `GET /publications/{id}`; `serializeBeehiivToken`/`parseBeehiivToken` for encrypted storage storing `{apiKey, publicationId, publicationName}`
- [x] Beehiiv connect route (`POST /api/oauth/beehiiv/connect`) — accepts `{apiKey, publicationId}` JSON body; verifies with Beehiiv API; stores encrypted token in SocialAccount; rate-limited
- [x] Beehiiv platform adapter (`src/lib/platforms/beehiiv.ts`) — implements PlatformAdapter; supports text posts (NONE as newsletter draft) and image posts (IMAGE with embedded image URL in HTML body); VIDEO/CAROUSEL throw unsupported errors; uses Beehiiv API v2 `POST /publications/{id}/posts`
- [x] Update `character-limits.ts` — add `BEEHIIV: 50000` to `PLATFORM_CHAR_LIMITS`
- [x] Update publish worker, retry route, insights route, sync-insights worker, and UI components (`platform-char-counter`, `platform-variants`, `post-preview`, `post-composer`, `queue-client`, `performance-alerts form`) to include BEEHIIV
- [x] Update `.env.example` — add Beehiiv section noting no client credentials are required (uses personal API key + publication ID)
- [x] Update accounts page — add Beehiiv connection card (always enabled) linking to `/accounts/beehiiv-connect`
- [x] Beehiiv connect form page (`/accounts/beehiiv-connect`) — client component form accepting API key + publication ID; POSTs to `/api/oauth/beehiiv/connect`; redirects to `/accounts` on success; shows error inline
- [x] Unit tests for Beehiiv adapter (text post, title extraction, image post with embedded URL, VIDEO/CAROUSEL unsupported, getStatus draft/confirmed, deletePost no-op, getInsights empty — 10 tests)

### Phase 167: Pixelfed Platform Integration
- [x] Add `PIXELFED` to `Platform` enum in Prisma schema + migration (`20260714000000_add_pixelfed_platform`)
- [x] Pixelfed token utility (`src/lib/auth/pixelfed-oauth.ts`) — `verifyPixelfedToken(instanceUrl, accessToken)` verifies via Pixelfed API `/api/v1/accounts/verify_credentials`; `serializePixelfedToken`, `parsePixelfedToken` for encrypted storage storing `{instanceUrl, accessToken, accountId, username}`
- [x] Pixelfed connect route (`POST /api/oauth/pixelfed/connect`) — accepts `{instanceUrl, accessToken}` JSON body; verifies token with instance; stores encrypted `{instanceUrl, accessToken, accountId, username}` JSON in SocialAccount; rate-limited
- [x] Pixelfed platform adapter (`src/lib/platforms/pixelfed.ts`) — implements PlatformAdapter; supports text posts (NONE) and image posts (IMAGE, up to 4 images via `/api/v1/media` upload + `/api/v1/statuses`); VIDEO/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `PIXELFED: 500` to `PLATFORM_CHAR_LIMITS`
- [x] Update publish worker — import and register `pixelfedAdapter`; no token refresh needed (Pixelfed tokens do not expire)
- [x] Update `.env.example` — add Pixelfed section noting no client credentials are required
- [x] Update accounts page — add Pixelfed connection card (always enabled) linking to `/accounts/pixelfed-connect`
- [x] Pixelfed connect form page (`/accounts/pixelfed-connect`) — client component form accepting instance URL + access token; POSTs to `/api/oauth/pixelfed/connect`; redirects to `/accounts` on success; shows error inline
- [x] Update all `Record<Platform, ...>` maps and UI components (`platform-char-counter`, `platform-variants`, `post-preview`, `post-composer`, `queue-client`, `performance-alerts form`) to include PIXELFED
- [x] Unit tests for Pixelfed adapter (text post, content truncation, image post with media upload, image fetch failure, media upload failure, VIDEO/CAROUSEL unsupported, getStatus found, getStatus not-found, deletePost success, deletePost failure, getInsights — 11 tests)

### Phase 168: Vimeo Platform Integration
- [x] Add `VIMEO` to `Platform` enum in Prisma schema + migration (`20260715000000_add_vimeo_platform`)
- [x] Vimeo OAuth 2.0 utility (`src/lib/auth/vimeo-oauth.ts`) — `buildVimeoOAuthUrl`, `exchangeVimeoCode`, `getVimeoUser`; uses `public private upload edit` scopes; `serializeVimeoToken`/`parseVimeoToken` storing `{accessToken, userId, name, link}`
- [x] Vimeo connect route (`GET /api/oauth/vimeo/connect`) — CSRF state + redirect to Vimeo OAuth dialog
- [x] Vimeo callback route (`GET /api/oauth/vimeo/callback`) — exchange code, fetch user info, store encrypted token in SocialAccount
- [x] Vimeo platform adapter (`src/lib/platforms/vimeo.ts`) — implements PlatformAdapter; supports video posts (VIDEO) via Vimeo API v3 using the upload API (POST /me/videos with link approach for URL-based uploads); NONE/IMAGE/CAROUSEL throw unsupported errors
- [x] Update `character-limits.ts` — add `VIMEO: 5000` to `PLATFORM_CHAR_LIMITS`
- [x] Update `.env.example` with `VIMEO_CLIENT_ID`, `VIMEO_CLIENT_SECRET`, `VIMEO_OAUTH_CALLBACK_URL`
- [x] Update accounts page — add Vimeo connection card with status indicators and connect button
- [x] Update publish worker, retry route, insights route, sync-insights worker, and UI components (`platform-char-counter`, `platform-variants`, `post-preview`, `post-composer`, `queue-client`, `performance-alerts form`) to include VIMEO
- [x] Unit tests for Vimeo adapter (video post, no-media error, NONE/IMAGE unsupported, getStatus, deletePost, getInsights — 12 tests)

### Phase 169: In-App Changelog & Feature Announcements
- [x] `ChangelogEntry` model in Prisma (id, title, summary, body, type String (feature/improvement/bugfix), version?, publishedAt DateTime, isPublished Boolean default false, createdAt, updatedAt) + `UserChangelogView` model (id, userId, entryId, viewedAt) + migration (`20260716000000_add_changelog`)
- [x] `GET /api/changelog` endpoint — returns published entries sorted by publishedAt desc; includes `seen` boolean per entry based on UserChangelogView; auth + rate limit; supports `?limit=20` param
- [x] `POST /api/changelog/mark-seen` endpoint — upserts UserChangelogView rows for all unseen published entries; auth + rate limit; returns `{marked: number}`
- [x] `ChangelogBadge` client component (`src/components/changelog-badge.tsx`) — bell/sparkle icon button in dashboard header showing count of unseen entries as a badge; clicking opens a dropdown list of recent changelog entries with type colour chips and "Mark all as seen" button; polling every 5 min
- [x] Changelog page in dashboard (`/changelog`) — full paginated list of all published entries with type filters (All / Feature / Improvement / Bugfix), search by title, rendered body with markdown support; marks all as seen on mount
- [x] Add "Changelog" to sidebar navigation (icon: `Newspaper`)
- [x] Seed script extension — adds 5 sample changelog entries (mix of feature/improvement/bugfix types) to development data
- [x] Unit tests for changelog API (GET auth, GET rate limit, GET returns published only, GET includes seen flag, GET unseen count, POST mark-seen auth, POST mark-seen rate limit, POST marks all unseen, POST idempotent — 11 tests)

### Phase 170: User Data Export & GDPR Compliance
- [x] `GET /api/account/export` endpoint — auth + rate limit (strict: 3/hr per user); compiles full JSON export of user data (profile, social accounts without raw tokens, posts, templates, campaigns, tags, hashtag groups, activity log last 90 days, settings); sets `Content-Disposition: attachment; filename="postflow-export-{date}.json"`; logs activity `account.exported`
- [x] `DELETE /api/account` endpoint — auth + rate limit; accepts `{confirmEmail: string}` body; verifies email matches session user; hard-deletes user record (cascade deletes all related data via Prisma onDelete: Cascade); returns 204; no session invalidation needed (NextAuth session will become orphaned)
- [x] Data export & account deletion section in settings page — "Export My Data" button (calls GET /api/account/export, triggers download); "Delete Account" danger zone card with email confirmation input, red "Delete Account" button, and warning text; both as client components
- [x] Unit tests for account export and delete endpoints (GET: auth, rate limit, response shape, content-disposition header, data sections present; DELETE: auth, rate limit, email mismatch, missing email, success 204, prisma delete called — 14 tests)

### Phase 171: Engagement Goal Tracking & Milestone Alerts
- [x] `EngagementGoal` model in Prisma (id, userId, name, metric: EngagementMetric, targetValue Float, aggregation: EngagementAggregation TOTAL/AVERAGE, period: GoalPeriod, platform?, isActive, lastNotifiedAt?, createdAt, updatedAt) + `EngagementMetric` enum (IMPRESSIONS/REACH/LIKES/COMMENTS/SHARES/SCORE) + `EngagementAggregation` enum (TOTAL/AVERAGE) + migration (`20260717000000_add_engagement_goals`)
- [x] CRUD API for engagement goals (`GET /api/engagement-goals`, `POST /api/engagement-goals`, `DELETE /api/engagement-goals/[id]`, `POST /api/engagement-goals/[id]/toggle`) — auth + rate limit + zod validation; max 20 goals per user
- [x] Progress endpoint (`GET /api/engagement-goals/progress`) — for each active goal aggregates PostInsights (TOTAL or AVERAGE) in current period window vs targetValue; returns `{goalId, name, metric, aggregation, period, platform, targetValue, currentValue, percentage, onTrack, sampleSize}`
- [x] BullMQ engagement goal scan worker (`src/lib/queue/workers/engagement-goals.ts`) — daily cron 06:00 UTC; for each active goal checks if target is met and no notification sent in current period window; fires in-app notification + updates lastNotifiedAt
- [x] Add `ENGAGEMENT_GOAL_SCAN` to `QUEUE_NAMES` in connection.ts; add `scheduleEngagementGoalScan()` to scheduler.ts; register worker + cron in `workers/queue-worker.ts`
- [x] Engagement goals page in dashboard (`/engagement-goals`) — circular progress indicators per goal, metric/aggregation/period/platform badges, toggle active/pause, delete, inline create form
- [x] Add "Engagement Goals" to sidebar navigation (icon: `TrendingUp`)
- [x] Unit tests for engagement goals API (GET list, POST create, POST max-limit, POST invalid body, POST platform filter, DELETE success, DELETE not-found, DELETE ownership, toggle on/off, toggle wrong-owner, progress auth, progress empty, progress TOTAL aggregation, progress AVERAGE aggregation, progress no-insights, progress response shape — 24 tests)

### Phase 172: Content Category × Platform Performance Matrix
- [x] `GET /api/analytics/performance-matrix` endpoint — auth + rate limit + `?period=30d|90d|all`; joins user's PUBLISHED posts (with contentCategory) to their PublishResults and PostInsights; computes avgEngagement (likes+comments+shares) per contentCategory × platform combination; returns `{matrix: {platform, category, avgEngagement, postCount}[], platforms: string[], categories: string[]}`
- [x] `PerformanceMatrixCard` component (`src/components/performance-matrix-card.tsx`) — grid heatmap showing categories as rows and platforms as columns; cell color intensity proportional to engagement score; post count badge per cell; period selector (30d/90d/all); "No data yet" empty state
- [x] Integrate `PerformanceMatrixCard` into analytics dashboard below the `BenchmarkCard`; add `"performance_matrix"` widget key to `WIDGET_KEYS` array and `WIDGET_LABELS` in dashboard-widgets route; add to `DashboardCustomizeDialog`
- [x] Unit tests for performance-matrix endpoint (auth, rate limit, period validation, response shape, matrix aggregation, empty state, single platform, multi-category — 10 tests)

### Phase 173: AI Content Refresh & Evergreen Post Update Suggestions
- [x] Add `suggestContentRefresh(originalContent, originalDate, platforms)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to analyze older post content and suggest specific improvements (hashtag updates, stat refreshes, tone modernization, CTAs, platform optimization); uses prompt caching on system block; returns `{suggestions: ContentRefreshSuggestion[], refreshedContent: string}`
- [x] `POST /api/posts/[id]/suggest-refresh` endpoint — auth + rate limit + AI check + ownership; uses published platforms by default (falls back to all platforms when none); calls `suggestContentRefresh`; returns `{suggestions, refreshedContent}`; 503 when AI not configured
- [x] `ContentRefreshDialog` component (`src/components/content-refresh-dialog.tsx`) — modal showing per-suggestion type badge, original→updated diff, and reason; complete refreshed content preview with copy-to-clipboard and "Create as New Draft" button; regenerate option; loading state
- [x] "Refresh" button (RefreshCw icon) per post row in posts list — opens `ContentRefreshDialog`
- [x] Unit tests for suggest-refresh endpoint (auth, rate limit, AI disabled, not-found, ownership, success shape, targetPlatforms param, invalid platform, fallback to all platforms, DB error — 10 tests)

### Phase 174: Post Performance Report Card
- [x] `GET /api/posts/[id]/report-card` endpoint — auth + rate limit + ownership check; aggregates PostInsights, SEO score, Flesch-Kincaid readability, brand compliance, and sentiment into a weighted 0–100 overall score with letter grade (A–F); weights: Engagement 40%, SEO 20%, Readability 20%, Compliance 10%, Sentiment 10%; normalizes raw engagement via log10 scale; returns `{postId, content, overallGrade, overallScore, dimensions, totalEngagement, topPlatform, publishedPlatforms, recommendations}`
- [x] `PostReportCardDialog` component (`src/components/post-report-card-dialog.tsx`) — modal with grade circle badge (colour-coded A=green/B=blue/C=yellow/D=orange/F=red), dimension breakdown with score bars and per-dimension letter grades, platform info, total engagement count, and recommendation bullet list; lazy-loads on open; loading/error states
- [x] "Report Card" button (FileBarChart2 icon) per post row in `posts-list-client.tsx` — opens `PostReportCardDialog`
- [x] Unit tests for the report-card endpoint (auth, rate limit, invalid ID, not-found, wrong user, no-insights grade, insights grade, score 0–100 bounds, recommendations present, dimension names, sentiment boost, compliance default — 10 tests)

### Phase 175: Social Account Performance Comparison
- [x] `GET /api/analytics/account-comparison` endpoint — auth + rate limit + `?accountIds[]=` query params (2–4 account IDs); verifies ownership; returns per-account: publishedCount30d, avgEngagement (likes+comments+shares from PostInsights), followerGrowth30d (latest minus 30d-ago AudienceMetric), topPostId (highest aggregate engagement), engagementRate (avgEngagement/reach×100), postsPerWeek; returns `{accounts: AccountComparisonData[], comparedAt}`
- [x] `AccountComparisonCard` component (`src/components/account-comparison-card.tsx`) — side-by-side table with one column per account; rows for: posts/30d, avg engagement, engagement rate %, follower growth, posts/week; winner cell highlighted in green per metric row (best value); platform + account name in column header; "–" for unavailable metrics; loading skeleton
- [x] Account comparison page in dashboard (`/account-comparison`) — active-account multi-select chips (max 4), "Compare" button fetches data and renders `AccountComparisonCard`; clears on account deselect; "No accounts connected" empty state
- [x] Add "Compare Accounts" to sidebar navigation (icon: `BarChart3`)
- [x] Unit tests for account comparison endpoint (auth, rate limit, too few/many accountIds, non-owned account rejection, per-account shape, engagementRate calculation, followerGrowth with/without data, postsPerWeek, empty metrics — 10 tests)

### Phase 176: Content Calendar Day Notes & Planning Annotations
- [x] `CalendarNote` model in Prisma (id, userId, date String YYYY-MM-DD, title, body?, color String default "#6366f1", createdAt, updatedAt) + migration (`20260718000000_add_calendar_notes`)
- [x] CRUD API for calendar notes (`GET /api/calendar-notes`, `POST /api/calendar-notes`, `PATCH /api/calendar-notes/[id]`, `DELETE /api/calendar-notes/[id]`) — auth + rate limit + zod validation; max 500 notes per user; date validated as YYYY-MM-DD format
- [x] Update calendar page — fetch notes alongside posts and pass to `CalendarView`
- [x] Update `CalendarView` component — render notes as coloured pill banners in each day cell; clicking a note opens an inline popover with full title/body and delete action; "Add Note" icon button per day opens a quick-add form popover
- [x] Add "Day Notes" quick-access button in calendar page header linking to a notes management list page (`/calendar-notes`) — table view with date, title, color, delete; inline create form
- [x] Unit tests for calendar notes API (GET list, POST create, POST max-limit, POST invalid date, PATCH update, PATCH not-found, PATCH ownership, DELETE success, DELETE not-found, DELETE ownership, auth, rate limit — 14 tests)

### Phase 177: Shareable Read-Only Content Calendar for Clients
- [x] `CalendarShare` model in Prisma (id, userId, token unique, title, platforms[], startDate?, endDate?, showContent, expiresAt?, views, createdAt, updatedAt) + migration (`20260719000000_add_calendar_shares`)
- [x] CRUD API for calendar shares (`GET /api/calendar-shares`, `POST /api/calendar-shares`, `DELETE /api/calendar-shares/[id]`) — auth + rate limit + zod validation; max 20 shares per user
- [x] Public calendar data endpoint (`GET /api/cal/[token]`) — no auth required; returns title, posts (with optional content based on showContent flag), platforms, expiry info; increments view counter; 410 for expired shares
- [x] Calendar shares management page in dashboard (`/calendar-shares`) — list shares with title, view count, date range, copy-link button, open-in-new-tab button, create dialog (title, date range, showContent toggle), delete/revoke
- [x] Public read-only calendar page (`/cal/[token]`) — server-rendered timeline grouped by month; shows post date, time, content (if showContent), status badge, platform chips; no auth required
- [x] "Share Calendar" button added to calendar page header linking to `/calendar-shares`
- [x] Add "Calendar Shares" to sidebar navigation (icon: `Share2`)
- [x] Unit tests for calendar shares API (GET list, POST create, POST max-limit, POST invalid body, DELETE auth, DELETE not-found, DELETE ownership, DELETE success, public GET not-found, public GET expired, public GET with posts, public GET showContent=false — 12 tests)

### Phase 178: AI-Powered Post Title & Headline Generator
- [x] Add `generateHeadlines(content, platforms, count)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to generate compelling headline/title options for a given post; uses prompt caching on system block; returns `string[]`
- [x] `POST /api/ai/headlines` endpoint — auth + rate limit + zod validation (`content: string`, `platforms: string[]`, `count?: 1–10`); calls `generateHeadlines`; returns `{headlines: string[]}`; 503 when AI not configured
- [x] `HeadlineGeneratorDialog` component (`src/components/headline-generator-dialog.tsx`) — modal showing up to 5 AI-generated headline options with numbered list, copy-to-clipboard per headline, "Use as First Line" button that prepends the headline to the post content, regenerate button, loading state
- [x] "Headlines" button in post composer toolbar — opens `HeadlineGeneratorDialog` with current content and selected platforms; disabled when content is empty
- [x] Unit tests for `POST /api/ai/headlines` (auth, rate limit, AI disabled, invalid JSON, missing content, empty platforms, success shape, custom count, default count, AI error — 10 tests)

### Phase 179: Real-Time Notification Updates via Server-Sent Events (SSE)
- [x] Redis pub/sub publisher utility (`src/lib/sse.ts`) — lazy singleton ioredis publisher; `publishNotificationEvent(userId, payload)` fire-and-forget publish to `sse:notifications:{userId}` channel; no-op when `REDIS_URL` not configured
- [x] SSE endpoint (`GET /api/sse`) — auth + rate limit; streams `text/event-stream` response using `ReadableStream`; creates dedicated ioredis subscriber per connection; subscribes to `sse:notifications:{userId}`; sends keepalive `: ping\n\n` every 25 seconds; on cancel: clears interval, unsubscribes, calls `quit()`; returns 503 when `REDIS_URL` not set; `export const dynamic = "force-dynamic"` to prevent caching
- [x] Integrate `publishNotificationEvent` into `createNotification` helper (`src/lib/notifications.ts`) — after creating the DB record, publish a `notification` event to the user's SSE channel (fire-and-forget)
- [x] Update `NotificationBell` component (`src/components/notification-bell.tsx`) — try `EventSource("/api/sse")` first; on message: re-fetch notifications; on error: close SSE and fall back to 30-second polling interval; cleanup on unmount closes both SSE connection and interval
- [x] Unit tests for `GET /api/sse` (401 unauthenticated, 429 rate limited, 503 no REDIS_URL, 200 text/event-stream, Cache-Control header, X-Accel-Buffering header, Redis subscriber + channel, quit-on-cancel — 8 tests)

### Phase 180: Platform Connection Health Monitor & Automated Token Status Tracking
- [x] Add `tokenHealthCheckedAt` (nullable DateTime) + `tokenHealthStatus` (nullable String: "ok"|"expiring"|"expired"|"invalid") to SocialAccount model + Prisma migration (`20260720000000_add_token_health`)
- [x] `GET /api/accounts/health` endpoint — auth + rate limit; returns per-account health status: `{accountId, accountName, platform, isActive, healthStatus, tokenExpiresAt, daysUntilExpiry, lastCheckedAt}`
- [x] `POST /api/accounts/health/scan` endpoint — auth + rate limit; triggers immediate health check for all user's active accounts; pings platform API (using existing `/api/accounts/[id]/check` logic) per account; updates tokenHealthStatus field; returns updated health data
- [x] Daily BullMQ token health worker (`src/lib/queue/workers/token-health.ts`) — for each active SocialAccount, computes health status from tokenExpiresAt; creates in-app notification when status changes to "expiring" (≤7 days) or "expired"; updates tokenHealthCheckedAt + tokenHealthStatus
- [x] `AccountHealthBanner` component (`src/components/account-health-banner.tsx`) — dismissable amber/red alert banner shown in dashboard layout when any account tokenHealthStatus is "expiring" or "expired"; shows account count and links to `/accounts`
- [x] Integrate `AccountHealthBanner` into dashboard layout above `PublishingPauseBanner`
- [x] Add `TOKEN_HEALTH_SCAN` to `QUEUE_NAMES` in connection.ts; add `scheduleTokenHealthScan()` to scheduler.ts (daily 07:00 UTC); register worker + cron in `workers/queue-worker.ts`
- [x] Unit tests for accounts health API (GET auth, GET rate limit, GET response shape, healthStatus "ok"/"expiring"/"expired"/"invalid" mapping, daysUntilExpiry calculation, POST scan auth, POST scan rate limit, POST scan success shape — 10 tests)

### Phase 181: Platform Content Policy Validator
- [x] Add per-platform media file count limits to `src/lib/content-validator.ts` (FB/IG: 10, Twitter/Bluesky/Mastodon/Pixelfed: 4, Telegram: 10, Threads/Pinterest/YouTube/TikTok/Vimeo: 1, others: 30); add Instagram external-link-not-clickable warning
- [x] `POST /api/posts/validate` endpoint — auth + rate limit + zod validation; accepts `{content, platforms: Platform[], mediaType: MediaType, mediaUrls: string[]}` body; runs `validateForAllPlatforms` with media count check; returns `{results: {platform, valid, errors, warnings}[], overallValid: boolean}`
- [x] `ContentPolicyWarnings` component (`src/components/content-policy-warnings.tsx`) — compact per-platform validation summary; errors in red, warnings in amber; integrated into post composer below `BrandComplianceIndicator` with 300 ms debounce; hidden when no platforms selected or no issues
- [x] Unit tests for validate endpoint and extended validator (auth, rate limit, valid post, char limit error, media type error, hashtag warning, media count error, empty platforms — 12 tests)

### Phase 182: Custom Content Rules & Posting Guardrails
- [x] `ContentRule` model in Prisma (id, userId, name, type: RuleType, value, platforms[], severity: RuleSeverity, isActive, createdAt, updatedAt) + `RuleType` enum (REQUIRED_HASHTAG/FORBIDDEN_WORD/MIN_LENGTH/MAX_HASHTAGS/REQUIRED_CTA/CUSTOM_REGEX) + `RuleSeverity` enum (ERROR/WARNING) + migration (`20260801000000_add_content_rules`)
- [x] CRUD API for content rules (`GET /api/content-rules`, `POST /api/content-rules`, `PATCH /api/content-rules/[id]`, `DELETE /api/content-rules/[id]`) — auth + rate limit + zod validation; max 50 rules per user
- [x] `POST /api/content-rules/check` endpoint — auth + rate limit; accepts `{content, platform?}`; runs all active rules against content; returns `{violations, errors, warnings, compliant}`
- [x] Content rules utility (`src/lib/content-rules.ts`) — `checkContentRules(content, rules, platform?)` evaluates each rule type; returns structured violation list with severity separation
- [x] `ContentRulesIndicator` component (`src/components/content-rules-indicator.tsx`) — debounced 600ms real-time checker below post composer textarea; shows green "Rules passed" or expandable violation list with error/warning counts
- [x] Content rules management page in dashboard (`/content-rules`) — list rules with type badge, severity badge, active toggle, delete; inline create form (name, type selector, value input with contextual hint, severity)
- [x] Add "Content Rules" to sidebar navigation (icon: `ShieldCheck`)
- [x] Unit tests for content rules utility (23 tests) and API routes (37 tests — GET list, POST create, max-limit, invalid body, PATCH update, ownership, DELETE, check endpoint with all rule types, platform filter, inactive skip)

### Phase 183: External Post Review Requests
- [x] `ExternalReview` model in Prisma (id, postId, userId, reviewerEmail, reviewerName?, token unique, message?, status: ExternalReviewStatus enum PENDING/APPROVED/REJECTED/CANCELLED, feedback?, createdAt, respondedAt?, expiresAt?) + migration (`20260802000000_add_external_reviews`)
- [x] `GET /api/posts/[id]/external-reviews` + `POST /api/posts/[id]/external-reviews` endpoints — list and create review requests; POST validates ownership, generates crypto token, sends email to reviewer with public link, logs activity; auth + rate limit + zod validation
- [x] `DELETE /api/posts/[id]/external-reviews/[reviewId]` endpoint — cancel a pending review request; auth + rate limit + ownership check
- [x] `GET /api/external-review/[token]` public endpoint — returns sanitized post data (content, mediaType, mediaUrls, platform info, no user PII) for valid non-expired non-cancelled tokens; 404/410 for invalid/expired
- [x] `POST /api/external-review/[token]/respond` public endpoint — accepts `{decision: "APPROVED"|"REJECTED", feedback?: string}`; updates review status + respondedAt; fires in-app notification to post owner; returns `{status}`
- [x] Public external review page (`/external-review/[token]`) — server-rendered; shows post preview using `PostPreview` component, reviewer name + email form (optional), decision buttons (Approve / Request Changes), feedback textarea; thank-you state after submission; no auth required
- [x] `ExternalReviewDialog` component (`src/components/external-review-dialog.tsx`) — modal with reviewer email input, optional name, optional message, optional expiry date; calls `POST /api/posts/[id]/external-reviews`; toast feedback; lists existing requests with status badge, respond date, feedback preview, and cancel button
- [x] "Review Requests" button (Send icon) per post row in posts list — opens `ExternalReviewDialog`; shows unread badge when any request has APPROVED/REJECTED status
- [x] Unit tests for external review endpoints (POST create, GET list, DELETE cancel, GET public valid, GET public expired, GET public cancelled, POST respond approve, POST respond reject, POST respond already-responded, auth + ownership — 16 tests)

### Phase 184: Social Comment Inbox & Engagement Management
- [x] `SocialComment` model in Prisma (id, userId, accountId, platformPostId, platformCommentId unique, authorName, authorHandle, authorAvatarUrl?, content, isRead Boolean default false, isReplied Boolean default false, platform, postedAt, fetchedAt DateTime @default(now()), createdAt) + migration (`20260803000000_add_social_comments`)
- [x] Add optional `fetchComments(platformPostId, token): Promise<IncomingComment[]>` to `PlatformAdapter` interface in `src/lib/platforms/types.ts`; implement for Facebook (`GET /{postId}/comments?fields=id,message,from,created_time`) and Instagram (`GET /{mediaId}/comments?fields=id,text,username,timestamp`); other adapters omit the method
- [x] `POST /api/inbox/sync` endpoint — auth + rate limit; accepts optional `{platformPostIds?: string[]}` body; fetches recent comments from up to 20 most-recently published posts across supported platforms; upserts SocialComment records (platformCommentId unique prevents duplicates); returns `{synced: number, platforms: string[]}`
- [x] `GET /api/inbox/comments` endpoint — auth + rate limit; returns paginated comments sorted by postedAt desc; supports `?platform=`, `?unreadOnly=true`, `?limit=20&cursor=` params; returns `{comments, nextCursor, totalUnread}`
- [x] `PATCH /api/inbox/comments/[id]/read` endpoint — auth + rate limit + ownership; toggles isRead; returns `{isRead}`
- [x] `POST /api/inbox/comments/[id]/reply` endpoint — auth + rate limit + ownership; accepts `{reply: string}`; calls platform adapter `addComment`; marks comment isReplied=true; logs activity; returns `{success}`
- [x] `POST /api/inbox/comments/bulk-read` endpoint — auth + rate limit; accepts `{commentIds: string[]}`; marks all as isRead=true; returns `{updated}`
- [x] Inbox page in dashboard (`/inbox`) — comment feed with platform filter tabs, unread count badge per tab, read/unread toggle, reply button per comment opening inline reply textarea, "Sync Now" button showing last synced timestamp; "Mark All Read" button; empty state when no comments
- [x] Add "Inbox" to sidebar navigation (icon: `MessageSquare`)
- [x] Unit tests for inbox API endpoints (sync, GET list with platform filter, GET unreadOnly filter, PATCH read toggle, POST reply success, POST reply adapter error, bulk-read — auth, rate limit, ownership, shape — 21 tests)

### Phase 185: Team Shared Calendar
- [x] `GET /api/teams/[id]/calendar` endpoint — auth + team membership check + rate limit; accepts `?year=YYYY&month=1-12` params (defaults to current month); returns all SCHEDULED/PUBLISHED posts from all team members in that month, each with author name, platform info, scheduledAt; returns `{year, month, posts: [{postId, content, scheduledAt, status, platform, authorName, authorId}[]}]}`
- [x] Team calendar page in dashboard (`/teams/[id]/calendar`) — server-rendered calendar grid (same layout as CalendarView); posts color-coded by author; legend showing each member's color; click reveals post content, platform, status, author; prev/next month navigation via URL params; "Back to Team" link
- [x] Add "View Shared Calendar" button/link in team detail page (`/teams/[id]`) linking to `/teams/[id]/calendar`
- [x] Unit tests for team calendar API (auth required, non-member rejected, rate limit, defaults to current month, year/month params, all-member posts returned, response shape, empty month — 8 tests)

### Phase 186: Client Portal & Reporting Workspace
- [x] `ClientPortal` model in Prisma (id, userId, slug unique, title, description?, accentColor String default "#6366f1", showCalendar Boolean default true, showAnalytics Boolean default true, showPosts Boolean default true, isPublished Boolean default false, expiresAt?, views Int default 0, createdAt, updatedAt) + migration (`20260805000000_add_client_portal`)
- [x] CRUD API for client portals (`GET /api/client-portals`, `POST /api/client-portals`, `PATCH /api/client-portals/[id]`, `DELETE /api/client-portals/[id]`) — auth + rate limit + zod validation; max 10 portals per user; slug uniqueness check with 409 conflict; auto-generate slug from title when not provided
- [x] Public portal meta endpoint (`GET /api/portal/[slug]`) — no auth required; returns `{title, description, accentColor, showCalendar, showAnalytics, showPosts, expiresAt}`; 404 for non-existent or unpublished; 410 for expired; increments view counter
- [x] Public portal calendar endpoint (`GET /api/portal/[slug]/calendar`) — no auth required; returns SCHEDULED and PUBLISHED posts for the portal owner (scheduledAt within next 60 days or updated within last 30 days); returns `{posts: [{id, content, scheduledAt, status, platforms}[]}]}`; sanitized (no user PII)
- [x] Public portal analytics endpoint (`GET /api/portal/[slug]/analytics`) — no auth required; returns summary stats (totalPublished, scheduledCount, platformBreakdown, last30DayActivity as daily counts); no user PII
- [x] Public portal page (`/portal/[slug]`) — server-rendered; fetches portal meta; renders branded header (title + accentColor); conditionally shows: scrollable post schedule (when showCalendar), KPI summary cards (when showAnalytics), recent posts list (when showPosts); "No auth required"; 404/410 handling
- [x] Client portals management page in dashboard (`/client-portals`) — card list of portals with title, view count, section toggles, copy-URL button (one click copies the public URL), publish/unpublish toggle, expiry date display, delete button; inline create form (title, optional description, slug, section checkboxes, optional expiry date)
- [x] Add "Client Portals" to sidebar navigation (icon: `Building2`)
- [x] Unit tests for client portals API (GET list, POST create, POST max-limit, POST slug conflict, POST auto-slug, PATCH update, DELETE success, public GET not-found, public GET unpublished 404, public GET expired 410, public GET increments views, public calendar shape, public analytics shape — auth, rate limit, ownership, validation — 18 tests)

### Phase 187: Sentiment Trend Analytics
- [x] `GET /api/analytics/sentiment-trend` endpoint — auth + rate limit + `?period=30d|90d|180d`; queries user's PUBLISHED posts with non-null `sentiment` field in the period; groups by day (using `updatedAt`); returns `{period, days: [{date, positive, neutral, negative, total}], summary: {positive, neutral, negative, total, positiveRate}}`; pre-fills all days in range with zero counts
- [x] `SentimentTrendCard` component (`src/components/sentiment-trend-card.tsx`) — Recharts stacked AreaChart with green/grey/red areas for positive/neutral/negative; summary pills showing counts and positive rate; period selector (30d/90d/180d); "No data yet" empty state with instructions to use Analyze Sentiment; loading and error states
- [x] Integrate `SentimentTrendCard` into analytics dashboard page below `PerformanceMatrixCard`; add `"sentiment_trend"` widget key and label to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route
- [x] Unit tests for sentiment-trend endpoint (auth, rate limit, invalid period, empty state shape, 31/91/181 day entries, positive/neutral/negative aggregation, day entry shape, case-insensitive sentiment, 100% positive rate, query filter — 12 tests)

### Phase 188: Audience Persona Management & Targeted Content Creation
- [x] `AudiencePersona` model in Prisma (id, userId, name, description?, ageRange?, primaryPlatforms String[], interests String[], painPoints String[], goals String[], contentTypes String[], notes?, createdAt, updatedAt) + `targetPersonaId` nullable FK on Post + migration (`20260806000000_add_audience_personas`)
- [x] CRUD API for audience personas (`GET /api/audience-personas`, `POST /api/audience-personas`, `PATCH /api/audience-personas/[id]`, `DELETE /api/audience-personas/[id]`) — auth + rate limit + zod validation; max 20 personas per user
- [x] Audience personas management page in dashboard (`/audience-personas`) — card grid with persona details (name, age range, platforms, interests, pain points, goals), inline create/edit form, delete button
- [x] Persona selector in post composer — compact "Target Audience" dropdown; passes `targetPersonaId` with post creation/update; extend POST/PATCH `/api/posts` zod schemas to accept optional `targetPersonaId`
- [x] Add "Personas" to sidebar navigation (icon: `Users2`)
- [x] Unit tests for audience personas API (GET list, POST create, POST max-limit, POST invalid body, PATCH update, PATCH not-found, PATCH ownership, DELETE success, DELETE not-found, DELETE ownership, auth, rate limit — 14 tests)

### Phase 189: Audience Persona Performance Analytics
- [x] `GET /api/analytics/persona-performance` endpoint — auth + rate limit + `?period=7d|30d|90d`; joins Post (with targetPersonaId) → PublishResult → PostInsights; groups by persona (+ null group for unassigned); computes postCount, avgEngagement, totalImpressions, totalReach, topPost (highest engagement), platforms distribution; sorts named personas by avgEngagement descending with unassigned at end; returns `{period, personas, totalPosts}`
- [x] `PersonaPerformanceCard` component (`src/components/persona-performance-card.tsx`) — ranked list of personas with avg engagement score bar, post count badge, platform abbreviation chips, top-performing post preview; period selector (7d/30d/90d); "No data yet" empty state with link to `/audience-personas`; loading and error states
- [x] Integrate `PersonaPerformanceCard` into analytics dashboard below `SentimentTrendCard`; add `"persona_performance"` widget key and label `"Audience Persona Performance"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route
- [x] Unit tests for persona-performance endpoint (auth 401, rate limit 429, invalid period 400, empty personas, totalPosts count, persona grouping by personaId, unassigned group for null targetPersonaId, avgEngagement calculation, response shape, named personas sorted before unassigned, platform distribution, topPost content truncation — 10 tests)

### Phase 190: Emerging Content Trends & Rising Hashtag Detection
- [x] Trend detection utility (`src/lib/trending.ts`) — `detectEmergingHashtags(posts, periodDays, limit)` computes 7-day engagement velocity for each hashtag vs the prior baseline; velocity score = (recentAvg / baselineAvg) × 100; new hashtags with no baseline score 150 (rising), dormant ones score 10 (falling); returns `{hashtag, velocityScore, recentEngagement, baselineEngagement, trend: "rising"|"stable"|"falling", recentPostCount, baselinePostCount}[]` sorted rising-first then by velocity
- [x] `GET /api/analytics/trending` endpoint — auth + rate limit + `?period=30d|60d|90d&limit=`; queries user's PUBLISHED posts with PublishResult insights; runs trend detection; returns `{period, hashtags: TrendingHashtag[], totalPosts}`
- [x] `TrendingHashtagsCard` component (`src/components/trending-hashtags-card.tsx`) — ranked list with trend icons (TrendingUp/TrendingDown/Minus), colour-coded velocity progress bar, trend badge (Rising/Stable/Falling), recent vs baseline post counts, per-hashtag copy-to-clipboard and "Create Post" quick-link; period selector (30d/60d/90d); "No hashtag data yet" empty state
- [x] Integrate `TrendingHashtagsCard` into analytics dashboard below `PersonaPerformanceCard`; add `"trending_hashtags"` widget key and label `"Emerging Hashtag Trends"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route
- [x] Unit tests for trend detection utility (10 tests — empty, no hashtags, rising, falling, stable, new-only=150, baseline-only=10, sort order, limit, outside-period excluded, null publishedAt skipped, multi-platform aggregation) and API endpoint (10 tests — auth, rate limit, invalid period, empty result, period in response, response shape, rising detected, totalPosts, null publishedAt skipped, DB error)

### Phase 191: One-Click AI Post Optimization
- [x] Add `optimizePost(content, platforms, brandKitContext?, tone?)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to comprehensively optimize post content for the selected platforms: improves grammar, enhances engagement, adds appropriate hashtags, ensures platform-specific optimizations, preserves brand voice; uses prompt caching on system block; returns `{optimizedContent, changes: {type: "grammar"|"hashtags"|"engagement"|"platform"|"clarity", description: string}[], hashtagsAdded: string[], estimatedImprovementScore: number}`
- [x] `POST /api/ai/optimize` endpoint — auth + rate limit + zod validation (`content: string min 1 max 10000`, `platforms: Platform[]`, `tone?: string`); optionally fetches brand kit for voice context; calls `optimizePost`; returns optimization result; 503 when AI not configured
- [x] `PostOptimizationDialog` component (`src/components/post-optimization-dialog.tsx`) — modal showing original vs optimized content side-by-side, change list with type-coloured badges (grammar/hashtags/engagement/platform/clarity), improvement score badge (0–100), "Apply Optimization" button that replaces composer content, copy-to-clipboard, regenerate option, loading state
- [x] "Optimize" button (Wand2 icon) in post composer toolbar — opens `PostOptimizationDialog` with current content and selected platforms; disabled when content is empty or no AI configured; shows loading spinner during optimization
- [x] Unit tests for `POST /api/ai/optimize` (auth, rate limit, AI disabled, invalid JSON, missing content, empty platforms, success shape with changes array, brand context included when kit exists, brand context absent when no kit, AI error — 10 tests)

### Phase 192: AI Content Strategy Chat Assistant
- [x] `AiChatMessage` model in Prisma (id, userId, role String, content String, createdAt DateTime, @@index([userId, createdAt(sort: Desc)])) + migration (`20260807000000_add_ai_chat`)
- [x] Add `chatWithAssistant(messages, contextSummary?)` + `ChatMessage` interface to `src/lib/ai.ts` — calls `claude-haiku-4-5` with system prompt as PostFlow content strategy assistant; uses prompt caching on system block; accepts conversation history + optional account context summary
- [x] `GET /api/ai/chat` endpoint — auth + rate limit (60/min); returns last 50 messages ordered chronologically
- [x] `POST /api/ai/chat` endpoint — auth + rate limit (20/min) + zod validation; saves user message + AI reply in DB transaction; prunes history to MAX_HISTORY=50; includes context summary (connected accounts count, posts last 30 days); returns `{reply}`
- [x] `DELETE /api/ai/chat` endpoint — auth + rate limit (10/min); clears all messages for user; returns `{deleted: count}`
- [x] `AiChatPanel` floating client component (`src/components/ai-chat-panel.tsx`) — toggle button in dashboard header; fixed bottom-right panel with message history, user/assistant bubbles, textarea input (Enter to send, Shift+Enter for newline), send button, clear history button, loading indicator; lazy-loads history on first open
- [x] Integrate `AiChatPanel` into dashboard layout header
- [x] Unit tests for GET/POST/DELETE `/api/ai/chat` (auth 401, rate limit 429, history shape, AI disabled 503, invalid body 400, success reply, history context passing, clear history — 10 tests)

### Phase 193: iCal/ICS Import & Calendar-Based Post Scheduling
- [x] iCal parser utility (`src/lib/ical-import.ts`) — `parseICS(content)` unfolds RFC 5545 continuation lines, parses VEVENT blocks extracting UID/SUMMARY/DESCRIPTION/LOCATION/DTSTART/DTEND, handles DATE and DATE-TIME formats (with and without Z suffix), unescapes ICS text; returns `{events, parseErrors[]}`; `icsEventsToPostDrafts(events, options)` converts parsed events to draft content strings (summary + description + location), with optional `skipPastEvents` flag
- [x] `POST /api/calendar/import` endpoint — auth + rate limit; accepts multipart/form-data with .ics file (max 2 MB) or raw ICS body; validates file extension and ICS structure; parses events; creates DRAFT posts with `scheduledAt` from `DTSTART`; content built from summary + description + location; logs activity; returns `{imported, skipped[], postIds[], message}`
- [x] Import page in dashboard (`/calendar/import`) — drag-and-drop .ics file upload zone; client-side preview of parsed events (date/time + content) before import; parse error warnings panel; confirm import button; result summary with success count and skipped events; "Import another file" reset option; format guide section
- [x] "Import ICS" button added to calendar page header linking to `/calendar/import`
- [x] Unit tests for ICS import API (auth, rate limit, invalid ICS, empty body, no-DTSTART events, single event import, multi-event import, scheduledAt set from DTSTART, content from summary+description, message count) and `parseICS` utility (empty input, single VEVENT, multiple VEVENTs, missing DTSTART, date-only DTSTART, escaped characters) and `icsEventsToPostDrafts` utility (event conversion, skipPastEvents=true, include past by default — 19 tests)

### Phase 194: Public RSS/Atom Feed Export
- [x] `FeedToken` model in Prisma (id, userId unique, token unique @default(cuid()), createdAt) + migration (`20260808000000_add_feed_token`) — enables stateless RSS/Atom feed access without session
- [x] RSS feed generation utility (`src/lib/rss-feed.ts`) — `generateRssFeed(posts, author, feedUrl)` produces RFC 2.0 XML; `generateAtomFeed(posts, author, feedUrl)` produces Atom 1.0 XML; `RssFeedPost` interface; XML entity escaping; RFC 822 and ISO 8601 date formatters; last 50 posts
- [x] `GET /api/feed/token` + `DELETE /api/feed/token` endpoints — GET upserts and returns FeedToken; DELETE revokes and regenerates token; both auth + rate limit
- [x] `GET /api/feed/rss` endpoint — returns `application/rss+xml`; auth via session OR `?token=` query param; queries last 50 PUBLISHED posts with publish results; `export const dynamic = "force-dynamic"`
- [x] `GET /api/feed/atom` endpoint — same as RSS but returns `application/atom+xml` using `generateAtomFeed`
- [x] `RssFeedSection` client component (`src/app/(dashboard)/settings/rss-feed-section.tsx`) — Card showing RSS and Atom subscription URLs with copy buttons; "Regenerate Token" button; fetches token on mount; integrated into settings page above DataExportSection
- [x] Unit tests for feed and token endpoints (RSS: 401 unauthenticated, 401 invalid token, 429 rate limit, session auth returns RSS, token auth, generateRssFeed called, empty feed; Atom: 401, 401, session auth returns Atom, token auth, generateAtomFeed called; Token GET: 401, 429, upsert returns token; Token DELETE: 401, 429, revokes and creates new — 13 tests)

### Phase 195: Platform Posting Frequency Analysis & Pacing Score
- [x] Posting frequency utility (`src/lib/posting-frequency.ts`) — defines `RECOMMENDED_FREQUENCY` map of per-platform recommended posts/week (FB: 5, IG: 7, Threads: 14, Twitter: 14, LinkedIn: 3, TikTok: 7, YouTube: 2, Pinterest: 5, Reddit: 7, Bluesky: 7, Mastodon: 7, Telegram: 5, Tumblr: 3, WordPress: 3, Medium: 2, Ghost: 2, DevTo: 3, Hashnode: 2, Nostr: 7, Pixelfed: 7, Vimeo: 2, Beehiiv: 2, Google Business: 3, others: 5); `computePlatformFrequency(publishResults, periodDays)` returns per-platform `{platform, actualPerWeek, recommendedPerWeek, pacingScore, status: "optimal"|"over"|"under", totalPublished}` — pacingScore 0-100 where 100=exactly on target, drops linearly when over/under; sort by totalPublished desc
- [x] `GET /api/analytics/posting-frequency` endpoint — auth + rate limit + `?period=7d|30d|90d` (default 30d); queries user's PUBLISHED PublishResult records grouped by platform filtered to period; calls `computePlatformFrequency`; returns `{period, platforms: PlatformFrequencyData[], overallPacingScore, totalPublished}`
- [x] `PostingFrequencyCard` component (`src/components/posting-frequency-card.tsx`) — per-platform rows with actual vs recommended posts/week shown as dual progress bar, pacing score badge (green ≥80 / yellow ≥60 / red <60), status chip (Optimal / Over-posting / Under-posting), total published count; overall pacing score summary box; period selector (7d/30d/90d); loading skeleton; empty state when no published posts
- [x] Integrate `PostingFrequencyCard` into analytics dashboard below `PlatformReliabilityCard`; add `"posting_frequency"` widget key and label `"Posting Frequency & Pacing"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route; add to `DashboardCustomizeDialog`
- [x] Unit tests for posting frequency utility and API endpoint (utility: exact target=100, over-posting score, under-posting score, zero posts=0, all platforms covered, sort order; endpoint: auth, rate limit, period validation, empty state shape, per-platform shape, overallPacingScore, DB error — 14 tests)

### Phase 196: Content Type × Time Performance Matrix
- [x] `GET /api/analytics/time-content-matrix` endpoint — auth + rate limit + `?period=7d|30d|90d|all&platform=` params; queries user's PUBLISHED posts with non-null contentCategory joined to publishResults (PUBLISHED status) and PostInsights; groups by (hour-of-day UTC from publishedAt, contentCategory); computes avgEngagement (likes+comments+shares averaged over insight-equipped results) and postCount per cell; returns `{period, matrix: {hour, category, avgEngagement, postCount}[], categories, totalDataPoints, recommendations: {category, optimalHour, optimalHourLabel, avgEngagement}[]}`; exports `formatHourLabel` utility
- [x] `TimeContentMatrixCard` component (`src/components/time-content-matrix-card.tsx`) — horizontally-scrollable 24-column × category-row heatmap grid; cell color interpolated from light green (low) to dark green (high) based on engagement relative to max; hover tooltip with avgEngagement + postCount; period selector (7d/30d/90d/all); platform filter dropdown; recommendations section listing optimal hour per content category; loading skeleton; "No data yet" empty state
- [x] Add `"time_content_matrix"` widget key and label `"Time × Content Matrix"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route; integrate `TimeContentMatrixCard` into analytics dashboard page below `PostingFrequencyCard`
- [x] Unit tests for time-content-matrix endpoint (auth, rate limit, invalid period, empty state shape, matrix entries with insights, avgEngagement calculation, period filter excludes old posts, platform filter, response shape with all fields, recommendations optimal-hour, null category → UNCATEGORIZED, formatHourLabel 12am/noon/pm — 11 tests)

### Phase 197: Live Publishing Queue Monitor & Worker Dashboard
- [x] `GET /api/queue/status` endpoint — auth + rate limit; returns BullMQ queue metrics for the publish queue: `{waiting, active, completed, failed, delayed, paused}`; uses BullMQ `Queue.getJobCounts()` with graceful fallback when Redis is unavailable
- [x] `GET /api/queue/jobs` endpoint — auth + rate limit; returns the current user's own BullMQ jobs from the publish queue filtered by userId in job data; supports `?state=waiting|active|failed|delayed` param; returns up to 50 jobs with `{id, state, data: {postId, platform}, attemptsMade, timestamp, failedReason?}`
- [x] `POST /api/queue/jobs/[jobId]/retry` endpoint — auth + rate limit; re-queues a failed publish job owned by the current user (verifies userId in job data); returns `{success}`
- [x] `QueueMonitorCard` component (`src/components/queue-monitor-card.tsx`) — compact dashboard card showing queue depth gauges (waiting/active/failed/delayed counts as coloured stat boxes); auto-refreshes every 15 s using `setInterval`; loading skeleton; "Queue unavailable" state when Redis unreachable
- [x] Queue monitor page in dashboard (`/queue-monitor`) — full-page view with `QueueMonitorCard` at top; job list table below with state filter tabs (All / Waiting / Active / Failed / Delayed); each row shows jobId, postId, platform, attempts, timestamp, failedReason; "Retry" button per failed job; "Refresh" button; empty state per tab
- [x] Add "Queue Monitor" to sidebar navigation (icon: `Activity`)
- [x] Unit tests for queue status and jobs endpoints (auth, rate limit, shape with all count fields, Redis unavailable fallback, jobs filtered by userId, state filter param, retry success, retry wrong-user — 14 tests)

### Phase 198: AI Prompt Library & Saved Custom Prompts
- [x] `SavedPrompt` model in Prisma (id, userId, name, description?, prompt, category?, isPublic Boolean default false, usageCount Int default 0, createdAt, updatedAt) + migration (`20260809000000_add_saved_prompts`)
- [x] CRUD API for saved prompts (`GET /api/saved-prompts`, `POST /api/saved-prompts`, `PATCH /api/saved-prompts/[id]`, `DELETE /api/saved-prompts/[id]`) — auth + rate limit + zod validation; max 50 prompts per user
- [x] `GET /api/saved-prompts/community` endpoint — returns top 50 public prompts sorted by usageCount desc; no auth required
- [x] `POST /api/saved-prompts/[id]/use` endpoint — increments usageCount; works for own prompts and public community prompts; auth + rate limit
- [x] Saved prompts management page in dashboard (`/saved-prompts`) — "My Prompts" tab (list with category badge, usage count, public/private indicator, inline create form, edit-in-place, delete) + "Community Prompts" tab (public prompts from all users with "Add to Library" copy button that clones and increments usageCount)
- [x] `Switch` and `Tabs` shadcn/ui components (`src/components/ui/switch.tsx`, `src/components/ui/tabs.tsx`) added to support the saved prompts page and future pages
- [x] "Load Saved Prompt" dropdown in post composer AI Suggest dialog — lazy-loaded on dialog open; selecting a prompt fills the topic field and calls `/api/saved-prompts/[id]/use` fire-and-forget
- [x] Add "Prompts" to sidebar navigation (icon: `Sparkles`)
- [x] Unit tests for saved prompts API (GET list, POST create, POST max-limit, POST invalid body, PATCH update, PATCH ownership, DELETE success, DELETE not-found, DELETE ownership, community GET returns only public, use increments count, use on private by non-owner rejected — 29 tests)

### Phase 199: AI Video Script & Caption Generator for Video Posts
- [x] Add `generateVideoScript(topic, duration, platforms, tone?)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to generate a structured video script (hook, body, CTA) and suggested caption per platform; uses prompt caching on system block; exports `VideoScript` interface; returns `{hook, body, callToAction, captions: {platform, content}[], estimatedDuration}`
- [x] `POST /api/ai/video-script` endpoint — auth + rate limit + zod validation (`topic: string min 2 max 200`, `duration: number 15–600 seconds`, `platforms: string[] non-empty`, `tone?: string`); calls `generateVideoScript`; returns `{script}`; returns 503 when AI not configured
- [x] `VideoScriptDialog` component (`src/components/video-script-dialog.tsx`) — modal with topic input, duration selector (15s/30s/1min/1.5min/3min/5min/10min), optional tone selector (professional/casual/educational/entertaining/inspirational); calls `/api/ai/video-script`; shows structured sections (Hook, Body, Call-to-Action) each with copy button; per-platform caption list with "Use" button applying caption to post content via `onApply` callback; regenerate button; loading state
- [x] "Video Script" button (Film icon) in post composer toolbar — opens `VideoScriptDialog` with currently selected platforms; `onApply` sets post content
- [x] Unit tests for `POST /api/ai/video-script` (auth 401, rate limit 429, AI disabled 503, invalid JSON 400, missing topic 400, duration out of range 400, empty platforms 400, success shape, AI error 500 — 9 tests)

### Phase 200: Legal Disclaimer & Compliance Footer Management
- [x] `LegalDisclaimer` model in Prisma (id, userId, name, content, platforms[], position String default "append", autoAppend Boolean, isActive Boolean, createdAt, updatedAt) + migration (`20260810000000_add_legal_disclaimers`)
- [x] CRUD API for legal disclaimers (`GET /api/legal-disclaimers`, `POST /api/legal-disclaimers`, `PATCH /api/legal-disclaimers/[id]`, `DELETE /api/legal-disclaimers/[id]`) — auth + rate limit + zod validation; max 20 disclaimers per user
- [x] `POST /api/legal-disclaimers/preview` endpoint — auth + rate limit; accepts `{content, disclaimerId}`; returns `{preview}` with disclaimer appended or prepended based on position field
- [x] Legal disclaimers management page in dashboard (`/legal-disclaimers`) — list disclaimers with platform badges, position chip, auto-append indicator, active toggle; inline create/edit form (name, content textarea with char counter, position selector, platform chip toggles, autoAppend/isActive switches); delete with toast feedback
- [x] Add "Disclaimers" to sidebar navigation (icon: `FileText`)
- [x] Unit tests for legal disclaimers API (GET list, POST create, POST max-limit, POST invalid body, PATCH update, PATCH ownership, DELETE success, DELETE not-found, POST preview append, POST preview prepend — auth, rate limit, validation, shape — 33 tests)

### Phase 201: Natural Language Post Scheduling
- [x] Add `parseNaturalLanguageDate(text, timezone, referenceDate)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to parse natural language time expressions (e.g., "next Monday at 3pm", "tomorrow morning", "in 2 hours") into ISO 8601 datetime; uses prompt caching on system block; returns `{datetime: string, confidence: number, interpretation: string}` or null when parsing fails
- [x] `POST /api/ai/parse-date` endpoint — auth + rate limit + zod validation (`text: string min 2 max 200`, `timezone?: string`); calls `parseNaturalLanguageDate` with current server time as reference; returns `{datetime, confidence, interpretation}`; 503 when AI not configured
- [x] `NaturalLanguageScheduler` component (`src/components/natural-language-scheduler.tsx`) — text input with examples placeholder ("e.g. next Monday at 3pm, tomorrow morning, in 2 hours"), "Parse" button that calls `/api/ai/parse-date`, shows formatted interpretation preview and calls `onDateParsed(datetime)` callback on success; inline error/loading state; "Clear" button resets
- [x] Integrate `NaturalLanguageScheduler` into post composer — collapsible "or describe a time" toggle below the datetime-local input; calls `setScheduledAt` on successful parse
- [x] Unit tests for `POST /api/ai/parse-date` (auth 401, rate limit 429, AI disabled 503, invalid JSON 400, missing text 400, text too short 400, success shape with datetime/confidence/interpretation, timezone forwarded to AI, AI returns null → 422, AI error 500 — 10 tests)

### Phase 202: Inbound Webhook Triggers & Automation
- [x] `InboundWebhook` model in Prisma (id, userId, name, secret String, fieldMapping Json, defaultPlatforms String[], isActive Boolean default true, lastTriggeredAt?, triggerCount Int default 0, createdAt, updatedAt) + migration (`20260811000000_add_inbound_webhooks`) — allows external services to create posts via authenticated POST requests
- [x] CRUD API for inbound webhooks (`GET /api/inbound-webhooks`, `POST /api/inbound-webhooks`, `PATCH /api/inbound-webhooks/[id]`, `DELETE /api/inbound-webhooks/[id]`) — auth + rate limit + zod validation; max 20 inbound webhooks per user; auto-generates cryptographically random secret on create; returns secret only on create
- [x] Public trigger endpoint (`POST /api/trigger/[id]`) — no session auth; validates `X-Webhook-Secret` header against stored secret; parses incoming JSON body using `fieldMapping` to extract content/scheduledAt/mediaUrls; creates DRAFT or SCHEDULED post for the webhook owner; increments triggerCount + sets lastTriggeredAt; returns `{postId, status}`; rate-limited to 60/min per webhook ID
- [x] `GET /api/inbound-webhooks/[id]/logs` endpoint — auth + ownership check + rate limit; returns last 50 trigger attempts (from a `WebhookTriggerLog` model with id, webhookId, success, statusCode, requestBody Json?, createdAt) for monitoring
- [x] Inbound webhooks management page in dashboard (`/inbound-webhooks`) — table of webhooks with name, trigger count, last triggered, active toggle; create dialog (name, field mapping JSON editor with schema hints, default platforms); secret shown once on creation with copy button; "Test" button sends sample payload to the trigger URL; delete with confirmation
- [x] Add "Inbound Webhooks" to sidebar navigation (icon: `ArrowDownToLine`)
- [x] Unit tests for inbound webhooks API (GET list, POST create, PATCH update, DELETE, trigger valid secret, trigger invalid secret, trigger missing secret, field mapping extraction, rate limit on trigger, log shape — 28 tests)

### Phase 203: Scheduled Content Preview Digest Email
- [x] `ContentDigestConfig` model in Prisma (id, userId unique, enabled Boolean default false, dayOfWeek Int default 1, hourUTC Int default 9, lookAheadDays Int default 7, includeContent Boolean default true, createdAt, updatedAt) + migration (`20260812000000_add_content_digest_config`)
- [x] `GET /api/settings/content-digest` endpoint — returns stored config or defaults (enabled=false, dayOfWeek=1 Monday, hourUTC=9, lookAheadDays=7, includeContent=true); auth + rate limit
- [x] `PATCH /api/settings/content-digest` endpoint — upserts config; zod validation (dayOfWeek 0–6, hourUTC 0–23, lookAheadDays 1–30); auth + rate limit; returns updated config
- [x] BullMQ content digest worker (`src/lib/queue/workers/content-digest.ts`) — processes `CONTENT_DIGEST` queue; hourly cron; checks each enabled config's dayOfWeek and hourUTC against current UTC time; queries SCHEDULED posts within lookAheadDays; groups by day; sends HTML email with per-day sections and optional content preview; skips users with emailNotifications=false
- [x] Add `CONTENT_DIGEST: "postflow:content-digest"` to `QUEUE_NAMES` in `connection.ts`; add `scheduleContentDigest()` to `scheduler.ts` (hourly cron `"0 * * * *"`); register worker + cron in `workers/queue-worker.ts`
- [x] `ContentDigestSection` client component (`src/app/(dashboard)/settings/content-digest-section.tsx`) — card with enable toggle, day-of-week dropdown, UTC hour selector (12-hour format), look-ahead days selector (3/5/7/14 days), include-content toggle; integrated into Settings page
- [x] Unit tests for content digest settings API (GET auth, GET rate limit, GET defaults when no row, GET stored config, GET shape; PATCH auth, PATCH rate limit, PATCH invalid dayOfWeek/hourUTC/lookAheadDays, PATCH enable, PATCH partial update — 14 tests)

### Phase 204: Social Account Portfolio Summary
- [x] `GET /api/analytics/portfolio` endpoint — auth + rate limit; aggregates across all user's SocialAccounts: totalAccounts, activeAccounts, totalFollowers (sum of latest AudienceMetric followersCount), totalFollowerGrowth7d, totalPublished30d (PUBLISHED PublishResults in last 30 days), totalEngagement30d (likes+comments+shares), overallEngagementRate (weighted avg by posts published), topPlatformByFollowers, topPlatformByEngagement; returns per-account breakdown with platform, followers, 7d growth, posts/30d, engagement/30d, avg engagement rate
- [x] Portfolio page in dashboard (`/portfolio`) — KPI cards (connected accounts, total followers with 7d growth, posts published 30d, total engagement 30d); per-account breakdown table (platform badge, followers, 7d growth arrow, posts/30d, engagement, avg rate, active status); follower distribution bar chart showing % per account
- [x] Add "Portfolio" to sidebar navigation (icon: `PieChart`)
- [x] Unit tests for portfolio API (auth 401, rate limit 429, empty accounts, account count/active count, follower aggregation, totalPublished30d, totalEngagement30d, topPlatformByFollowers, topPlatformByEngagement, response shape, per-account entry shape — 10 tests)

### Phase 205: Bulk Post Validation & Pre-Flight Check
- [x] `POST /api/posts/bulk-validate` endpoint — auth + rate limit + zod validation; accepts `{postIds: string[] (1–50)}`; fetches owned posts with publishResults; loads user's active ContentRules and BrandKit; runs `validateForAllPlatforms`, `checkContentRules`, and `checkBrandCompliance` per post; returns `{results, totalPosts, passingPosts, failingPosts}` where each result includes platformResults, contentRulesResult, brandResult, overallValid, errorCount, warningCount, and content capped at 100 chars
- [x] `BulkValidationDialog` component (`src/components/bulk-validation-dialog.tsx`) — auto-runs validation when opened; summary banner showing passing/failing counts; per-post expandable rows with green/red icons; expandable sections for platform errors, content rule violations, and brand compliance violations; Re-check and Close buttons
- [x] `BulkValidateButton` client component (`src/app/(dashboard)/posts/bulk-validate-button.tsx`) — ShieldCheck icon button in bulk action bar; opens BulkValidationDialog; integrated into PostsListClient alongside other bulk action buttons
- [x] Unit tests for bulk-validate endpoint (auth, rate limit, invalid JSON, empty postIds, postIds >50, single passing post, platform validation errors, content rules errors, brand compliance errors, null brandResult, mixed results, ownership filtering, content capped at 100 chars, multiple brand violations errorCount — 14 tests)

### Phase 206: Custom Post Workflow Stages
- [x] `WorkflowStage` model in Prisma (id, userId, name, color String default "#6366f1", order Int default 0, createdAt, updatedAt) + nullable `workflowStageId` FK on Post + migration (`20260813000000_add_workflow_stages`) — allows users to define custom Kanban-style stages beyond the built-in PostStatus enum
- [x] CRUD API for workflow stages (`GET /api/workflow-stages`, `POST /api/workflow-stages`, `PATCH /api/workflow-stages/[id]`, `DELETE /api/workflow-stages/[id]`) — auth + rate limit + zod validation; max 20 stages per user; DELETE unassigns all posts before removing stage
- [x] `PATCH /api/posts/[id]/workflow-stage` endpoint — auth + rate limit + ownership check on both post and stage; accepts `{workflowStageId: string | null}` to assign or unassign a stage
- [x] Extend `GET /api/posts` to support `?workflowStageId=` filter and `?noStage=true` filter; include `workflowStage` (id, name, color) in post responses
- [x] Workflow stages management page in dashboard (`/workflow-stages`) — list stages with color dot, name, post count; inline create form with 12 preset color swatches; edit-in-place (name + color); up/down reorder via order-swapping; delete with confirmation toast
- [x] `WorkflowStageSelector` client component (`src/app/(dashboard)/posts/workflow-stage-selector.tsx`) — colored pill button per post row showing assigned stage; dropdown to assign/unassign; optimistic UI with rollback; closes on outside click; hidden when user has no stages configured
- [x] Add "Workflow Stages" to sidebar navigation (icon: `Workflow`)
- [x] Unit tests for workflow stages API (GET list, POST create, POST max-limit, POST invalid color, PATCH update, PATCH ownership, DELETE unassigns then deletes, workflow-stage PATCH assign/unassign, auth + rate limit — 14 tests)

### Phase 207: Follower Milestone Tracking & Growth Celebration
- [x] `FollowerMilestone` model in Prisma (id, userId, accountId, platform, milestone Int, achievedAt, celebrated Boolean default false, createdAt) + `@@unique([accountId, milestone])` + migration (`20260814000000_add_follower_milestones`) — tracks per-account follower count milestones
- [x] Follower milestones utility (`src/lib/follower-milestones.ts`) — `MILESTONE_THRESHOLDS` array (100…1M), `getMilestonesCrossed(prev, current)`, `getNextMilestone(count)`, `formatMilestone(count)`, `projectGrowth(metrics, days)` (linear regression), `computeGrowthRate(metrics)` (followers/day)
- [x] Update BullMQ audience sync worker to detect milestone crossings after each follower count update; upserts FollowerMilestone records; fires in-app notifications via `createNotification`
- [x] `GET /api/milestones` endpoint — auth + rate limit; returns all FollowerMilestones for current user with account name; sorted by achievedAt desc
- [x] `POST /api/milestones/[id]/celebrate` endpoint — auth + rate limit + ownership check; sets `celebrated = true`; returns `{celebrated: true}`
- [x] `GET /api/analytics/growth-projection` endpoint — auth + rate limit; queries last 90 days AudienceMetric per active account; calls `projectGrowth` and `computeGrowthRate`; returns `{accounts: [{accountId, accountName, platform, currentFollowers, growthRatePerDay, projections: [{days, projected}], nextMilestone, daysToNextMilestone}]}`
- [x] Milestones page in dashboard (`/milestones`) — new milestone celebration cards (yellow highlight, "Celebrate!" button); growth projection cards with next milestone ETA; milestone threshold badge strip; milestone history table
- [x] Add "Milestones" to sidebar navigation (icon: `Milestone`)
- [x] Unit tests for follower-milestones utility (getMilestonesCrossed, getNextMilestone, formatMilestone, projectGrowth, computeGrowthRate — 13 tests) and API endpoints (GET milestones auth/rate-limit/empty/shape, POST celebrate auth/rate-limit/404/ownership/success, GET growth-projection auth/rate-limit/empty/shape — 12 tests)

### Phase 208: Smart Lists & Advanced Post Query Builder
- [x] `SmartList` model in Prisma (id, userId, name, description?, filters Json, pinned Boolean default false, createdAt, updatedAt) + migration (`20260815000000_add_smart_lists`) — stores saved multi-criteria post filter queries per user
- [x] CRUD API for smart lists (`GET /api/smart-lists`, `POST /api/smart-lists`, `PATCH /api/smart-lists/[id]`, `DELETE /api/smart-lists/[id]`) — auth + rate limit + zod validation; max 20 smart lists per user
- [x] `GET /api/smart-lists/[id]/posts` endpoint — auth + rate limit + ownership check; applies saved filters (status[], platform[], sentiment, tags[], starred, evergreen, archived, contentContains, scheduledFrom, scheduledTo, contentCategory, workflowStageId) against the user's posts; supports `?page=&limit=`; returns `{posts, total, smartList}`
- [x] Smart lists management page in dashboard (`/smart-lists`) — list of smart lists with description, pinned badge, "View Posts" count chip; create/edit dialog with multi-criteria filter builder (status checkboxes, platform pills, sentiment dropdown, tag selector, date range pickers, content search input, boolean toggles for starred/evergreen/archived); inline post count preview on save
- [x] "Save as Smart List" button in posts page — opens name+description dialog, captures all active URL filter params as filters JSON, POSTs to smart lists endpoint; toast feedback
- [x] Smart list quick-access dropdown in posts page header — lists pinned smart lists first then all others; selecting one applies all filters to the page URL; "Manage" link at bottom
- [x] Add "Smart Lists" to sidebar navigation (icon: `ListFilter`)
- [x] Unit tests for smart lists API (GET list auth/rate-limit/empty/shape, POST create/max-limit/invalid-filters, PATCH update/ownership, DELETE success/ownership, GET posts auth/filters/pagination/ownership — 16 tests)

### Phase 209: Response Templates & Automated Comment Replies
- [x] `ResponseTemplate` model in Prisma (id, userId, name, content, category?, usageCount Int default 0, createdAt, updatedAt) + `AutoReplyRule` model (id, userId, name, triggerKeywords String[], templateId FK to ResponseTemplate, platform?, isActive Boolean default true, matchCount Int default 0, createdAt, updatedAt) + migration (`20260816000000_add_response_templates`)
- [x] CRUD API for response templates (`GET /api/response-templates`, `POST /api/response-templates`, `PATCH /api/response-templates/[id]`, `DELETE /api/response-templates/[id]`) — auth + rate limit + zod validation; max 50 templates per user
- [x] CRUD API for auto-reply rules (`GET /api/auto-reply-rules`, `POST /api/auto-reply-rules`, `PATCH /api/auto-reply-rules/[id]`, `DELETE /api/auto-reply-rules/[id]`) — auth + rate limit + zod validation; max 20 rules per user; include `template` in GET responses
- [x] Integrate auto-reply rule checking in `POST /api/inbox/sync` — after upserting new comments, for each new comment check if any active user rules have a triggerKeyword present in the comment content (case-insensitive substring match); if matched, call platform adapter `addComment` with template content; mark comment `isReplied=true`; increment rule `matchCount`; log activity
- [x] Response templates management page in dashboard (`/response-templates`) — list templates with category badge, usage count; inline create form (name, category, content textarea); edit-in-place; delete with confirmation toast
- [x] Auto-reply rules management page in dashboard (`/auto-reply-rules`) — list rules with trigger keyword chips, linked template name, platform badge, active toggle; inline create form (name, keywords comma-separated, template selector, optional platform); delete
- [x] "Insert Template" selector in inbox reply area — compact dropdown button listing user's response templates; selecting one fills the reply textarea with template content and increments usageCount via `POST /api/response-templates/[id]/use`
- [x] Add "Response Templates" and "Auto-Reply Rules" to sidebar navigation (icon: `MessageCircleReply` and `Zap`)
- [x] Unit tests for response templates API (GET list, POST create, POST max-limit, POST invalid body, PATCH update, PATCH ownership, DELETE success, DELETE not-found, auth, rate limit — 12 tests) and auto-reply rules API (GET list, POST create, POST max-limit, PATCH update, PATCH ownership, DELETE, toggle — auth, rate limit — 10 tests)

### Phase 210: Inbox Comment Analytics & Response Rate Tracking
- [x] `GET /api/inbox/stats` endpoint — auth + rate limit; returns `{totalComments, unreadCount, repliedCount, autoRepliedCount (sum of AutoReplyRule matchCounts), responseRate (0–100), platformBreakdown: [{platform, total, unread, replied}][], dailyVolume: [{date, count}][] (last 30 days based on postedAt)}`
- [x] `InboxStatsCard` component (`src/components/inbox-stats-card.tsx`) — KPI summary row (total/unread/replied/response-rate), per-platform breakdown table, 30-day comment volume sparkline using Recharts AreaChart; loading skeleton; "No comments yet" empty state
- [x] Integrate `InboxStatsCard` into inbox page — fetched on mount in `InboxClient`; displayed in a collapsible section at the top of the inbox
- [x] Unit tests for `GET /api/inbox/stats` (auth 401, rate limit 429, empty state zeros, totalComments count, unreadCount, repliedCount, autoRepliedCount from rule matchCounts, responseRate calculation, platformBreakdown shape, dailyVolume 30 entries — 10 tests)

### Phase 211: AI-Powered Content Series Planning
- [x] Add `generateContentSeries(topic, postCount, platforms, tone?, seriesType?)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to generate a cohesive multi-part content series; each post includes title, content, hookLine, schedulingTip, and keyTakeaway; posts are designed to be interconnected and build progressively; uses prompt caching on system block; returns `{seriesTitle, description, posts: ContentSeriesPost[]}`
- [x] `POST /api/ai/content-series` endpoint — auth + rate limit + zod validation (`topic: string min 2 max 300`, `postCount: 2–10`, `platforms: string[]`, `tone?`, `seriesType?`, `createPosts?: boolean`, `campaignName?: string`); calls `generateContentSeries`; when `createPosts=true` creates DRAFT posts (and optionally a Campaign + CampaignPost links when `campaignName` provided); returns `{series, createdPostIds?, campaignId?}`; returns 503 when AI not configured
- [x] `ContentSeriesDialog` component (`src/components/content-series-dialog.tsx`) — modal with topic input, post count range slider (2–10), series type selector (Educational/Storytelling/Tips/How-To/Behind-the-Scenes/Product/Challenge/Interview), tone selector; calls `/api/ai/content-series` to generate; shows series overview card with title and description; per-post collapsible accordion with content preview, key takeaway, scheduling tip, copy and "Use in Composer" buttons; "Create N Draft Posts" CTA with optional "Create as Campaign" checkbox and campaign name input; Regenerate button
- [x] "Series" button (Layers icon) in post composer toolbar — opens `ContentSeriesDialog` with currently selected platforms; `onApply` callback sets post content
- [x] Unit tests for `POST /api/ai/content-series` (auth 401, rate limit 429, AI disabled 503, invalid JSON 400, missing topic 400, postCount out of range 400, empty platforms 400, success shape without post creation, creates posts + campaign, creates posts without campaign, AI error 500 — 11 tests)

### Phase 212: Brand Mention Tracker & Social Listening Log
- [x] `BrandMention` model in Prisma (id, userId, mentionUrl?, platform?, authorName?, content, sentiment: MentionSentiment enum POSITIVE/NEUTRAL/NEGATIVE default NEUTRAL, notes?, responseStatus String default "none", relatedPostId? FK to Post nullable, mentionedAt DateTime, createdAt, updatedAt) + migration (`20260817000000_add_brand_mentions`)
- [x] CRUD API for brand mentions (`GET /api/brand-mentions`, `POST /api/brand-mentions`, `PATCH /api/brand-mentions/[id]`, `DELETE /api/brand-mentions/[id]`) — auth + rate limit + zod validation; max 500 mentions per user; `GET` supports `?sentiment=&platform=&from=&to=&responseStatus=&page=&limit=` filters
- [x] `GET /api/brand-mentions/stats` endpoint — auth + rate limit; returns `{total, bySentiment: {positive, neutral, negative}, byPlatform: {platform, count}[], byResponseStatus: {none, acknowledged, replied, ignored}, recentVolume: [{date, count}][] (last 30 days)}`
- [x] Brand mentions page in dashboard (`/brand-mentions`) — table view of mentions with sentiment colour chips (green/grey/red), platform badge, author name, content preview (truncated 100 chars), response status badge, mentionedAt date; filter bar (sentiment, platform, date range, response status); inline create form (content required, optional URL/platform/authorName/notes/mentionedAt/relatedPostId); click-to-expand full content; delete with toast; "Update Status" quick-action per row
- [x] `MentionStatsCard` component (`src/components/mention-stats-card.tsx`) — sentiment distribution donut chart (Recharts PieChart with green/grey/red segments), response rate progress bar (replied/total), 30-day volume sparkline (Recharts AreaChart), summary counts (total/positive/negative); period shown in card header
- [x] Add "Brand Mentions" to sidebar navigation (icon: `AtSign`)
- [x] Unit tests for brand mentions API (GET list auth/rate-limit/empty/shape, GET list filters, POST create/max-limit/missing-content, PATCH update/ownership, DELETE success/ownership, GET stats auth/rate-limit/shape/counts — 14 tests)

### Phase 213: Hashtag Campaign Tracking & Performance Attribution
- [x] `HashtagCampaign` model in Prisma (id, userId, name, hashtags[], startDate, endDate?, targetPlatforms[], goal?, isActive Boolean default true, createdAt, updatedAt) + migration (`20260818000000_add_hashtag_campaigns`)
- [x] CRUD API for hashtag campaigns (`GET /api/hashtag-campaigns`, `POST /api/hashtag-campaigns`, `PATCH /api/hashtag-campaigns/[id]`, `DELETE /api/hashtag-campaigns/[id]`) — auth + rate limit + zod validation; max 50 campaigns per user
- [x] `GET /api/hashtag-campaigns/[id]/performance` endpoint — auth + rate limit + ownership; finds PUBLISHED posts containing campaign hashtags within date range; aggregates PostInsights; returns totalPosts, totalImpressions, totalReach, totalLikes, totalComments, totalShares, avgEngagement, byHashtag[], byPlatform[], topPosts[], dailyActivity[]
- [x] Hashtag campaigns list page in dashboard (`/hashtag-campaigns`) — campaign cards with hashtag chips, date range, active/paused toggle, delete, "View Performance" button
- [x] Campaign performance detail page (`/hashtag-campaigns/[id]`) — KPI cards, by-hashtag table, by-platform table, top posts list, daily activity table
- [x] Add "Hashtag Campaigns" to sidebar navigation (icon: `Hash`)
- [x] Unit tests for hashtag campaigns API (GET list, POST create, POST max-limit, POST invalid body, PATCH update, PATCH ownership, DELETE success, DELETE ownership, GET performance auth, GET performance not-found, GET performance zero posts, GET performance with matching posts, GET performance no hashtags — 13 tests)

### Phase 214: Influencer Collaboration & Partnership Tracker
- [x] `Collaboration` model in Prisma (id, userId, name, partnerName, partnerHandle?, platform?, deliverables[], startDate?, endDate?, budget?, notes?, status: CollaborationStatus) + `CollaborationPost` join table (collaborationId, postId, addedAt) + `CollaborationStatus` enum (ACTIVE/COMPLETED/CANCELLED) + migration (`20260819000000_add_collaborations`)
- [x] CRUD API for collaborations (`GET /api/collaborations`, `POST /api/collaborations`, `GET /api/collaborations/[id]`, `PATCH /api/collaborations/[id]`, `DELETE /api/collaborations/[id]`) — auth + rate limit + zod validation; max 50 collaborations per user
- [x] Post membership API (`POST /api/collaborations/[id]/posts` to add a post, `DELETE /api/collaborations/[id]/posts/[postId]` to remove) — auth + ownership check
- [x] `GET /api/collaborations/[id]/performance` endpoint — auth + rate limit + ownership; aggregates PostInsights from linked PUBLISHED posts; returns totalPosts, totalImpressions, totalReach, totalLikes, totalComments, totalShares, totalEngagement, avgEngagement, topPosts (top 5 by engagement)
- [x] Collaborations list page in dashboard (`/collaborations`) — card list with partner name, platform badge, status badge (Active/Completed/Cancelled), dates, budget, post count; inline create form; delete button
- [x] Collaboration detail page (`/collaborations/[id]`) — details card (dates, budget, deliverables, notes), performance KPI card (posts, engagement, reach), linked posts list with remove button, add-post form
- [x] Add "Collaborations" to sidebar navigation (icon: `Handshake`)
- [x] Unit tests for collaborations API (GET list auth/rate-limit/empty/shape, POST create/max-limit/invalid-body/success, PATCH update/not-found/success, DELETE auth/not-found/success, GET performance auth/not-found — 15 tests)

### Phase 215: Campaign Performance Comparison & Attribution Dashboard
- [x] `GET /api/analytics/campaign-comparison` endpoint — auth + rate limit + `?period=30d|90d|all` (default 30d); aggregates all Campaigns (CampaignPost linked posts with PostInsights), HashtagCampaigns (posts matching hashtags with insights), and Collaborations (CollaborationPost linked posts with insights) into a unified comparison; returns `{campaigns: CampaignComparisonItem[], totalCampaigns, totalPosts, totalEngagement, topCampaign, period}`; `CampaignComparisonItem` includes `{id, name, type: "content"|"hashtag"|"collaboration", postCount, engagement, impressions, reach, avgEngagement, budget?, costPerEngagement?, isActive}`
- [x] `CampaignComparisonCard` component (`src/components/campaign-comparison-card.tsx`) — summary row (campaigns/posts/engagement KPIs), type filter tabs (All / Content / Hashtag / Collaboration), sortable campaign rows with type badge, engagement/reach/cost metrics, top performer trophy icon, period selector (30d/90d/all); loading/error/empty states
- [x] Campaign comparison page in dashboard (`/campaign-comparison`) — renders `CampaignComparisonCard` full-page with title and description
- [x] Add `"campaign_comparison"` widget key and label `"Campaign Performance Comparison"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route; integrate `CampaignComparisonCard` into analytics dashboard below `TimeContentMatrixCard`
- [x] Add "Campaign ROI" to sidebar navigation (icon: `GitCompare`)
- [x] Unit tests for campaign-comparison endpoint (auth 401, rate limit 429, invalid period 400, valid periods accepted, empty state shape, content campaign engagement aggregation, hashtag campaign attribution, hashtag campaign with no hashtags, collaboration costPerEngagement calculation, collaboration without budget, topCampaign highest engagement, aggregate totals — 12 tests)

### Phase 216: Social Media Account Audit & Strategy Report
- [x] `AuditReport` model in Prisma (id, userId, period String, generatedAt DateTime, accountHealth Json, contentMix Json, postingPatterns Json, engagementBenchmarks Json, consistencyScore Json, topContent Json, recommendations String[], overallScore Int, createdAt) + migration (`20260820000000_add_audit_reports`)
- [x] `POST /api/analytics/audit` endpoint — auth + rate limit; runs comprehensive audit aggregating: account-health, content-mix (30d), posting-frequency (30d), consistency (30d), benchmarks (30d), leaderboard (top 10), writing-stats (30d); computes overall score (weighted avg); optionally generates AI recommendations when ANTHROPIC_API_KEY set; stores AuditReport in DB; returns full report
- [x] `GET /api/analytics/audit` endpoint — auth + rate limit; lists user's AuditReports ordered by generatedAt desc (last 10)
- [x] `GET /api/analytics/audit/[id]` endpoint — auth + rate limit + ownership check; returns full stored AuditReport
- [x] `AuditScoreRing` component (`src/components/audit-score-ring.tsx`) — SVG ring chart displaying 0–100 overall audit score with colour (green ≥75 / yellow ≥50 / red <50), score label, and grade letter
- [x] Audit reports page in dashboard (`/audit-reports`) — "Run New Audit" button triggers POST (shows loading state up to 30s); displays most recent audit as full-page report with sections: Overall Score (AuditScoreRing), Account Health summary, Content Mix pie, Posting Frequency table, Consistency score bar, Engagement vs Benchmarks table, Top Posts list, AI Recommendations bullet list; past audit history list below
- [x] Add "Audit" to sidebar navigation (icon: `ClipboardList`)
- [x] Unit tests for audit endpoints (POST auth, POST rate limit, POST response shape, POST stores report, GET list auth, GET list shape, GET detail auth, GET detail not-found, GET detail ownership, overall score bounds — 10 tests)

### Phase 217: Customer Testimonial & Social Proof Library
- [x] `Testimonial` model in Prisma (id, userId, authorName, authorTitle?, company?, content, rating? Int 1-5, sourceUrl?, imageUrl?, isFeatured Boolean default false, createdAt, updatedAt) + migration (`20260821000000_add_testimonials`) — stores customer quotes/reviews collected as social proof
- [x] CRUD API for testimonials (`GET /api/testimonials`, `POST /api/testimonials`, `PATCH /api/testimonials/[id]`, `DELETE /api/testimonials/[id]`) — auth + rate limit + zod validation; max 200 testimonials per user; `GET` supports `?featured=true` filter; PATCH supports partial updates including `isFeatured` toggle
- [x] `POST /api/testimonials/[id]/to-post` endpoint — auth + rate limit + ownership check; converts a saved testimonial into a DRAFT post with an attribution-formatted quote (star rating emoji + content + author/title/company); sets `mediaType: IMAGE` + `mediaUrls: [imageUrl]` when an image is set, otherwise `NONE`; returns `{postId}`
- [x] Testimonials page in dashboard (`/testimonials`) — card grid with avatar, star rating, quote, source link; "Featured only" filter toggle; inline add form (author name, title, company, quote, rating, source URL, photo URL); per-card actions: Create Post, toggle Featured, delete
- [x] Add "Testimonials" to sidebar navigation (icon: `Quote`)
- [x] Unit tests for testimonials API (GET list auth/rate-limit/featured-filter/empty, POST create/max-limit/validation, PATCH update/toggle-featured/ownership, DELETE success/ownership, to-post conversion with/without image — 29 tests)

### Phase 218: Public Testimonial Submission & Collection Pages
- [x] `TestimonialPage` model in Prisma (id, userId, slug unique, title, welcomeMessage?, thankYouMessage?, isActive Boolean default true, createdAt, updatedAt) + migration (`20260822000000_add_testimonial_pages`) — public-facing collection forms that feed directly into the Testimonial library
- [x] CRUD API for testimonial pages (`GET /api/testimonial-pages`, `POST /api/testimonial-pages`, `PATCH /api/testimonial-pages/[id]`, `DELETE /api/testimonial-pages/[id]`) — auth + rate limit + zod validation; max 5 pages per user; slug uniqueness check with 409 conflict
- [x] Public submission page (`/t/[slug]`) — server-rendered; shows title + welcome message + `SubmissionForm` client component (name, title, company, content, star rating); thank-you state after submission; `generateMetadata` for SEO; 404 for inactive/missing pages
- [x] `GET /api/t/[slug]` + `POST /api/t/[slug]` endpoints — public, no auth; GET returns sanitized page info (title, welcomeMessage, isActive only); POST validates + sanitizes input, IP-rate-limited (5/min via `rateLimit`), creates a `Testimonial` row linked to the page owner, returns 201; 404 for inactive/missing pages
- [x] Testimonial pages management UI — new tab in `/testimonials` dashboard page: list pages with copy-link button, active/inactive toggle, inline create form (title, slug, welcome/thank-you messages), delete
- [x] Unit tests for testimonial pages CRUD + public submission routes (GET/POST/PATCH/DELETE `/api/testimonial-pages` — auth, rate limit, max-pages, slug conflict, ownership; `GET`/`POST /api/t/[slug]` — public access, IP rate limit, validation, inactive page 404, Testimonial row creation — 33 tests)

### Phase 219: Paid Promotion & Ad Spend Tracking
- [x] `PostPromotion` model in Prisma (id, userId, postId? FK to Post nullable, platform: Platform, campaignName, budget?, spend Float default 0, currency String default "USD", startDate?, endDate?, goal?, status: PromotionStatus, impressions Int default 0, clicks Int default 0, conversions Int default 0, notes?, createdAt, updatedAt) + `PromotionStatus` enum (PLANNED/ACTIVE/COMPLETED/CANCELLED) + migration (`20260823000000_add_post_promotions`) — tracks paid boosts/ad spend linked to posts for ROI analysis
- [x] CRUD API for promotions (`GET /api/promotions`, `POST /api/promotions`, `PATCH /api/promotions/[id]`, `DELETE /api/promotions/[id]`) — auth + rate limit + zod validation; max 200 promotions per user; `GET` supports `?status=` and `?platform=` filters; optional `postId` ownership check on create/update
- [x] Promotion ROI utility (`src/lib/promotion-roi.ts`) — `computeRoiMetrics(promotion)` derives CPM/CPC/CPA/CTR/budgetUtilization for a single promotion; `computePlatformPromotionRoi(promotions)` groups by platform, sums totals, computes avgCpm/avgCpc/avgCpa/avgCtr/budgetUtilization, sorted by totalSpend descending; `formatCurrency` helper
- [x] `GET /api/analytics/promotion-roi` endpoint — auth + rate limit + `?period=30d|90d|all`; queries user's promotions in the period; calls `computePlatformPromotionRoi`; returns `{period, platforms, totalBudget, totalSpend, totalPromotions, activePromotions}`
- [x] `PromotionRoiCard` component (`src/components/promotion-roi-card.tsx`) — per-platform ROI breakdown with spend vs budget progress bars, CPM/CPC/CPA/CTR metric chips, period selector (30d/90d/all), "No promotions yet" empty state; integrated into analytics dashboard; add `"promotion_roi"` widget key and label to `WIDGET_KEYS`/`WIDGET_LABELS` in dashboard-widgets route and `DashboardCustomizeDialog`
- [x] Promotions management page in dashboard (`/promotions`) — list/table of promotions with platform badge, status chip, spend/budget bar, CTR/CPA metrics, linked post preview; inline create form (campaign name, platform, linked post selector, budget, spend, currency, dates, goal, status); edit-in-place; delete with confirmation toast
- [x] Add "Promotions" to sidebar navigation (icon: `BadgeDollarSign`)
- [x] Unit tests for promotions API and ROI utility (GET list, POST create, POST max-limit, POST invalid platform, PATCH update, PATCH ownership, DELETE success, DELETE ownership, GET ROI auth/rate-limit/period-filter/totals/platform-breakdown/sort-order — 36 tests)

### Phase 220: Broken Link Detection & URL Health Monitoring
- [x] `LinkHealthCheck` model in Prisma (id, postId, userId, url, statusCode?, isHealthy, errorMessage?, checkedAt) + `@@unique([postId, url])` + migration (`20260824000000_add_link_health_checks`) — persists per-URL health check results for a post
- [x] Link health utility (`src/lib/link-health.ts`) — re-exports `extractUrls` from `@/lib/utm`; `checkUrlHealth(url)` performs a HEAD request with `AbortController` timeout, falls back to GET on 405/501/HEAD-failure, classifies 2xx/3xx as healthy and 4xx/5xx as unhealthy with `HTTP {status}` message, returns `"Request timed out"` for aborts, `"Invalid URL"`/`"Unsupported URL scheme"` for malformed/non-http(s) URLs without calling fetch; `checkUrlsHealth(urls)` checks all URLs in parallel and truncates to `MAX_LINKS_PER_CHECK`
- [x] `POST /api/posts/[id]/check-links` endpoint — auth + rate limit + ownership check; extracts URLs from post content, runs `checkUrlsHealth`, upserts `LinkHealthCheck` rows in a `prisma.$transaction`, returns `{checked, healthy, broken, results}`; returns a zeroed result without checking when the post has no links
- [x] `GET /api/posts/[id]/link-health` endpoint — auth + rate limit + ownership check; returns persisted check results ordered by `checkedAt desc` as `{checks, total, healthy, broken, lastCheckedAt}`
- [x] `LinkHealthCard` component (`src/components/link-health-card.tsx`) — shows last-checked summary (healthy/broken counts), per-link status rows with status code and error message, "Check Links" button to trigger a fresh scan, loading/empty states; integrated into the post versions page between `SeoAnalysisCard` and `QualityDashboard`
- [x] Unit tests for the link health utility (`extractUrls` re-export, `checkUrlHealth` 2xx/4xx/3xx/HEAD-fallback-405/HEAD-fallback-501/HEAD-throws/timeout/generic-error/invalid-URL/unsupported-scheme, `checkUrlsHealth` parallel + truncation — 13 tests) and API endpoints (GET link-health: auth, rate limit, not-found, ownership, summary shape, zeroed empty state, ordering — 9 tests; POST check-links: auth, rate limit, not-found, ownership, no-links zeroed result, persists results + summary shape, 500 on error — 8 tests; total 31 tests)

### Phase 221: Custom Post Metadata Fields
- [x] `CustomField` model in Prisma (id, userId, key, label, fieldType String ("text"|"number"|"date"|"url"|"select"), options String[] for select choices, defaultValue?, isRequired Boolean default false, isActive Boolean default true, order Int default 0, createdAt, updatedAt) + `PostCustomFieldValue` model (id, postId, fieldId, value String, createdAt, updatedAt) + `@@unique([postId, fieldId])` + migration (`20260825000000_add_custom_fields`)
- [x] CRUD API for custom field definitions (`GET /api/custom-fields`, `POST /api/custom-fields`, `PATCH /api/custom-fields/[id]`, `DELETE /api/custom-fields/[id]`) — auth + rate limit + zod validation; max 20 fields per user; DELETE removes field and all associated values
- [x] Custom field values API (`GET /api/posts/[id]/custom-fields`, `PUT /api/posts/[id]/custom-fields`) — auth + rate limit + ownership check; PUT replaces all field values for a post; validates required fields; returns `{values: [{fieldId, key, label, value}]}`
- [x] Extend `GET /api/posts` to support `?customField[key]=value` query param — filters posts where the specified custom field matches the given value
- [x] Custom fields management page in dashboard (`/custom-fields`) — list fields with type badge, required indicator, active toggle; reorder via up/down buttons; inline create form (label, key auto-derived from label, type selector, required toggle, select options input when type=select); delete with confirmation toast
- [x] Custom field inputs in post composer — compact collapsible "Custom Fields" section showing active fields as labeled inputs (text/number/date/url as `<input>`, select as `<select>`); values saved via PUT after post creation/update
- [x] Add "Custom Fields" to sidebar navigation (icon: `Tags`)
- [x] Unit tests for custom fields API (GET list, POST create, POST max-limit, POST invalid type, PATCH update, PATCH ownership, DELETE cascades values, GET post fields, PUT post fields with required validation, PUT missing required field, `?customField` filter — auth, rate limit — 16 tests)

### Phase 222: AI-Generated Social Media Bio Generator
- [x] Add `generateSocialBios(name, description, platforms, niche?, keywords?)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to generate optimized, platform-specific bios; defines `PLATFORM_BIO_LIMITS` map per platform (Twitter: 160, Instagram: 150, LinkedIn: 220, TikTok: 80, Facebook: 255, etc.); uses prompt caching on system block; truncates each bio to its platform limit; returns `{bios: {platform, bio, charCount, charLimit}[]}`
- [x] `POST /api/ai/generate-bios` endpoint — auth + rate limit + zod validation (`name: string min 1 max 100`, `description: string min 1 max 500`, `platforms: string[] min 1`, `niche?: string max 100`, `keywords?: string[] max 10`); calls `generateSocialBios`; returns `{bios}`; returns 503 when AI not configured
- [x] `SocialBioGeneratorDialog` component (`src/components/social-bio-generator-dialog.tsx`) — modal with name/brand input, description textarea (500-char counter), niche input, keywords input (comma-separated), platform chip selector (pre-marks connected accounts with a green dot); calls `/api/ai/generate-bios`; shows per-platform bio cards with character count vs limit, colour indicator (green/yellow/red), copy-to-clipboard; "Generate" / "Regenerate" button; loading state
- [x] `GenerateBiosButton` client component (`src/app/(dashboard)/accounts/generate-bios-button.tsx`) — small client component rendering the button + dialog; renders in the accounts page header when `ANTHROPIC_API_KEY` is set
- [x] Unit tests for bio generator endpoint (auth 401, rate limit 429, AI disabled 503, invalid JSON 400, name missing 400, empty platforms 400, success shape with platform/bio/charCount/charLimit, optional niche and keywords forwarded, AI error 500 — 9 tests)

### Phase 223: Post Draft Locking & Concurrent Edit Prevention
- [x] `PostLock` model in Prisma (id, postId unique, userId, lockedAt DateTime @default(now()), expiresAt DateTime) + migration (`20260826000000_add_post_locks`) — one lock per post, prevents concurrent edits in team environments
- [x] `GET /api/posts/[id]/lock` endpoint — no auth required; returns `{locked, lockedBy: {id, name, email}, expiresAt}` or `{locked: false}`; auto-deletes expired lock records
- [x] `POST /api/posts/[id]/lock` endpoint — auth + rate limit; acquires or refreshes lock with 15-minute expiry; returns 409 with `lockedBy` info when post is locked by another user; refreshes own expired lock transparently
- [x] `DELETE /api/posts/[id]/lock` endpoint — auth + rate limit + ownership check; releases own lock; 403 when lock held by another user; 204 on success
- [x] `PostLockIndicator` component (`src/components/post-lock-indicator.tsx`) — polls `GET /api/posts/[id]/lock` every 30 s; shows amber badge "Locked by [name] · Xm" when post is locked by another user; hides for own locks
- [x] `usePostLock` hook (`src/hooks/use-post-lock.ts`) — acquires lock on mount, sends keepalive every 5 minutes, releases on unmount; returns `{isAcquired, isAcquiring, error, expiresAt, release}`
- [x] Unit tests for lock endpoints (GET no-lock, GET expired-auto-deletes, GET active-lock; POST 401, POST 429, POST 404, POST acquires new, POST refreshes own, POST 409 another-user; DELETE 401, DELETE 429, DELETE 404, DELETE 403 other-user, DELETE 204 own — 14 tests)

### Phase 224: Viral Post Detection & Engagement Velocity Tracking
- [x] Viral detection utility (`src/lib/viral-detection.ts`) — `computeEngagementVelocity(totalEngagement, publishedAt)` computes engagement score per hour since publishing; `classifyViralStatus(velocity, avgVelocity)` returns "viral" (≥3× avg), "trending" (≥1.5× avg), or "normal"; `detectViralPosts(posts)` returns per-publish-result velocity data sorted by velocityPerHour descending; weighted engagement formula (likes×3 + comments×5 + shares×4 + reach + impressions×0.5)
- [x] `GET /api/analytics/viral-posts` endpoint — auth + rate limit + `?period=24h|48h|7d&limit=`; queries user's PUBLISHED posts with PostInsights in the period; flattens to per-platform publish results; runs `detectViralPosts`; returns `{period, posts: PostVelocityData[], avgVelocity, totalPosts}`
- [x] `ViralPostsCard` component (`src/components/viral-posts-card.tsx`) — ranked list of posts with 🔥 Viral / ⬆️ Trending / Normal badges, engagement velocity (pts/hr), per-post metric chips (likes/comments/shares/reach/age), platform badge, content preview; period selector (24h/48h/7d); avg velocity summary; loading skeleton; "No data" empty state with sync hint
- [x] Integrate `ViralPostsCard` into analytics dashboard below `PromotionRoiCard`; add `"viral_posts"` widget key and label `"Viral Post Detection"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route
- [x] Unit tests for viral detection utility (computeEngagementVelocity, classifyViralStatus, detectViralPosts sort order, viral labelling with 10 posts, metric breakdown — 8 tests) and API endpoint (auth, rate limit, invalid period, empty state, posts shape, 24h period, no-insights skipped, DB error — 12 tests)

### Phase 225: Period-over-Period Performance Comparison
- [x] `GET /api/analytics/period-comparison` endpoint — auth + rate limit + `?period=7d|30d|90d` (default 30d); computes metrics for the current period AND the previous equal-duration period; returns `{period, current: {posts, engagement, reach, impressions, avgEngagementRate, platformBreakdown}, previous: {...}, deltas: {posts, engagement, reach, impressions, avgEngagementRate}}`; delta = (current - previous) / previous × 100 as percentage change
- [x] `PeriodComparisonCard` component (`src/components/period-comparison-card.tsx`) — side-by-side KPI cards (Posts Published, Total Engagement, Total Reach, Avg Engagement Rate) each showing current value + percentage change arrow (green ↑ / red ↓ / grey = unchanged); platform-by-platform comparison table with current/previous columns; period selector (7d/30d/90d); loading skeleton; "Not enough data" empty state when previous period has zero activity
- [x] Integrate `PeriodComparisonCard` into analytics dashboard below `ViralPostsCard`; add `"period_comparison"` widget key and label `"Period-over-Period Comparison"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route; add to `DashboardCustomizeDialog`
- [x] Unit tests for period-comparison endpoint (auth, rate limit, period validation, current/previous bucket split, delta calculation, zero-previous → null delta, platform breakdown shape, empty state — 10 tests)

### Phase 226: Bulk AI Content Generation from Topics
- [x] Add `bulkGenerateContent(topics, platforms, tone?)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to generate unique post content for each topic; uses prompt caching on system block; returns `{results: {topic, content, charCount}[]}`
- [x] `POST /api/ai/bulk-generate` endpoint — auth + rate limit + zod validation (`topics: string[] 1–20 items`, `platforms: Platform[] min 1`, `tone?: string`, `createPosts?: boolean`, `campaignName?: string`); calls `bulkGenerateContent`; when `createPosts=true` creates DRAFT posts (and optionally a Campaign + CampaignPost links when `campaignName` provided); returns `{generated: {topic, content}[], createdPostIds?: string[], campaignId?: string}`; 503 when AI not configured
- [x] `BulkGenerateDialog` component (`src/components/bulk-generate-dialog.tsx`) — modal with topics textarea (one per line, max 20, live count), platform multi-select chips, tone selector; calls `/api/ai/bulk-generate` to preview; shows per-topic content cards with char count and per-platform character indicators; "Create N Draft Posts" CTA with optional campaign name input; regenerate option; loading/empty states
- [x] "Bulk Generate" button (Wand icon) in posts list page header — opens `BulkGenerateDialog`; on creation toasts success and refreshes list
- [x] Unit tests for `POST /api/ai/bulk-generate` (auth 401, rate limit 429, AI disabled 503, invalid JSON 400, empty topics 400, >20 topics 400, empty platforms 400, success shape without post creation, creates posts with correct DRAFT status, creates campaign + CampaignPost links, AI error 500 — 11 tests)

### Phase 227: Automated Post Sequence Builder (Drip Campaigns)
- [x] `PostSequence` model in Prisma (id, userId, name, description?, status: SequenceStatus, startDate?, timezone, createdAt, updatedAt) + `SequenceStep` model (id, sequenceId, stepOrder, delayDays, content, mediaType, mediaUrls[], platforms[], postId? FK to Post nullable) + `SequenceStatus` enum (DRAFT/ACTIVE/PAUSED/COMPLETED/CANCELLED) + migration (`20260827000000_add_post_sequences`)
- [x] CRUD API for sequences (`GET /api/sequences`, `POST /api/sequences`, `GET /api/sequences/[id]`, `PATCH /api/sequences/[id]`, `DELETE /api/sequences/[id]`) — auth + rate limit + zod validation; max 50 sequences per user; include steps in responses
- [x] Steps API (`GET /api/sequences/[id]/steps`, `POST /api/sequences/[id]/steps`) — auth + ownership check + rate limit; max 50 steps per sequence
- [x] Step item API (`PATCH /api/sequences/[id]/steps/[stepId]`, `DELETE /api/sequences/[id]/steps/[stepId]`) — auth + ownership check + rate limit; zod validated; 204 on delete
- [x] `POST /api/sequences/[id]/start` endpoint — auth + rate limit; validates startDate (ISO 8601), status not ACTIVE/CANCELLED, at least 1 step; creates DRAFT/SCHEDULED posts per step (scheduledAt = startDate + delayDays), creates PublishResult rows for valid platforms, marks sequence ACTIVE; transaction-safe; logs activity
- [x] `POST /api/sequences/[id]/pause` endpoint — auth + rate limit; validates status === ACTIVE; marks sequence PAUSED
- [x] `POST /api/sequences/[id]/cancel` endpoint — auth + rate limit; validates status !== CANCELLED; reverts SCHEDULED step posts back to DRAFT, marks sequence CANCELLED; logs activity
- [x] Sequences dashboard page (`/sequences`) — `SequencesClient` with expandable `SequenceCard` per sequence showing status badge, step timeline (content preview + delay), action buttons (Start / Pause / Cancel / Delete); `CreateSequenceDialog`; `AddStepDialog`; `StartSequenceDialog` (pick startDate, shows projected schedule per step)
- [x] Add "Sequences" to sidebar navigation (icon: `ListVideo`)
- [x] Unit tests for sequences API (GET/POST/PATCH/DELETE sequences, GET/POST steps, PATCH/DELETE step items, POST start, POST pause, POST cancel — auth, rate limit, ownership, state validation, conflict states — 32 tests)

### Phase 228: Cross-Post Performance Correlation Analysis
- [x] Correlation analysis utility (`src/lib/correlation.ts`) — `analyzePostCorrelations(posts)` analyses relationships between post attributes and engagement across 6 dimensions (day-of-week, hour-of-day, content-length, hashtag-count, media-type, content-category); returns top 5 `CorrelationResult` insights sorted by engagement multiplier (only buckets with ≥3 posts and ≥20% improvement included)
- [x] `GET /api/analytics/correlations` endpoint — auth + rate limit + `?period=30d|90d|all`; queries user's PUBLISHED posts with PostInsights; calls `analyzePostCorrelations`; returns `{period, insights: CorrelationResult[], totalPosts}`
- [x] `CorrelationInsightsCard` component (`src/components/correlation-insights-card.tsx`) — shows actionable insights as Lightbulb cards with multiplier badge (green ≥2× / amber ≥1.5× / indigo <1.5×), insight text, sample size; period selector (30d/90d/all); loading skeleton; "Not enough data" empty state
- [x] Integrate `CorrelationInsightsCard` into analytics dashboard below `PeriodComparisonCard`; add `"correlations"` widget key and label `"Performance Correlation Insights"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route
- [x] Unit tests for correlation endpoint (auth, rate limit, period validation, empty state, period echoed, defaults to 30d, totalPosts count, response shape, insights sorted by multiplier, insight shape, DB error — 10 tests)

### Phase 229: Schedule Optimizer using Correlation Insights
- [x] Schedule optimizer utility (`src/lib/schedule-optimizer.ts`) — `optimizeSchedule(scheduledPosts, historicalPosts, options)` uses `analyzePostCorrelations` to find optimal day-of-week and hour-of-day; for each SCHEDULED post that isn't already at an optimal time, suggests a better slot within the window; skips moves where the improvement factor is <1.2× and avoids conflicts (other posts within 30 min); returns `OptimizationProposal[]` sorted by improvement factor descending; exports `parseDayName` and `parseHourLabel` helpers
- [x] `POST /api/posts/optimize-schedule` endpoint — auth + rate limit + zod validation (`dryRun: boolean default true`, `windowDays: 1–60 default 30`); loads SCHEDULED posts in window + 90-day historical posts with insights; calls `optimizeSchedule`; when `dryRun=false` applies changes in a Prisma transaction and logs activity; returns `{proposals, totalScheduled, optimized, dryRun}`
- [x] `ScheduleOptimizerDialog` component (`src/components/schedule-optimizer-dialog.tsx`) — modal triggered by "Optimize Schedule" button; auto-runs dry-run analysis on open; shows per-proposal rows with current → proposed time arrows and improvement factor badge (green); "Apply N changes" button calls endpoint with dryRun=false and toasts result; "No optimal changes" empty state
- [x] Add `ScheduleOptimizerDialog` to posts page header alongside Bulk Generate button
- [x] Unit tests for `parseDayName`/`parseHourLabel` helpers, `optimizeSchedule` utility (empty inputs, <5 history, no threshold met, Tuesday high engagement suggestion, proposed time is in future), and API endpoint (auth, rate limit, invalid windowDays, empty scheduled, no historical, response shape, dryRun default, dryRun=false skips transaction when no proposals, DB error — 23 tests)

### Phase 230: Content Syndication Rules & Automated Cross-Platform Distribution
- [x] `SyndicationRule` model in Prisma (id, userId, name, sourcePlatform Platform, targetPlatforms Platform[], transformations Json (truncate?, appendHashtags?, stripLinks?, customSuffix?), delayMinutes Int default 0, isActive Boolean default true, createdAt, updatedAt) + migration (`20260828000000_add_syndication_rules`) — defines how content published to one platform gets automatically adapted and cross-posted to others
- [x] CRUD API for syndication rules (`GET /api/syndication-rules`, `POST /api/syndication-rules`, `PATCH /api/syndication-rules/[id]`, `DELETE /api/syndication-rules/[id]`) — auth + rate limit + zod validation; max 20 rules per user; validate sourcePlatform ≠ targetPlatforms
- [x] `POST /api/syndication-rules/[id]/test` endpoint — auth + rate limit + ownership check; accepts `{content: string, mediaType: MediaType}`; applies transformations and returns `{original, adapted: {platform, content}[]}` preview without creating posts
- [x] Syndication utility (`src/lib/syndication.ts`) — `applyTransformations(content, transformations, targetPlatform)` truncates to platform char limit, strips URLs if stripLinks, appends customSuffix, appends hashtags; `getSyndicationRulesForPlatform(userId, platform)` fetches matching active rules
- [x] Update BullMQ publish worker — after a successful PUBLISHED result, look up syndication rules matching the published platform; for each matching rule, create a new DRAFT/SCHEDULED post (scheduledAt = now + delayMinutes) with adapted content for each target platform; logs activity
- [x] Syndication rules management page in dashboard (`/syndication`) — list rules with source→target platform arrow badges, delay chip, active/pause toggle; inline create form (name, source platform, target platforms multi-select, delay dropdown 0/15/30/60/120/240 min, transformation checkboxes + customSuffix input); delete with confirmation toast
- [x] Add "Syndication" to sidebar navigation (icon: `Share2`)
- [x] Unit tests for syndication utility and API endpoints (applyTransformations truncation, stripLinks, appendHashtags, customSuffix; GET list, POST create, POST max-limit, POST invalid same-platform, PATCH update, PATCH ownership, DELETE success, test endpoint preview — auth, rate limit, validation — 18 tests)

### Phase 231: Content Atomization & Long-Form to Social Post Conversion
- [x] Add `atomizeContent(longFormContent, platforms, targetPostCount)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to break down a long-form article/blog post into a series of bite-sized social media posts; uses prompt caching on system block; returns `{posts: {content: string, keyTakeaway: string, suggestedPlatforms: string[]}[], summary: string, sourceTitle?: string}`
- [x] `POST /api/ai/atomize` endpoint — auth + rate limit + zod validation (`content: string min 100 max 50000`, `platforms: Platform[]`, `targetPostCount?: 3–20 default 7`, `createPosts?: boolean`, `campaignName?: string`); calls `atomizeContent`; when `createPosts=true` creates DRAFT posts (and optionally a Campaign + CampaignPost links when `campaignName` provided); returns `{posts, summary, sourceTitle?, createdPostIds?, campaignId?}`; 503 when AI not configured
- [x] `ContentAtomizeDialog` component (`src/components/content-atomize-dialog.tsx`) — modal with large textarea for pasting long-form content (50k char limit with counter), platform chip selector, target post count slider (3–20); calls `/api/ai/atomize`; shows grid of generated posts with content preview, key takeaway, suggested platforms; "Create N Draft Posts" CTA with optional campaign name input; regenerate button; loading/empty states
- [x] `AtomizeContentButton` client component (`src/app/(dashboard)/posts/atomize-content-button.tsx`) — renders in posts page header; opens `ContentAtomizeDialog`; toasts on creation and refreshes list
- [x] Unit tests for `POST /api/ai/atomize` (auth 401, rate limit 429, AI disabled 503, invalid JSON 400, content too short 400, content too long 400, empty platforms 400, success shape without post creation, creates posts with correct DRAFT status, creates campaign + CampaignPost links, AI error 500 — 11 tests)

### Phase 232: Social Media Holiday & Events Calendar
- [x] `SocialEvent` model in Prisma (id, userId nullable String, title, description?, date String YYYY-MM-DD, type: EventType enum HOLIDAY/OBSERVANCE/AWARENESS_DAY/CUSTOM, platforms String[], categories String[], isGlobal Boolean default false, createdAt, updatedAt) + migration (`20260901000000_add_social_events`)
- [x] `GET /api/social-events` endpoint — auth + rate limit + `?month=YYYY-MM&type=&platform=` filters; returns global events + user custom events for the given month (defaults to current month)
- [x] `POST /api/social-events` endpoint — create custom events; auth + rate limit + zod validation; max 100 custom events per user
- [x] `DELETE /api/social-events/[id]` endpoint — delete custom event; auth + rate limit + ownership check (cannot delete isGlobal events, returns 403)
- [x] `POST /api/ai/event-content` endpoint — AI suggestions (3 content variants) for a social event given title, description, platforms; auth + rate limit; 503 when AI not configured; uses claude-haiku-4-5 with prompt caching
- [x] Social events page in dashboard (`/social-events`) — timeline of upcoming events for next 90 days grouped by month; type filter tabs (All / Holidays / Observances / Awareness Days / Custom); inline create-custom-event form (title, date, type, description); "AI Suggest" button per event opens a dialog with 3 generated content variants and copy/use-in-composer actions; globe icon for global events, user icon for custom events; delete button for custom events
- [x] Add "Social Events" to sidebar navigation (icon: `CalendarDays`) between Calendar Shares and Planner
- [x] Unit tests for social events API (GET auth/rate-limit/month-filter/type-filter/returns-global+custom, POST create/max-limit/invalid-date/validation, DELETE custom-success/global-rejected/not-found/ownership, event-content auth/rate-limit/AI-disabled/success-shape — 18 tests)

### Phase 233: Social Media Profile Optimizer & Account Performance Scoring
- [x] Profile optimizer utility (`src/lib/profile-optimizer.ts`) — rule-based scoring across 4 dimensions: Activity (posts/week vs platform-recommended, 0–25), Engagement (avgEngagementRate vs platform benchmark, 0–25), Growth (follower growth trend over 90d, 0–25), Consistency (stdDev of posting intervals via coefficient of variation, 0–25); `computeProfileScore(input)` returns `{overallScore, grade: "A"|"B"|"C"|"D"|"F", dimensions: {name, score, max, label}[], tips: {dimension, tip, priority: "high"|"medium"|"low", action}[]}` with tips sorted high→medium→low
- [x] `GET /api/analytics/profile-optimizer` endpoint — auth + rate limit; for each active SocialAccount queries AudienceMetric (90d, for growth trend), PublishResult (90d PUBLISHED, for activity + consistency), PostInsights (90d, for engagement); calls `computeProfileScore`; returns `{accounts: ProfileOptimizationData[], fleetScore}` where fleetScore is the rounded average of all account overall scores
- [x] `ProfileOptimizerCard` component (`src/components/profile-optimizer-card.tsx`) — fleet-wide average score banner with accounts-needing-attention count; per-account accordion cards showing grade badge (A–F colour-coded circle), dimension score bars with label (Activity / Engagement / Growth / Consistency), prioritized tip cards with action links; loading skeleton; empty state when no accounts connected
- [x] Profile optimizer page in dashboard (`/profile-optimizer`) — renders `ProfileOptimizerCard` with page header and description
- [x] Add "Profile Optimizer" to sidebar navigation (icon: `Target`)
- [x] Unit tests for profile optimizer utility and API endpoint (score fields, score 0–100, grade A/F boundaries, activity 25 at recommended pace, activity 0 when no posts, engagement 25 above benchmark, growth 25 with ≥5% growth, growth 0 on decline, consistency 25 with even timestamps, consistency 0 with <2 timestamps, tips sorted, no tips on high scores, neutral growth when no data; API: auth, rate limit, empty accounts, account score shape, 4 dimensions, fleet average, no-posts low score, tips priority-sorted, dimension sum ≤100, DB error 500 — 24 tests)

### Phase 234: Competitor Benchmarking & Market Position Tracking
- [x] `CompetitorAccount` model in Prisma (id, userId, name, platform Platform, handle, profileUrl?, notes?, createdAt, updatedAt) + `CompetitorSnapshot` model (id, competitorId, followersCount?, avgEngagementRate?, postsPerWeek?, avgLikes?, avgComments?, recordedAt, createdAt) + migration (`20260903000000_add_competitor_benchmarks`)
- [x] CRUD API for competitor accounts (`GET /api/competitor-accounts`, `POST /api/competitor-accounts`, `PATCH /api/competitor-accounts/[id]`, `DELETE /api/competitor-accounts/[id]`) — auth + rate limit + zod validation; max 20 competitors per user
- [x] Competitor snapshot API (`POST /api/competitor-accounts/[id]/snapshot`) — auth + rate limit + ownership check; accepts `{followersCount?, avgEngagementRate?, postsPerWeek?, avgLikes?, avgComments?}`; creates CompetitorSnapshot record; returns snapshot
- [x] `GET /api/analytics/competitive-benchmark` endpoint — auth + rate limit; for each platform, gathers user's latest SocialAccount AudienceMetric + PostInsights data alongside competitor latest snapshots; returns `{platforms: {platform, userAccounts: [{accountId, accountName, followersCount, avgEngagementRate, postsPerWeek}], competitors: [{competitorId, name, handle, followersCount, avgEngagementRate, postsPerWeek}], bestFollowers, bestEngagement}[]}`
- [x] `CompetitiveBenchmarkCard` component (`src/components/competitive-benchmark-card.tsx`) — per-platform accordion showing user accounts vs competitors in a sortable table; "You" rows highlighted; best-in-class value highlighted green; gap analysis column (% diff from best); platform tab selector; "Add competitor" CTA when empty; loading skeleton
- [x] Competitors page in dashboard (`/competitors`) — list competitors with platform badge, handle, latest snapshot metrics (followers, engagement rate, posts/week); "Record Snapshot" button opens inline form per competitor; inline create form (name, platform, handle, profile URL, optional notes); delete with confirmation toast
- [x] Integrate `CompetitiveBenchmarkCard` into analytics dashboard below `CorrelationInsightsCard`; add `"competitive_benchmark"` widget key and label `"Competitor Benchmarking"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route; add to `DashboardCustomizeDialog`
- [x] Add "Competitors" to sidebar navigation (icon: `Swords`)
- [x] Unit tests for competitor accounts API and competitive benchmark endpoint (GET list auth/rate/empty/shape, POST create/max-limit/invalid-body/success, PATCH update/not-found/ownership, DELETE success/ownership, POST snapshot auth/rate/not-found/ownership/success/shape, GET benchmark auth/rate/empty/platform-grouping/user-vs-competitor-shape — 14 tests)

### Phase 235: Content Performance Journal & Learnings Library
- [x] `JournalEntryType` enum (SUCCESS/FAILURE/INSIGHT/HYPOTHESIS/EXPERIMENT) + `ContentJournalEntry` model in Prisma (id, userId, postId? FK to Post with SetNull, title, entryType, content, rating? Int 1-5, tags String[], isPublicToTeam Boolean) + migration (`20260904000000_add_content_journal`)
- [x] CRUD API for journal entries (`GET /api/journal`, `POST /api/journal`, `GET /api/journal/[id]`, `PATCH /api/journal/[id]`, `DELETE /api/journal/[id]`) — auth + rate limit + zod validation; max 500 entries per user; `GET` supports `?entryType=&tag=&postId=&search=&page=&limit=` filters; POST validates postId ownership; returns 201 with created entry
- [x] `GET /api/journal/stats` endpoint — auth + rate limit; returns `{total, byType: Record<JournalEntryType, number>, topTags: {tag, count}[], avgRating: number | null}`
- [x] Journal dashboard page (`/journal`) — stats grid (count per entry type as filter buttons), create form (type selector chips, content textarea, 1–5 star rating, comma-separated tags), search + type/tag filters, expandable entry list with inline edit mode and star rating display
- [x] `AddToJournalButton` component (`src/app/(dashboard)/posts/add-to-journal-button.tsx`) — ghost icon button per post row; opens modal dialog with linked post preview, entry type chips, content textarea, tags input; POSTs to `/api/journal` with `postId` linked
- [x] Integrate `AddToJournalButton` into `PostsListClient` (post row actions bar)
- [x] Add "Journal" to sidebar navigation (icon: `NotebookPen`)
- [x] Unit tests for journal API (GET list auth/rate-limit/pagination/entryType-filter, POST create/max-limit/invalid-body/success/postId-ownership, GET single/not-found, PATCH update/ownership, DELETE success/ownership, GET stats auth/rate-limit/empty/shape — 23 tests)

### Phase 236: AI Content Idea Scoring & Prioritization
- [x] Add `score Int?` field to `ContentIdea` model + Prisma migration (`20260905000000_add_idea_score`) — persists most recent AI score alongside the idea
- [x] Add `scoreContentIdea(ideaTitle, platforms, ideaDescription?, existingTopics?)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to evaluate idea across 5 dimensions (Originality, Brand Fit, Audience Interest, Timeliness, Estimated Engagement); uses prompt caching on system block; returns `{overallScore, dimensions, topStrengths, topWeaknesses, recommendation: "pursue"|"refine"|"skip"}`
- [x] `POST /api/ai/score-idea` endpoint — auth + rate limit + zod validation (`title: string`, `description?: string`, `platforms: Platform[]`); loads user's last 20 content ideas as originality context; calls `scoreContentIdea`; returns `{score}`; 503 when AI not configured; 500 when AI returns null
- [x] Extend `PATCH /api/ideas/[id]` to accept optional `score` field (0–100 Int); include `score` in GET and POST idea responses
- [x] `IdeaScoringDialog` component (`src/components/idea-scoring-dialog.tsx`) — modal showing animated score ring (green ≥70 / yellow ≥40 / red <40), 5-dimension score bars with explanations, strengths/weaknesses lists, recommendation badge (Pursue/Refine/Skip); "Save Score" button persists score via PATCH; "Regenerate" button re-runs scoring
- [x] "Score" button (Sparkles icon) per idea card in the Ideas Kanban board (`/ideas`) — opens `IdeaScoringDialog`; score pill badge shown on cards when score is stored
- [x] Unit tests for `POST /api/ai/score-idea` (auth, rate limit, AI disabled, missing title, empty platforms, invalid JSON, success shape, dimensions included, recommendation values, existing topics forwarded, AI returns null → 500, AI error → 500 — 12 tests)

### Phase 237: AI-Powered Daily Social Media Briefing
- [x] `DailyBriefing` model in Prisma (id, userId, date String YYYY-MM-DD, todayScheduled, weekScheduled, yesterdayStats Json, contentGaps Json, topHashtags Json, summary, recommendations Json, generatedAt) + `@@unique([userId, date])` + migration (`20260906000000_add_daily_briefing`)
- [x] Add `generateDailyBriefing(data)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to generate morning briefing summary + 3 actionable recommendations; uses prompt caching on system block; returns `{summary, recommendations}`
- [x] `GET /api/ai/daily-briefing` endpoint — returns most recent briefing for the current user; auth + rate limit
- [x] `POST /api/ai/daily-briefing` endpoint — gathers today's schedule, yesterday's published stats, content gaps in next 7 days, and top hashtags; calls `generateDailyBriefing`; upserts result keyed to today's date; auth + rate limit + 503 when AI not configured
- [x] BullMQ daily briefing worker (`src/lib/queue/workers/daily-briefing.ts`) — daily cron 08:00 UTC; for each user with active social accounts, generates briefing; add `DAILY_BRIEFING` to `QUEUE_NAMES`; add `scheduleDailyBriefing()` to scheduler; register worker + cron in `workers/queue-worker.ts`
- [x] `DailyBriefingCard` component (`src/components/daily-briefing-card.tsx`) — shows AI summary, stats row (today's posts / week posts / yesterday's engagement), content gap warnings, top hashtags, numbered recommendations; "Regenerate" button; loading and empty states; integrated into dashboard home page
- [x] Unit tests for daily briefing API endpoints (GET: auth, rate limit, briefing present, null when none; POST: auth, rate limit, AI disabled, AI null, success shape, yesterdayStats, contentGaps, upsert key, DB error — 10 tests)

### Phase 238: Content Topic Clustering & Coverage Analysis
- [x] Content clustering utility (`src/lib/content-clustering.ts`) — `clusterPostsByTopic(posts, maxClusters, minClusterSize)` uses `computeWordFrequency` to find global top keywords; assigns each post to the cluster matching its first high-frequency token; computes per-cluster `coverage` (%), `avgEngagement`, `totalEngagement`, `relatedKeywords` (up to 3 co-occurring keywords); sorts clusters by postCount desc; exports `TopicCluster` and `ClusteringResult` interfaces
- [x] `GET /api/analytics/content-clusters` endpoint — auth + rate limit + `?period=30d|90d|all&maxClusters=1-20`; queries user's PUBLISHED posts; aggregates engagement per post from `publishResults.insights`; calls `clusterPostsByTopic`; exports `ContentClustersResponse` interface
- [x] `ContentClustersCard` component (`src/components/content-clusters-card.tsx`) — period selector (30d/90d/all); grid of cluster cards each showing colour dot, `#topic` name, post count badge, coverage progress bar, avg engagement, related keyword chips; loading spinner, error state, empty state
- [x] Add `"content_clusters"` widget key and label `"Content Topic Clusters"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route; integrate `ContentClustersCard` into analytics dashboard below `CompetitiveBenchmarkCard`
- [x] Unit tests for clustering utility (empty input, single post below minClusterSize, keyword grouping, coverage ≤100%, postIds populated, avgEngagement calculation, relatedKeywords ≤3, maxClusters limit, sorted by postCount desc, totalPosts count — 9 tests) and API endpoint (auth, rate limit, invalid period, empty state, period echoed, defaults to 30d, cluster shape, maxClusters param, consistent totalPosts, DB error — 10 tests)

### Phase 239: AI-Powered Content Hooks & Opening Lines Generator
- [x] Add `generateHooks(content, platforms, count)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to generate compelling opening hook/attention-grabber lines for a given post; returns `HookOption[]` where each item has `{hook, style: "question"|"statistic"|"story"|"controversy"|"curiosity"|"list", explanation}`; uses prompt caching on system block
- [x] `POST /api/ai/generate-hooks` endpoint — auth + rate limit + zod validation (`content: string min 10 max 10000`, `platforms: string[] min 1`, `count?: 1-10 default 5`); calls `generateHooks`; returns `{hooks: HookOption[]}`; 503 when AI not configured
- [x] `HookGeneratorDialog` component (`src/components/hook-generator-dialog.tsx`) — modal showing hook options with colour-coded style badges (question/statistic/story/controversy/curiosity/list), copy-to-clipboard per hook, explanation text, "Prepend to Post" chevron button; regenerate button; loading state
- [x] "Hooks" button (Zap icon) in post composer toolbar — opens `HookGeneratorDialog`; disabled when content is empty; `onPrependHook` prepends selected hook as opening line
- [x] Unit tests for `POST /api/ai/generate-hooks` (auth 401, rate limit 429, AI disabled 503, content missing 400, content too short 400, empty platforms 400, invalid JSON 400, success shape, count parameter respected, hook shape with style/explanation, valid style values, AI error 500 — 10 tests)

### Phase 240: Seasonal Content Performance Patterns & Recycling Calendar
- [x] Seasonal patterns utility (`src/lib/seasonal-patterns.ts`) — `computeSeasonalPatterns(posts)` groups PUBLISHED posts with PostInsights by month-of-year (1–12); computes per-month avgEngagement (likes+comments+shares), postCount, and topPosts (up to 5 by aggregate engagement); also returns bestMonth and worstMonth (by avgEngagement, requiring ≥1 post); exports `SeasonalPattern` and `SeasonalPatternsResult` interfaces
- [x] `GET /api/analytics/seasonal-patterns` endpoint — auth + rate limit + optional `?lookbackYears=1|2|3` param (default 2); queries user's PUBLISHED posts with publishResults and PostInsights from last N years; calls `computeSeasonalPatterns`; returns `{lookbackYears, patterns, bestMonth, worstMonth, totalPosts}`
- [x] `SeasonalPatternsCard` component (`src/components/seasonal-patterns-card.tsx`) — Recharts BarChart showing avg engagement per month (Jan–Dec); selected-month panel below chart listing top 3 posts with content preview (60 chars), engagement score, and "Recycle" button calling `POST /api/posts/[id]/recycle`; lookback period selector (1yr/2yr/3yr); bestMonth/worstMonth summary chips; loading skeleton; "No data yet" empty state
- [x] Integrate `SeasonalPatternsCard` into analytics dashboard below `ContentClustersCard`; add `"seasonal_patterns"` widget key and label `"Seasonal Content Patterns"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route; add to `DashboardCustomizeDialog`
- [x] Unit tests for seasonal patterns utility (empty input, single month, avgEngagement calculation, bestMonth/worstMonth selection, topPosts capped at 5, month range 1–12 — 8 tests) and API endpoint (auth, rate limit, invalid lookbackYears, default lookback, patterns shape, bestMonth/worstMonth null on empty, totalPosts count, DB error — 10 tests)

### Phase 241: Smart Hashtag Rotation & Cycling System
- [x] `HashtagRotation` model in Prisma (id, userId, name, description?, groupIds String[], currentIndex Int default 0, isActive Boolean default true, createdAt, updatedAt) + migration (`20260910000000_add_hashtag_rotations`) — stores ordered references to existing HashtagGroup records for cycling
- [x] CRUD API for hashtag rotations (`GET /api/hashtag-rotations`, `POST /api/hashtag-rotations`, `PATCH /api/hashtag-rotations/[id]`, `DELETE /api/hashtag-rotations/[id]`) — auth + rate limit + zod validation; max 20 rotations per user; `groupIds` validated as non-empty array of user-owned HashtagGroup ids; resolves group names in GET responses
- [x] `GET /api/hashtag-rotations/[id]/current` endpoint — auth + rate limit + ownership; returns current slot hashtags + group name + index without advancing the rotation; 404 when rotation has no groups
- [x] `POST /api/hashtag-rotations/[id]/next` endpoint — auth + rate limit + ownership; atomically advances `currentIndex` (wraps around to 0); returns new index, group name, and hashtags
- [x] "Use Rotation" dropdown in post composer hashtag section — lists the user's active rotations; selecting a rotation calls `GET /api/hashtag-rotations/[id]/current` and previews the current group's hashtags; "Insert & Advance" button appends hashtags to the content field and calls `POST /api/hashtag-rotations/[id]/next` to advance the rotation for next use
- [x] Hashtag rotations management page in dashboard (`/hashtag-rotations`) — list rotations with name, active toggle, current-slot indicator (which group is up next), ordered group list with move-up/move-down controls; inline create form (name, optional description, multi-select of user's hashtag groups in desired order); delete with confirmation toast
- [x] Add "Hashtag Rotations" to sidebar navigation (icon: `RefreshCw`) after Hashtags entry
- [x] Unit tests for hashtag rotations API (GET list auth/rate-limit/empty/shape, POST create/max-limit/invalid-body/nonexistent-group, PATCH update/ownership, DELETE success/ownership, GET current: auth/not-found/ownership/returns-hashtags/no-groups-404, POST next: auth/not-found/ownership/advances-index/wraps-around/returns-hashtags — 20 tests)

### Phase 242: Social Media Contest & Giveaway Manager
- [x] `ContestStatus` enum (DRAFT/ACTIVE/ENDED/CANCELLED) + `Contest` model (id, userId, name, description?, platform?, postId? FK to Post nullable, startDate?, endDate?, prizeDescription?, requiredAction String default "comment", winnersCount Int default 1, status ContestStatus default DRAFT, createdAt, updatedAt) + `ContestEntry` model (id, contestId, participantName, participantHandle, platform?, entryType String default "manual", metadata Json?, isWinner Boolean default false, pickedAt?, createdAt) + migration (`20260911000000_add_contests`)
- [x] CRUD API for contests (`GET /api/contests`, `POST /api/contests`, `GET /api/contests/[id]`, `PATCH /api/contests/[id]`, `DELETE /api/contests/[id]`) — auth + rate limit + zod validation; max 50 contests per user; include entry count in list; include entries in detail view
- [x] Entry management API (`GET /api/contests/[id]/entries`, `POST /api/contests/[id]/entries`, `DELETE /api/contests/[id]/entries/[entryId]`) — auth + rate limit + ownership check; max 10,000 entries per contest
- [x] Winner draw endpoint (`POST /api/contests/[id]/draw`) — auth + rate limit + ownership; randomly selects `winnersCount` entries from non-winner entries; marks selected entries as `isWinner=true` and sets `pickedAt`; sets contest status to ENDED; returns `{winners: ContestEntry[]}`
- [x] Contest management page in dashboard (`/contests`) — list contests with status badge, entry count, prize description, date range, "View" and "Delete" actions; create contest form (name, description, platform, prize, requiredAction, winnersCount, dates); contest detail view with entry list, "Add Entry" inline form, "Draw Winners" button; winner display section
- [x] Add "Contests" to sidebar navigation (icon: `Trophy`)
- [x] Unit tests for contests API (GET list, POST create, POST max-limit, POST invalid body, GET detail, PATCH update, DELETE, GET entries, POST entry, DELETE entry, POST draw — auth, rate limit, ownership, winner selection — 20 tests)

### Phase 243: Content Autopilot & Smart Publishing Automation Rules
- [x] `TriggerType` enum (QUEUE_EMPTY/LOW_ENGAGEMENT/EVERGREEN_DUE/POSTING_GAP/DAILY_SCHEDULE) + `ActionType` enum (PUBLISH_EVERGREEN/RESCHEDULE_POST/SEND_NOTIFICATION/PAUSE_PUBLISHING/CREATE_FROM_TEMPLATE) + `AutopilotRule` model (id, userId, name, description?, trigger TriggerType, conditionJson Json, action ActionType, actionDataJson Json, isActive Boolean default true, lastTriggeredAt?, triggerCount Int default 0, createdAt, updatedAt) + migration (`20260912000000_add_autopilot_rules`)
- [x] Autopilot evaluation utility (`src/lib/autopilot.ts`) — `evaluateRule(rule, userId, db)` checks trigger condition and executes action; trigger checkers: `checkQueueEmpty` (SCHEDULED posts < threshold), `checkLowEngagement` (7-day avg engagement < threshold), `checkPostingGap` (hours since last publish > threshold), `checkEvergreenDue` (evergreen posts due for recycle), `checkDailySchedule` (hour-of-day UTC match); action executors: `executePublishEvergreen`, `executeSendNotification`, `executeCreateFromTemplate`; updates `lastTriggeredAt` and increments `triggerCount` on trigger
- [x] Add `AUTOPILOT_SCAN: "postflow:autopilot-scan"` to `QUEUE_NAMES` in `connection.ts`
- [x] BullMQ autopilot worker (`src/lib/queue/workers/autopilot.ts`) — `createAutopilotWorker()` processes `AUTOPILOT_SCAN` queue; iterates all active rules across all users; calls `evaluateRule` per rule; logs triggered/errors; export `AutopilotScanJobData` interface
- [x] Add `getAutopilotScanQueue()` singleton + `scheduleAutopilotScan()` (hourly cron `"0 * * * *"`) to `scheduler.ts`; register `createAutopilotWorker` + cron in `workers/queue-worker.ts`
- [x] CRUD API for autopilot rules (`GET /api/autopilot-rules`, `POST /api/autopilot-rules`) — auth + rate limit + zod validation; max 20 rules per user; POST returns 201
- [x] `PATCH /api/autopilot-rules/[id]` + `DELETE /api/autopilot-rules/[id]` endpoints — auth + rate limit + ownership check; DELETE returns 204
- [x] `PATCH /api/autopilot-rules/[id]/toggle` endpoint — auth + rate limit + ownership check; toggles `isActive`; returns `{rule: {id, isActive}}`
- [x] Autopilot page in dashboard (`/autopilot`) — `AutopilotClient` component with `CreateRuleForm` (trigger/action selectors, condition-specific inputs) and `RuleCard` per rule (trigger/action colour badges, trigger count, last triggered time, toggle/delete buttons); empty state with description
- [x] Add "Autopilot" to sidebar navigation (icon: `Bot`) before Settings entry
- [x] Unit tests for autopilot rules API (GET 401/429/empty/shape, POST 401/429/max-limit/missing-name/201, PATCH 401/403/success, DELETE 401/404/204, toggle 401/true→false/false→true — 14 tests)

### Phase 244: AI Competitor Content Intelligence
- [x] `CompetitorContentAnalysis` model in Prisma (id, userId, competitorName, platform?, content, analysis Json, createdAt) + migration (`20260913000000_add_competitor_content_analysis`) — stores AI analysis results for competitor posts
- [x] Add `analyzeCompetitorContent(content, platform?, brandKitContext?)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to analyze competitor post content; returns `CompetitorAnalysisResult` with contentStrategy, strengths, weaknesses, keyTechniques, toneStyle, targetAudience, estimatedEngagementScore (0–100), actionableInsights; uses prompt caching on system block; returns null when AI not configured
- [x] `GET /api/competitor-intelligence` endpoint — auth + rate limit; returns last 50 analyses with content truncated to 200 chars; returns `{analyses}`
- [x] `POST /api/competitor-intelligence` endpoint — auth + rate limit + zod validation (`competitorName: string min 1 max 100`, `content: string min 10 max 10000`, `platform?: Platform`); optionally includes brand kit context; calls `analyzeCompetitorContent`; max 200 analyses per user; returns 503 when AI not configured; returns created analysis with status 201
- [x] `DELETE /api/competitor-intelligence/[id]` endpoint — auth + rate limit + ownership check; returns 204
- [x] Competitor intelligence page in dashboard (`/competitor-intelligence`) — split layout with analysis form (competitor name, platform selector, content textarea) on left and analysis result display on right (engagement score bar, content strategy, strengths/weaknesses grid, key techniques chips, tone/audience, actionable insights); history list below with click-to-view, delete, score badge
- [x] Add "Competitor Intel" to sidebar navigation (icon: `Brain`)
- [x] Unit tests for competitor intelligence API (GET: auth, rate limit, empty, content truncated; POST: auth, rate limit, AI disabled, invalid body, content too short, success shape, AI returns null; DELETE: auth, not-found, ownership, 204 — 12 tests)

### Phase 245: Affiliate Link & Referral Code Manager
- [x] `AffiliateLink` model in Prisma (id, userId, name, originalUrl, affiliateCode?, platform?, category?, clicks Int default 0, conversions Int default 0, revenue Float default 0, currency String default "USD", isActive Boolean default true, createdAt, updatedAt) + migration (`20260914000000_add_affiliate_links`)
- [x] CRUD API for affiliate links (`GET /api/affiliate-links`, `POST /api/affiliate-links`, `PATCH /api/affiliate-links/[id]`, `DELETE /api/affiliate-links/[id]`) — auth + rate limit + zod validation; max 200 links per user
- [x] `POST /api/affiliate-links/[id]/track-click` public endpoint — no auth; increments clicks counter; returns `{clicks}`
- [x] `PATCH /api/affiliate-links/[id]/record-conversion` endpoint — auth + rate limit + ownership; accepts `{revenue?: number}`; increments conversions + adds to revenue; returns `{conversions, revenue}`
- [x] `GET /api/analytics/affiliate-revenue` endpoint — auth + rate limit + `?period=7d|30d|90d|all`; returns `{totalClicks, totalConversions, totalRevenue, conversionRate, links: [{id, name, clicks, conversions, revenue, conversionRate}]}` sorted by revenue desc
- [x] `AffiliateLinkPicker` component (`src/components/affiliate-link-picker.tsx`) — dropdown button in post composer that lists user's active affiliate links; selecting one inserts the tracking URL (`originalUrl` with affiliateCode appended as query param) into post content at cursor; shows link name + category
- [x] Affiliate links management page in dashboard (`/affiliate-links`) — table of links with click count, conversion count, revenue, category badge, active toggle; summary stats row (total clicks/conversions/revenue/avg CVR); inline create form (name, original URL, affiliate code, category, currency); edit-in-place; delete with confirmation toast
- [x] Add "Affiliates" to sidebar navigation (icon: `Link2`)
- [x] Unit tests for affiliate links API (GET list, POST create, POST max-limit, POST invalid URL, PATCH update, PATCH ownership, DELETE success, track-click public, record-conversion auth/rate-limit/revenue, GET revenue auth/rate-limit/period-filter/response-shape — 18 tests)

### Phase 246: Comment Sentiment Analysis & Brand Reputation Score
- [x] Add `sentiment` (nullable String: "POSITIVE"|"NEUTRAL"|"NEGATIVE") + `sentimentScore` (nullable Float) to `SocialComment` model + Prisma migration (`20260915000000_add_comment_sentiment`)
- [x] Add `analyzeCommentSentiment(content)` to `src/lib/ai.ts` — calls `claude-haiku-4-5` to classify comment as POSITIVE/NEUTRAL/NEGATIVE with confidence score (0–1); uses prompt caching on system block; returns `{sentiment: string, score: number}` or null when AI not configured
- [x] `POST /api/inbox/comments/analyze` endpoint — auth + rate limit + AI check; analyzes up to 50 unanalyzed (null sentiment) comments for the current user; calls `analyzeCommentSentiment` per comment; updates `sentiment` + `sentimentScore` in DB; returns `{analyzed, positive, neutral, negative}`; returns 503 when AI not configured
- [x] `PATCH /api/inbox/comments/[id]/sentiment` endpoint — auth + rate limit + ownership check; accepts `{sentiment: "POSITIVE"|"NEUTRAL"|"NEGATIVE"}` body; manually overrides comment sentiment; sets `sentimentScore` to 1.0 for manual overrides; returns `{sentiment, sentimentScore}`
- [x] `GET /api/analytics/reputation` endpoint — auth + rate limit + `?period=7d|30d|90d` (default 30d); queries user's `SocialComment` records with non-null sentiment in the period (by `postedAt`); computes `reputationScore` (0–100: positive%×100 − negative%×50, clamped); `trend` ("improving"|"stable"|"declining" based on comparing first-half vs second-half of period); `distribution: {positive, neutral, negative, total}`; `dailyBreakdown: [{date, positive, neutral, negative}][]` for last 30 days with zero-fill; returns `{period, reputationScore, trend, distribution, dailyBreakdown, analyzedCount, totalCount}`
- [x] `ReputationScoreCard` component (`src/components/reputation-score-card.tsx`) — score gauge (large coloured number: green ≥70 / yellow ≥40 / red <40), sentiment distribution donut chart (Recharts PieChart with green/grey/red), trend badge (↑ improving / → stable / ↓ declining), daily timeline sparkline (Recharts AreaChart stacked), period selector (7d/30d/90d), "Analyze Comments" button (calls analyze endpoint), analyzed/total count, "No data" empty state with hint to sync comments then run analysis
- [x] Integrate `ReputationScoreCard` into analytics dashboard below `ContentClustersCard`; add `"reputation_score"` widget key and label `"Brand Reputation Score"` to `WIDGET_KEYS` and `WIDGET_LABELS` in dashboard-widgets route; add to `DashboardCustomizeDialog`
- [x] Sentiment badge on comment cards in inbox page — show coloured chip (green/grey/red) when `comment.sentiment` is set; "Analyze" button per comment calls analyze endpoint for that single comment (extend analyze endpoint to accept optional `commentId` to analyze just one)
- [x] Unit tests for reputation endpoint (auth 401, rate limit 429, invalid period 400, empty state, reputationScore 0–100 bounds, distribution shape, trend improving/stable/declining, dailyBreakdown 30 entries, analyzedCount vs totalCount, DB error — 10 tests) and analyze endpoint (auth, rate limit, AI disabled 503, success shape, analyzed count, skips already-analyzed — 8 tests)

### Phase 247: PDF Analytics Report Export
- [x] Install `pdfkit` package + `@types/pdfkit` devDependency for server-side PDF generation
- [x] PDF report generation utility (`src/lib/pdf-report.ts`) — `generateAnalyticsPdf(data, options)` builds a multi-section PDF using PDFKit: branded header (PostFlow title, user email, generated date, period label), KPI summary row (total posts, published, scheduled, failed, connected accounts), platform breakdown table (platform, published count, success rate), top 5 performing posts table (truncated content, platform, engagement score), posting frequency section (posts per week per platform vs recommended), footer with page numbers; returns `Buffer`
- [x] `GET /api/analytics/export-pdf` endpoint — auth + rate limit (10/hr per user); accepts `?period=7d|30d|90d` (default 30d); compiles data from DB (post counts by status, PublishResult platform breakdown, PostInsights engagement, top posts by score); calls `generateAnalyticsPdf`; streams response with `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="postflow-report-{date}-{period}.pdf"`; logs activity `analytics.exported`
- [x] "Export PDF" button (`FileDown` icon) in analytics dashboard header — calls `/api/analytics/export-pdf` with current period param via anchor tag download; shows loading spinner while fetching; toast on error
- [x] Unit tests for PDF export endpoint (auth 401, rate limit 429, invalid period fallback to 30d, returns PDF content-type, content-disposition header, response body starts with `%PDF`, activity logged — 8 tests)

### Phase 248: Comprehensive Analytics Data Table & Performance Review
- [x] `GET /api/analytics/posts-table` endpoint — auth + rate limit + pagination; accepts `?period=7d|30d|90d|all&sort=date|engagement|reach|likes|comments|shares&dir=asc|desc&platform=&page=&limit=50`; returns published posts with their PostInsights joined, sorted and paginated; includes `{publishResultId, postId, content (truncated 80 chars), publishedAt, platform, impressions, reach, likes, comments, shares, engagementScore, publishedUrl}` with `{total, page, limit, totalPages}`
- [x] `GET /api/analytics/posts-table/export` endpoint — auth + rate limit; same query but exports as CSV with no pagination; returns `text/csv` with `Content-Disposition: attachment; filename="postflow-posts-{date}-{period}.csv"`; all columns; properly escapes commas/quotes in content
- [x] `PostsDataTable` component (`src/components/posts-data-table.tsx`) — client component with sortable column headers, platform badge chip, period filter pills, platform dropdown filter, Refresh button, paginated rows, Export CSV button; loading/empty states
- [x] Analytics data table page in dashboard (`/analytics/data-table`) — renders `PostsDataTable` with page header and description
- [x] Add "Data Table" to sidebar navigation (icon: `TableProperties`) after Snapshots entry
- [x] Unit tests for posts-table and export endpoints (auth, rate limit, invalid sort, empty state, row shape, content truncation, platform filter, period filter, all-period no date filter, pagination, DB error, CSV content-type, content-disposition, header row, data rows, CSV escaping — 18 tests)
