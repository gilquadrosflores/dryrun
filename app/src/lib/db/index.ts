import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";

const dbPath = path.join(process.cwd(), "dryrun.db");
const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

// Initialize tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    crawl_summary TEXT,
    goals TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS personas (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    behavioral_fields TEXT NOT NULL,
    evidence_sources TEXT,
    validated INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    description TEXT NOT NULL,
    entry_point TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    persona_id TEXT NOT NULL REFERENCES personas(id),
    mission_id TEXT NOT NULL REFERENCES missions(id),
    scenario_dimensions TEXT NOT NULL,
    teacher_state TEXT NOT NULL,
    steps TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    product_version TEXT,
    mode TEXT NOT NULL DEFAULT 'quick',
    auth_mode TEXT NOT NULL DEFAULT 'session_injection',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id),
    persona_id TEXT NOT NULL REFERENCES personas(id),
    plan_id TEXT NOT NULL REFERENCES plans(id),
    status TEXT NOT NULL DEFAULT 'pending',
    goal_achieved TEXT,
    abandonment_point TEXT,
    duration_seconds INTEGER,
    trace TEXT,
    screenshots TEXT,
    agent_notes TEXT,
    max_steps INTEGER NOT NULL DEFAULT 50,
    hard_timeout_seconds INTEGER NOT NULL DEFAULT 900,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    task_completion TEXT,
    time_to_first_action_seconds INTEGER,
    dead_end_count INTEGER NOT NULL DEFAULT 0,
    recovery_count INTEGER NOT NULL DEFAULT 0,
    help_seeking_events INTEGER NOT NULL DEFAULT 0,
    confidence_drops INTEGER NOT NULL DEFAULT 0,
    friction_events TEXT,
    ai_review TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    run_id TEXT REFERENCES runs(id),
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);
