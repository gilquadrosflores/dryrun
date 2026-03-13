import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  reports,
  runs,
  sessions,
  scores,
  personas,
  plans,
  missions,
  products,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { generateRunReport } from "@/lib/ai/reports";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const runId = searchParams.get("runId");

  if (sessionId) {
    const result = db
      .select()
      .from(reports)
      .where(eq(reports.sessionId, sessionId))
      .get();
    return NextResponse.json(result || null);
  }

  if (runId) {
    const result = db
      .select()
      .from(reports)
      .where(eq(reports.runId, runId))
      .all();
    return NextResponse.json(result);
  }

  const allReports = db.select().from(reports).all();
  return NextResponse.json(allReports);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { runId } = body;

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const product = db
    .select()
    .from(products)
    .where(eq(products.id, run.productId))
    .get();

  const runSessions = db
    .select()
    .from(sessions)
    .where(eq(sessions.runId, runId))
    .all();

  const sessionSummaries = runSessions.map((session) => {
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
    const mission = plan
      ? db.select().from(missions).where(eq(missions.id, plan.missionId)).get()
      : null;
    const score = db
      .select()
      .from(scores)
      .where(eq(scores.sessionId, session.id))
      .get();

    const frictionEvents = score?.frictionEvents
      ? JSON.parse(score.frictionEvents)
      : [];

    return {
      personaName: persona?.name || "Unknown",
      personaRole: persona?.role || "Unknown",
      missionDescription: mission?.description || "Unknown mission",
      goalAchieved: session.goalAchieved || "no",
      abandonmentPoint: session.abandonmentPoint,
      durationSeconds: session.durationSeconds,
      frictionEventCount: frictionEvents.length,
      highestSeverity: frictionEvents.length > 0
        ? Math.max(...frictionEvents.map((e: { severity: number }) => e.severity))
        : 0,
      churnReason: score?.aiReview?.slice(0, 100) || "Unknown",
    };
  });

  const content = await generateRunReport(
    product?.name || "Unknown Product",
    sessionSummaries
  );

  const reportId = uuid();
  const now = Math.floor(Date.now() / 1000);

  db.insert(reports)
    .values({
      id: reportId,
      runId,
      type: "run",
      content,
      createdAt: now,
    })
    .run();

  return NextResponse.json({ id: reportId, content }, { status: 201 });
}
