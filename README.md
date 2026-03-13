# Dryrun

AI agents that test your product like real users.

Dryrun generates synthetic user personas, creates realistic usage plans, and runs AI-powered browser agents against your live product to find friction points before real users hit them.

## How It Works

1. **Add a product** — Paste your URL. Dryrun crawls it and analyzes the product with AI.
2. **Generate personas** — AI creates realistic user archetypes (skeptic, early adopter, overloaded teacher, etc.) with behavioral profiles.
3. **Create plans** — Each persona gets concrete missions with scenario dimensions (time pressure, entry point, prior experience).
4. **Run tests** — Browser agents navigate your product as each persona, making decisions based on their behavioral profile.
5. **Get friction reports** — Rule-based metrics + AI scoring identify dead ends, confusion points, and abandonment triggers.

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS, shadcn/ui
- **Database**: SQLite with Drizzle ORM
- **AI**: Google Gemini (persona generation, plan generation, scoring, reports)
- **Browser Automation**: Browserbase + Stagehand V3
- **Orchestration**: OpenAI Symphony (optional, for parallel task execution via Linear)

## Getting Started

### Prerequisites

- Node.js 18+
- A [Gemini API key](https://aistudio.google.com/apikey)
- A [Browserbase](https://browserbase.com) account (API key + project ID)

### Setup

```bash
cd app
npm install
```

Create `app/.env.local`:

```
GEMINI_API_KEY=your_gemini_key
BROWSERBASE_API_KEY=your_browserbase_key
BROWSERBASE_PROJECT_ID=your_browserbase_project_id
```

### Run

```bash
cd app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
├── src/
│   ├── app/                    # Next.js pages and API routes
│   │   ├── api/
│   │   │   ├── products/       # Product CRUD + crawling
│   │   │   ├── personas/       # Persona generation + management
│   │   │   ├── plans/          # Plan generation + approval
│   │   │   ├── runs/           # Test execution + monitoring
│   │   │   ├── sessions/       # Session details + trace data
│   │   │   └── reports/        # Friction report generation
│   │   ├── products/           # Product dashboard pages
│   │   └── page.tsx            # Home page
│   ├── lib/
│   │   ├── ai/                 # Gemini AI integration
│   │   │   ├── client.ts       # Shared AI client
│   │   │   ├── personas.ts     # Persona generation
│   │   │   ├── plans.ts        # Plan generation
│   │   │   ├── scoring.ts      # AI session scoring
│   │   │   └── reports.ts      # Report generation
│   │   ├── browser/
│   │   │   ├── agent.ts        # Stagehand browser agent
│   │   │   └── trace.ts        # Trace logging
│   │   ├── crawl/              # Product URL crawler
│   │   ├── db/                 # SQLite + Drizzle schema
│   │   └── scoring/            # Rule-based metrics
│   └── components/ui/          # shadcn/ui components
└── package.json
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
