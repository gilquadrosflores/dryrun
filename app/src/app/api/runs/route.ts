import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/lib/db";
import {
  runs,
  sessions,
  plans,
  personas,
  missions,
  products,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { v4 as uuid } from "uuid";

export async function GET(req: Request) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");

  if (productId) {
    const result = await db
      .select()
      .from(runs)
      .where(eq(runs.productId, productId))
      .orderBy(desc(runs.createdAt))
      .all();
    return NextResponse.json(result);
  }

  const allRuns = await db.select().from(runs).orderBy(desc(runs.createdAt)).all();
  return NextResponse.json(allRuns);
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();
  const { productId, planIds, authMode = "session_injection" } = body;

  if (!productId || !planIds || planIds.length === 0) {
    return NextResponse.json(
      { error: "productId and planIds are required" },
      { status: 400 }
    );
  }

  // Get the EXECUTOR service binding for Worker-to-Worker communication
  const { env } = getCloudflareContext();
  const executor = (env as unknown as Record<string, unknown>).EXECUTOR as { fetch: typeof fetch } | undefined;
  const executorSecret = process.env.EXECUTOR_SECRET;

  if (!executor || !executorSecret) {
    return NextResponse.json(
      { error: "Executor service not configured (EXECUTOR binding, EXECUTOR_SECRET)" },
      { status: 500 }
    );
  }

  const runId = uuid();
  const now = Math.floor(Date.now() / 1000);

  await db.insert(runs).values({
    id: runId,
    productId,
    mode: "quick",
    authMode,
    status: "running",
    createdAt: now,
  });

  // Create sessions and dispatch each to the executor workflow
  const sessionIds: string[] = [];
  const dispatchErrors: string[] = [];

  for (const planId of planIds) {
    const plan = await db.select().from(plans).where(eq(plans.id, planId)).get();
    if (!plan) continue;

    const persona = await db.select().from(personas).where(eq(personas.id, plan.personaId)).get();
    if (!persona) continue;

    const mission = await db.select().from(missions).where(eq(missions.id, plan.missionId)).get();
    if (!mission) continue;

    const run = await db.select().from(runs).where(eq(runs.id, runId)).get();
    const product = run
      ? await db.select().from(products).where(eq(products.id, run.productId)).get()
      : null;
    const productUrl = product?.url || mission.entryPoint;

    const sessionId = uuid();
    await db.insert(sessions).values({
      id: sessionId,
      runId,
      personaId: plan.personaId,
      planId: plan.id,
      status: "pending",
      maxSteps: 50,
      hardTimeoutSeconds: 900,
      createdAt: now,
    });
    sessionIds.push(sessionId);

    const behavioralFields = JSON.parse(persona.behavioralFields);

    // Dispatch to executor workflow via service binding
    try {
      const resp = await executor.fetch(
        new Request("https://executor/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-executor-secret": executorSecret,
          },
          body: JSON.stringify({
            sessionId,
            runId,
            persona: {
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
            plan: {
              missionDescription: mission.description,
              entryPoint: mission.entryPoint,
              productUrl,
              teacherState: plan.teacherState,
              steps: JSON.parse(plan.steps),
            },
            maxSteps: 50,
            hardTimeoutSeconds: 900,
          }),
        })
      );

      if (!resp.ok) {
        const errText = await resp.text();
        dispatchErrors.push(`Session ${sessionId}: executor returned ${resp.status}: ${errText.slice(0, 100)}`);
        console.error(`[runs] Executor dispatch failed for session ${sessionId}:`, errText.slice(0, 200));
      } else {
        const result = await resp.json() as { accepted: boolean; instanceId: string };
        console.log(`[runs] Dispatched session ${sessionId} → workflow ${result.instanceId}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      dispatchErrors.push(`Session ${sessionId}: ${msg}`);
      console.error(`[runs] Executor dispatch error for session ${sessionId}:`, msg);
    }
  }

  return NextResponse.json(
    {
      runId,
      sessionIds,
      status: "running",
      ...(dispatchErrors.length > 0 ? { warnings: dispatchErrors } : {}),
    },
    { status: 201 }
  );
}
