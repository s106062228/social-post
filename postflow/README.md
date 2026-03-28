# PostFlow

A social media scheduling and automation platform for Facebook, Instagram, and Threads. Connect your Meta accounts once and schedule, manage, and publish posts across all three platforms from a single dashboard.

## Features

- **Multi-platform posting** — Facebook Pages, Instagram Business/Creator, Threads
- **Scheduling** — Pick a date/time; PostFlow handles publishing automatically via BullMQ
- **OAuth 2.0 integration** — Secure Meta OAuth flow; tokens stored AES-256-GCM encrypted
- **Media support** — Text, image, video, and carousel posts via Cloudflare R2
- **Calendar view** — Visualize scheduled posts across platforms
- **Analytics** — Publishing success rates, platform performance, content-type breakdown
- **Background workers** — Independent BullMQ worker process with exponential-backoff retry

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Job Queue | BullMQ + Redis |
| Media Storage | Cloudflare R2 (S3-compatible) |
| Auth | NextAuth.js v5 |
| Styling | Tailwind CSS + shadcn/ui |
| Deployment | Docker + Docker Compose |

## Prerequisites

- Node.js 20+
- Docker + Docker Compose
- A [Meta Developer App](https://developers.facebook.com/) with the following permissions:
  - `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`
  - `instagram_basic`, `instagram_content_publish`
  - `threads_basic`, `threads_content_publish`, `threads_manage_insights`
- A Cloudflare R2 bucket with public access enabled

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd postflow
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values:

```env
# Database (auto-configured if using Docker Compose)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postflow

# Redis (auto-configured if using Docker Compose)
REDIS_URL=redis://localhost:6379

# NextAuth
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000

# Meta Developer App
META_APP_ID=<your Meta App ID>
META_APP_SECRET=<your Meta App Secret>
META_OAUTH_CALLBACK_URL=http://localhost:3000/api/oauth/meta/callback

# Token encryption (32-byte hex key)
TOKEN_ENCRYPTION_KEY=<generate with: openssl rand -hex 32>

# Cloudflare R2
R2_ACCOUNT_ID=<your Cloudflare account ID>
R2_ACCESS_KEY_ID=<R2 access key>
R2_SECRET_ACCESS_KEY=<R2 secret key>
R2_BUCKET_NAME=postflow-media
R2_PUBLIC_URL=https://pub-<hash>.r2.dev
```

### 3. Start infrastructure with Docker Compose

```bash
# Start PostgreSQL and Redis only (run Next.js locally)
docker compose up postgres redis -d

# Or start everything including the app container
docker compose up -d
```

### 4. Run database migrations

```bash
npx prisma migrate deploy
# or for development (creates migration files)
npx prisma migrate dev
```

### 5. (Optional) Seed development data

```bash
npm run seed
```

### 6. Start the development server

```bash
# Terminal 1 — Next.js app
npm run dev

# Terminal 2 — BullMQ worker process
npx tsx workers/queue-worker.ts
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
postflow/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login / register pages
│   │   ├── (dashboard)/       # Dashboard, posts, calendar, accounts, analytics
│   │   └── api/               # API routes (auth, oauth, posts, publish, webhooks)
│   ├── lib/
│   │   ├── platforms/         # Facebook / Instagram / Threads adapters
│   │   ├── auth/              # Meta OAuth + token manager
│   │   ├── queue/             # BullMQ scheduler + workers
│   │   ├── db.ts              # Prisma client singleton
│   │   └── encryption.ts      # AES-256-GCM token encryption
│   └── components/            # Shared UI components
├── workers/
│   └── queue-worker.ts        # Standalone BullMQ worker process
├── scripts/
│   └── seed.ts                # Development seed data
└── docker-compose.yml
```

## API Overview

| Method | Route | Description |
|---|---|---|
| GET | `/api/posts` | List posts (paginated, filterable by status) |
| POST | `/api/posts` | Create a new post |
| GET | `/api/posts/[id]` | Get single post with publish results |
| PATCH | `/api/posts/[id]` | Update a draft or scheduled post |
| DELETE | `/api/posts/[id]` | Delete a post |
| POST | `/api/publish` | Immediately publish or schedule a post |
| GET | `/api/oauth/meta/connect` | Start Meta OAuth flow |
| GET | `/api/oauth/meta/callback` | Meta OAuth callback handler |
| POST | `/api/webhooks/meta` | Meta Webhooks receiver |

## Meta App Configuration

In your Meta Developer dashboard:

1. Add **Facebook Login** and **Instagram** products to your app
2. Set the **Valid OAuth Redirect URI** to `<NEXTAUTH_URL>/api/oauth/meta/callback`
3. Add the **Webhook** URL: `<NEXTAUTH_URL>/api/webhooks/meta`
4. While in Development Mode, add test users via **Roles → Test Users**

## Security Notes

- All access tokens are encrypted with AES-256-GCM before database storage
- Tokens are never exposed to the client side
- OAuth state parameter uses `crypto.randomBytes` for CSRF protection
- All API routes validate input with Zod schemas

## Development

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Prisma Studio (database GUI)
npx prisma studio

# Generate Prisma client after schema changes
npx prisma generate
```

## Deployment

The included `docker-compose.yml` contains a production-ready setup. Build the Docker image and deploy with:

```bash
docker compose up --build -d
```

Ensure all environment variables in `.env` are configured for production, and that `NEXTAUTH_URL` matches your public domain.
