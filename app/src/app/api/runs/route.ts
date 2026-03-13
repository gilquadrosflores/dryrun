import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  runs,
  sessions,
  plans,
  personas,
  missions,
  scores,
  reports,
  products,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { runBrowserAgent } from "@/lib/browser/agent";
import { computeRuleBasedMetrics } from "@/lib/scoring/rules";
import { scoreSessionWithAI } from "@/lib/ai/scoring";
import { generateSessionReport } from "@/lib/ai/reports";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");

  if (productId) {
    const result = db
      .select()
      .from(runs)
      .where(eq(runs.productId, productId))
      .all();
    return NextResponse.json(result);
  }

  const allRuns = db.select().from(runs).all();
  return NextResponse.json(allRuns);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { productId, planIds, authMode = "session_injection" } = body;

  if (!productId || !planIds || planIds.length === 0) {
    return NextResponse.json(
      { error: "productId and planIds are required" },
      { status: 400 }
    );
  }

  const runId = uuid();
  const now = Math.floor(Date.now() / 1000);

  // Create the run
  db.insert(runs)
    .values({
      id: runId,
      productId,
      mode: "quick",
      authMode,
      status: "pending",
      createdAt: now,
    })
    .run();

  // Create sessions for each plan
  const sessionIds: string[] = [];
  for (const planId of planIds) {
    const plan = db.select().from(plans).where(eq(plans.id, planId)).get();
    if (!plan) continue;

    const sessionId = uuid();
    db.insert(sessions)
      .values({
        id: sessionId,
        runId,
        personaId: plan.personaId,
        planId: plan.id,
        status: "pending",
        maxSteps: 50,
        hardTimeoutSeconds: 900,
        createdAt: now,
      })
      .run();
    sessionIds.push(sessionId);
  }

  // Update run to running
  db.update(runs)
    .set({ status: "running" })
    .where(eq(runs.id, runId))
    .run();

  // Execute sessions in background (non-blocking)
  executeRunInBackground(runId, sessionIds).catch(console.error);

  return NextResponse.json(
    { runId, sessionIds, status: "running" },
    { status: 201 }
  );
}

async function executeRunInBackground(
  runId: string,
  sessionIds: string[]
) {
  for (const sessionId of sessionIds) {
    try {
      await executeSession(sessionId);
    } catch (error) {
      console.error(`Session ${sessionId} failed:`, error);
      db.update(sessions)
        .set({
          status: "failed",
          completedAt: Math.floor(Date.now() / 1000),
        })
        .where(eq(sessions.id, sessionId))
        .run();
    }
  }

  // Check if all sessions completed
  const allSessions = db
    .select()
    .from(sessions)
    .where(eq(sessions.runId, runId))
    .all();

  const allDone = allSessions.every(
    (s) =>
      s.status === "complete" ||
      s.status === "abandoned" ||
      s.status === "failed"
  );

  if (allDone) {
    db.update(runs)
      .set({
        status: "complete",
        completedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(runs.id, runId))
      .run();
  }
}

async function executeSession(sessionId: string) {
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();

  if (!session) throw new Error("Session not found");

  // Update status to running
  db.update(sessions)
    .set({ status: "running" })
    .where(eq(sessions.id, sessionId))
    .run();

  // Load persona and plan
  const persona = db
    .select()
    .from(personas)
    .where(eq(personas.id, session.personaId))
    .get();
  const plan = db
    .select()
    .from(plans)
    .where(eq(plans.id, session.planId))
    .get();

  if (!persona || !plan) throw new Error("Persona or plan not found");

  const mission = db
    .select()
    .from(missions)
    .where(eq(missions.id, plan.missionId))
    .get();

  if (!mission) throw new Error("Mission not found");

  // Look up the product URL for fallback navigation
  const run = db.select().from(runs).where(eq(runs.id, session.runId)).get();
  const product = run
    ? db.select().from(products).where(eq(products.id, run.productId)).get()
    : null;
  const productUrl = product?.url || mission.entryPoint;

  const behavioralFields = JSON.parse(persona.behavioralFields);

  // Run the browser agent
  const result = await runBrowserAgent(
    {
      name: persona.name,
      role: persona.role,
      techComfort: behavioralFields.techComfort,
      timePressure: behavioralFields.timePressure,
      patienceBudget: behavioralFields.patienceBudget,
      abandonmentTriggers: behavioralFields.abandonmentTriggers || [],
      archetype: behavioralFields.archetype,
      aiAutonomyTolerance: behavioralFields.aiAutonomyTolerance,
      willingnessToEdit: behavioralFields.willingnessToEdit,
      retryWillingness: behavioralFields.retryWillingness,
    },
    {
      missionDescription: mission.description,
      entryPoint: mission.entryPoint,
      productUrl,
      teacherState: plan.teacherState,
      steps: JSON.parse(plan.steps),
    },
    sessionId,
    session.maxSteps,
    session.hardTimeoutSeconds
  );

  const now = Math.floor(Date.now() / 1000);

  // Update session with results
  db.update(sessions)
    .set({
      status: result.goalAchieved === "no" && result.abandonmentPoint
        ? "abandoned"
        : "complete",
      goalAchieved: result.goalAchieved,
      abandonmentPoint: result.abandonmentPoint,
      durationSeconds: result.durationSeconds,
      trace: JSON.stringify(result.trace),
      screenshots: JSON.stringify(result.screenshots),
      agentNotes: JSON.stringify(result.agentNotes),
      completedAt: now,
    })
    .where(eq(sessions.id, sessionId))
    .run();

  // Compute rule-based metrics
  const ruleMetrics = computeRuleBasedMetrics(result.trace);

  // AI scoring (if API key available)
  let aiScore = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      aiScore = await scoreSessionWithAI(
        persona.name,
        persona.role,
        mission.description,
        plan.teacherState,
        result.trace,
        result.goalAchieved
      );
    } catch (error) {
      console.error("AI scoring failed:", error);
    }
  }

  // Save score
  const scoreId = uuid();
  db.insert(scores)
    .values({
      id: scoreId,
      sessionId,
      taskCompletion: aiScore?.taskCompletion || result.goalAchieved,
      timeToFirstActionSeconds: ruleMetrics.timeToFirstActionSeconds,
      deadEndCount: ruleMetrics.deadEndCount,
      recoveryCount: ruleMetrics.recoveryCount,
      helpSeekingEvents: ruleMetrics.helpSeekingEvents,
      confidenceDrops: ruleMetrics.confidenceDrops,
      frictionEvents: aiScore
        ? JSON.stringify(aiScore.frictionEvents)
        : null,
      aiReview: aiScore?.qualitativeReview || null,
      createdAt: now,
    })
    .run();

  // Generate report (if API key available)
  if (process.env.GEMINI_API_KEY && aiScore) {
    try {
      const reportContent = await generateSessionReport(
        persona.name,
        persona.role,
        mission.description,
        plan.teacherState,
        ruleMetrics,
        aiScore
      );

      const reportId = uuid();
      db.insert(reports)
        .values({
          id: reportId,
          sessionId,
          type: "session",
          content: reportContent,
          createdAt: now,
        })
        .run();
    } catch (error) {
      console.error("Report generation failed:", error);
    }
  }
}
