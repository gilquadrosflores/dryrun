import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  crawlSummary: text("crawl_summary"), // JSON
  goals: text("goals"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const personas = sqliteTable("personas", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  name: text("name").notNull(),
  role: text("role").notNull(),
  behavioralFields: text("behavioral_fields").notNull(), // JSON
  evidenceSources: text("evidence_sources"), // JSON
  validated: integer("validated").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const missions = sqliteTable("missions", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  description: text("description").notNull(),
  entryPoint: text("entry_point").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  personaId: text("persona_id")
    .notNull()
    .references(() => personas.id),
  missionId: text("mission_id")
    .notNull()
    .references(() => missions.id),
  scenarioDimensions: text("scenario_dimensions").notNull(), // JSON
  teacherState: text("teacher_state").notNull(),
  steps: text("steps").notNull(), // JSON
  approved: integer("approved").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  productVersion: text("product_version"),
  mode: text("mode").notNull().default("quick"),
  authMode: text("auth_mode").notNull().default("session_injection"),
  status: text("status").notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id),
  personaId: text("persona_id")
    .notNull()
    .references(() => personas.id),
  planId: text("plan_id")
    .notNull()
    .references(() => plans.id),
  status: text("status").notNull().default("pending"),
  goalAchieved: text("goal_achieved"), // yes/partial/no
  abandonmentPoint: text("abandonment_point"),
  durationSeconds: integer("duration_seconds"),
  trace: text("trace"), // JSON
  screenshots: text("screenshots"), // JSON array of paths
  agentNotes: text("agent_notes"), // JSON
  maxSteps: integer("max_steps").notNull().default(50),
  hardTimeoutSeconds: integer("hard_timeout_seconds").notNull().default(900),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});

export const scores = sqliteTable("scores", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  taskCompletion: text("task_completion"), // yes/partial/no
  timeToFirstActionSeconds: integer("time_to_first_action_seconds"),
  deadEndCount: integer("dead_end_count").notNull().default(0),
  recoveryCount: integer("recovery_count").notNull().default(0),
  helpSeekingEvents: integer("help_seeking_events").notNull().default(0),
  confidenceDrops: integer("confidence_drops").notNull().default(0),
  frictionEvents: text("friction_events"), // JSON
  aiReview: text("ai_review"),
  createdAt: integer("created_at").notNull(),
});

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").references(() => sessions.id),
  runId: text("run_id").references(() => runs.id),
  type: text("type").notNull(), // session or cohort
  content: text("content").notNull(),
  createdAt: integer("created_at").notNull(),
});
