# Dryrun

AI agents that test your product like real users.

Dryrun generates synthetic user personas, creates realistic usage plans, and runs AI-powered browser agents against your live product to find friction points before real users hit them.

## How It Works

1. **Add a product** — Paste your URL. Dryrun crawls it and analyzes the product with AI.
2. **Generate personas** — AI creates realistic user archetypes (skeptic, early adopter, overloaded teacher, etc.) with behavioral profiles.
3. **Create plans** — Each persona gets concrete missions with scenario dimensions (time pressure, entry point, prior experience).
4. **Run tests** — Browser agents navigate your product as each persona, making decisions based on their behavioral profile.
5. **Get friction reports** — Rule-based metrics + AI scoring identify dead ends, confusion points, and abandonment triggers.

## Architecture

The platform runs entirely on Cloudflare:

```
┌────────────────────────────────┐     ┌──────────────────────────────────┐
│  app (dryrun)                  │     │  executor (dryrun-executor)      │
│  Next.js on Cloudflare Workers │────▶│  Cloudflare Worker + Workflows   │
│  Dashboard, API routes         │     │  Browser agent orchestration     │
│                                │     │                                  │
│  Bindings:                     │     │  Bindings:                       │
│  - D1 (dryrun-db)              │     │  - D1 (dryrun-db)                │
│  - R2 (dryrun-screenshots)     │     │  - R2 (dryrun-screenshots)       │
│  - Service (dryrun-executor)   │     │  - Workflow (BrowserSessionWF)   │
└────────────────────────────────┘     └──────────────────────────────────┘
         │                                        │
         ▼                                        ▼
   ┌───────────┐                        ┌───────────────────┐
   │ D1 SQLite │                        │ Browserbase       │
   │ (shared)  │                        │ + Stagehand V3    │
   └───────────┘                        │ (browser sessions)│
                                        └───────────────────┘
```

