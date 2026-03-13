# Dryrun Phase 1 — Design Spec

## Overview

Dryrun is a synthetic user testing platform. Users provide a product URL, the system generates realistic personas and usage plans, runs AI browser agents against the live product, and produces friction reports.

Phase 1: single-agent Quick Mode, full web dashboard, product-agnostic.

## Architecture

Monolithic Next.js 15 app with App Router. All in one codebase.

```
dryrun/
├── src/
│   ├── app/                    # Next.js App Router pages + API routes
│   │   ├── page.tsx            # Dashboard home — list products
│   │   ├── products/
│   │   │   ├── new/            # Product setup wizard
│   │   │   └── [id]/
│   │   │       ├── page.tsx    # Product detail — personas, plans, runs
│   │   │       ├── personas/   # Persona review/edit
│   │   │       ├── plans/      # Plan review/confirm
│   │   │       ├── runs/       # Run history + reports
│   │   │       └── sessions/   # Session detail + trace viewer
│   │   └── api/
│   │       ├── products/       # CRUD
│   │       ├── personas/       # Generate, CRUD
│   │       ├── plans/          # Generate, CRUD
│   │       ├── runs/           # Create, status
│   │       ├── sessions/       # Status, trace, screenshots
│   │       └── reports/        # Generate, fetch
│   ├── lib/
│   │   ├── db/
│   │   │   ├── schema.ts       # Drizzle schema — all entities
│   │   │   ├── index.ts        # DB connection
│   │   │   └── migrations/     # SQL migrations
│   │   ├── ai/
│   │   │   ├── client.ts       # Anthropic SDK client
│   │   │   ├── personas.ts     # Persona generation prompts + logic
│   │   │   ├── plans.ts        # Plan generation prompts + logic
│   │   │   ├── scoring.ts      # AI-based session scoring
│   │   │   └── reports.ts      # Friction report generation
│   │   ├── browser/
│   │   │   ├── agent.ts        # Browser agent orchestrator
│   │   │   ├── stagehand.ts    # Stagehand + Browserbase integration
│   │   │   └── trace.ts        # Action trace logger
│   │   ├── crawl/
│   │   │   └── index.ts        # Product URL crawler (single page + sitemap)
│   │   └── scoring/
│   │       └── rules.ts        # Rule-based metrics computation
│   └── components/             # React components for dashboard
│       ├── ui/                 # Base UI components (shadcn/ui)
│       ├── products/           # Product-related components
│       ├── personas/           # Persona cards, editor
│       ├── plans/              # Plan review components
│       ├── runs/               # Run status, monitoring
│       ├── sessions/           # Trace viewer, screenshot gallery
│       └── reports/            # Report display
├── public/
│   └── screenshots/            # Session screenshots stored here
├── drizzle.config.ts
├── package.json
└── .env.local                  # API keys
```

## Tech Stack

- **Framework:** Next.js 15 (App Router, Server Components, Server Actions)
- **Language:** TypeScript
- **Database:** SQLite via better-sqlite3 + Drizzle ORM
- **AI:** Anthropic Claude API (@anthropic-ai/sdk)
- **Browser:** Browserbase + Stagehand (@browserbasehq/stagehand)
- **UI:** shadcn/ui + Tailwind CSS
- **State polling:** SWR with interval refresh

## Database Schema

### products
- id (text, PK, uuid)
- name (text)
- url (text)
- crawl_summary (text, JSON)
- goals (text, nullable)
- created_at (integer, unix timestamp)
- updated_at (integer, unix timestamp)

### personas
- id (text, PK, uuid)
- product_id (text, FK)
- name (text)
- role (text)
- behavioral_fields (text, JSON) — all structured fields from Master Plan
- evidence_sources (text, JSON, nullable)
- validated (integer, boolean)
- created_at (integer)

### missions
- id (text, PK, uuid)
- product_id (text, FK)
- description (text)
- entry_point (text)
- created_at (integer)

### plans
- id (text, PK, uuid)
- persona_id (text, FK)
- mission_id (text, FK)
- scenario_dimensions (text, JSON)
- teacher_state (text)
- steps (text, JSON)
- approved (integer, boolean)
- created_at (integer)

### runs
- id (text, PK, uuid)
- product_id (text, FK)
- product_version (text, nullable)
- mode (text) — 'quick'
- auth_mode (text) — 'session_injection' or 'fresh_signup'
- status (text) — pending/running/complete/failed
- created_at (integer)
- completed_at (integer, nullable)

### sessions
- id (text, PK, uuid)
- run_id (text, FK)
- persona_id (text, FK)
- plan_id (text, FK)
- status (text) — pending/running/complete/abandoned/failed
- goal_achieved (text) — yes/partial/no
- abandonment_point (text, nullable)
- duration_seconds (integer, nullable)
- trace (text, JSON) — action trace
- screenshots (text, JSON) — array of paths
- agent_notes (text, JSON)
- max_steps (integer, default 50)
- hard_timeout_seconds (integer, default 900)
- created_at (integer)
- completed_at (integer, nullable)

### scores
- id (text, PK, uuid)
- session_id (text, FK, unique)
- task_completion (text) — yes/partial/no
- time_to_first_action_seconds (integer, nullable)
- dead_end_count (integer)
- recovery_count (integer)
- help_seeking_events (integer)
- confidence_drops (integer)
- friction_events (text, JSON)
- ai_review (text) — qualitative AI analysis
- created_at (integer)

### reports
- id (text, PK, uuid)
- session_id (text, FK, nullable)
- run_id (text, FK, nullable)
- type (text) — 'session' or 'cohort'
- content (text) — markdown report
- created_at (integer)

## User Flow

1. **Add product** — enter URL, optional docs/goals. System crawls and generates summary.
2. **Review personas** — system generates 4-6 personas as cards. User can edit/delete/add.
3. **Review plans** — for each persona, 2-3 plans generated. User approves.
4. **Configure run** — select personas, plans, auth mode. Start run.
5. **Monitor** — dashboard shows session status, screenshots update via polling.
6. **View results** — session trace viewer, scores, friction report.

## Browser Agent Design

The agent receives a system prompt with:
- Persona behavioral fields
- Teacher state (situational context)
- Mission description
- Behavioral noise rules (from Master Plan)
- Persona-specific overrides

Uses Stagehand's `act()`, `extract()`, `observe()` to navigate.

Produces:
- Timestamped action trace (every click, type, scroll, navigation, error)
- Screenshots at key moments
- Inline agent notes on intent/frustration
- Session outcome

## Scoring

**Rule-based metrics** (computed from trace data):
- Task completion (binary + partial)
- Time to first useful action
- Dead end count
- Recovery count
- Help-seeking events
- Confidence drops (from agent notes)
- Abandonment point

**AI review** (Claude analyzes the full trace):
- Qualitative friction analysis
- Mental model mismatches
- Missing/unfindable features
- Most likely churn reason
- Highest impact single change

## Friction Report

Generated by Claude from scores + trace data. Written for PMs/designers.

Includes:
- Scored metrics summary
- Critical friction points (severity 1-5)
- Mental model mismatches
- Missing/unfindable features
- Most likely churn reason
- Highest impact single change
