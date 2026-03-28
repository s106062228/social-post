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
- [ ] Analytics/insights page (basic)
- [x] Seed script for development data
- [ ] README with setup instructions