- **app/** — Next.js 16 frontend + API, deployed via OpenNext to Cloudflare Workers. Handles product management, persona/plan generation, and results display.
- **executor/** — Standalone Cloudflare Worker with Workflows. Receives session requests via Service Binding, runs durable multi-step browser sessions (start → navigate → agent execute → screenshot → score → report). Steps are independently retryable; I/O wait time is free.

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, shadcn/ui
- **Database**: Cloudflare D1 (SQLite) with Drizzle ORM
- **AI**: Google Gemini (`gemini-3-flash-preview`) for persona/plan generation, scoring, and reports
- **Browser Automation**: Browserbase + Stagehand V3 HTTP API
- **Deployment**: Cloudflare Workers, Workflows, R2, D1
- **Build**: OpenNext (Next.js → Cloudflare Workers adapter)

## Prerequisites

- Node.js 18+
- A [Cloudflare](https://cloudflare.com) account (paid plan for Workflows)
- A [Gemini API key](https://aistudio.google.com/apikey)
- A [Browserbase](https://browserbase.com) account (API key + project ID)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed globally or via npx

## Setup

### 1. Install dependencies

```bash
cd app && npm install
cd ../executor && npm install
```

### 2. Configure secrets

The executor worker needs these secrets set via Wrangler:

```bash
cd executor
npx wrangler secret put BROWSERBASE_API_KEY
npx wrangler secret put BROWSERBASE_PROJECT_ID
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put EXECUTOR_SECRET
```

The main app reads secrets from the executor via Service Binding — no `.env` file needed for production.

For local development, create `app/.dev.vars`:

```
GEMINI_API_KEY=your_gemini_key
BROWSERBASE_API_KEY=your_browserbase_key
BROWSERBASE_PROJECT_ID=your_browserbase_project_id
```

### 3. Database setup

```bash
# Create the D1 database (already exists if you've deployed before)
npx wrangler d1 create dryrun-db

# Run migrations locally
cd app
npm run db:migrate

# Run migrations on remote (production)
npm run db:migrate:remote
```

## Development

### Local development

```bash
# Terminal 1: Run the executor worker
cd executor
npx wrangler dev

# Terminal 2: Run the Next.js app
cd app
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000). Note that Service Bindings between workers only work in deployed mode — local dev uses direct fetch calls.

### Preview (Cloudflare local emulation)

```bash
cd app
npm run preview
```

## Deployment

### Deploy both workers

```bash
# Deploy executor first (app depends on it via Service Binding)
cd executor
npx wrangler deploy

# Build and deploy the main app
cd app
npx @opennextjs/cloudflare build
npx wrangler deploy
```

Or use the shortcut:

```bash
cd app
npm run deploy   # runs build:worker + wrangler deploy
```

### Verify deployment

```bash
# Check executor health
curl https://dryrun-executor.<your-subdomain>.workers.dev/health

# Check app
curl https://dryrun.<your-subdomain>.workers.dev
```

## Debugging

### Workflow monitoring

```bash
# List recent workflow instances
cd executor
npx wrangler workflows instances list browser-session-workflow

# Describe a specific workflow instance (see step-by-step progress)
npx wrangler workflows instances describe browser-session-workflow <instance-id>

# Terminate a stuck workflow
npx wrangler workflows instances terminate browser-session-workflow <instance-id>
```

### Real-time logs

```bash
# Tail executor logs (shows workflow console.log output)
npx wrangler tail dryrun-executor --format pretty

# Tail main app logs
npx wrangler tail dryrun --format pretty
```

### Database queries

```bash
# Query D1 directly
npx wrangler d1 execute dryrun-db --remote --command "SELECT id, status FROM runs ORDER BY created_at DESC LIMIT 5"

# Check session status
npx wrangler d1 execute dryrun-db --remote --command "SELECT id, status, duration_seconds FROM sessions WHERE run_id = '<run-id>'"
```

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Workflow stuck for >15 min | SSE stream hung without data | Redeploy executor (has per-read timeout). Terminate stuck instance. |
| `error 1042` on worker-to-worker calls | Workers can't fetch each other via URL | Use Service Binding (already configured in wrangler.toml) |
| Sessions fail with "Stream was cancelled" | Browserbase session timeout or network drop | Expected for long sessions. Agent captures partial results. |
| Screenshots empty `[]` | Stagehand screenshot API returned no data | Check executor logs. Screenshot capture is best-effort. |
| Gemini 429 errors | Rate limit exceeded | Workflow retries with exponential backoff (up to 10 retries). |

## Project Structure

```
├── app/                           # Next.js frontend + API
│   ├── src/
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── products/      # Product CRUD + crawling
│   │   │   │   ├── personas/      # Persona generation
│   │   │   │   ├── plans/         # Plan generation + approval
│   │   │   │   ├── runs/          # Test execution dispatch
│   │   │   │   ├── sessions/      # Session details
│   │   │   │   ├── reports/       # Report generation
│   │   │   │   └── screenshots/   # Serve screenshots from R2
│   │   │   └── products/          # Dashboard pages
│   │   ├── lib/
│   │   │   ├── ai/                # Gemini AI (personas, plans, reports)
│   │   │   ├── crawl/             # Product URL crawler
│   │   │   └── db/                # D1 + Drizzle schema
│   │   └── components/ui/         # shadcn/ui components
│   ├── wrangler.toml              # Cloudflare config (D1, R2, Service Binding)
│   └── package.json
├── executor/                      # Browser execution worker
│   ├── src/
│   │   └── index.ts               # Workflow + fetch handler (single file)
│   ├── wrangler.toml              # Cloudflare config (D1, R2, Workflow)
│   └── package.json
└── README.md
```

## Persona Archetypes

| Archetype | Behavior |
|-----------|----------|
| **New User** | Reads onboarding, follows instructions, asks for help after failures |
| **Skeptic** | Skips onboarding, goes straight to action, abandons quickly |
| **Early Adopter** | Explores non-obvious paths, clicks settings, tries adjacent features |
| **Overloaded** | Skips everything, accepts defaults, abandons if flow takes >5 clicks |
| **Reluctant** | Reads explanatory text carefully, refuses to proceed without rationale |
| **Evaluator** | Tests edge cases, checks admin features, explores export/reporting |

## License

MIT
