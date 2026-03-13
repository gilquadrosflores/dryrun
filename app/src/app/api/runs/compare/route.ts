import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs, sessions, scores, personas, plans, missions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface FrictionEvent {
  step: number;
  severity: number;
  description: string;
  category: string;
}

function getRunData(runId: string) {
  const run = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!run) return null;

  const runSessions = db.select().from(sessions).where(eq(sessions.runId, runId)).all();

  const sessionData = runSessions.map((session) => {
    const persona = db.select().from(personas).where(eq(personas.id, session.personaId)).get();
    const plan = db.select().from(plans).where(eq(plans.id, session.planId)).get();
    const mission = plan
      ? db.select().from(missions).where(eq(missions.id, plan.missionId)).get()
      : null;
    const score = db.select().from(scores).where(eq(scores.sessionId, session.id)).get();

    let frictionEvents: FrictionEvent[] = [];
    if (score?.frictionEvents) {
      try {
        frictionEvents = JSON.parse(score.frictionEvents);
      } catch {
        // skip
      }
    }

    return {
      sessionId: session.id,
      personaId: session.personaId,
      personaName: persona?.name || "Unknown",
      personaRole: persona?.role || "",
      missionDescription: mission?.description || "",
      status: session.status,
      goalAchieved: session.goalAchieved,
      durationSeconds: session.durationSeconds,
      frictionCount: frictionEvents.length,
      maxSeverity: frictionEvents.length > 0
        ? Math.max(...frictionEvents.map((e) => e.severity))
        : 0,
      topFriction: frictionEvents.sort((a, b) => b.severity - a.severity)[0] || null,
      categories: [...new Set(frictionEvents.map((e) => e.category))],
    };
  });

  const goalRate = runSessions.length > 0
    ? Math.round((runSessions.filter((s) => s.goalAchieved === "yes").length / runSessions.length) * 100)
    : 0;

  const abandonRate = runSessions.length > 0
    ? Math.round((runSessions.filter((s) => s.status === "abandoned").length / runSessions.length) * 100)
    : 0;

  const totalFriction = sessionData.reduce((a, s) => a + s.frictionCount, 0);

  return {
    runId: run.id,
    createdAt: run.createdAt,
    status: run.status,
    sessionCount: runSessions.length,
    goalRate,
    abandonRate,
    totalFriction,
    avgFrictionPerSession: runSessions.length > 0
      ? Math.round((totalFriction / runSessions.length) * 10) / 10
      : 0,
    sessions: sessionData,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const runA = searchParams.get("runA");
  const runB = searchParams.get("runB");

  if (!runA || !runB) {
    return NextResponse.json({ error: "runA and runB are required" }, { status: 400 });
  }

  const dataA = getRunData(runA);
  const dataB = getRunData(runB);

  if (!dataA || !dataB) {
    return NextResponse.json({ error: "One or both runs not found" }, { status: 404 });
  }

  // Compute deltas
  const deltas = {
    goalRate: dataB.goalRate - dataA.goalRate,
    abandonRate: dataB.abandonRate - dataA.abandonRate,
    totalFriction: dataB.totalFriction - dataA.totalFriction,
    avgFrictionPerSession: Math.round((dataB.avgFrictionPerSession - dataA.avgFrictionPerSession) * 10) / 10,
  };

  // Match sessions by persona for comparison
  const personaComparison = dataA.sessions.map((sessionA) => {
    const matchingB = dataB.sessions.find((sb) => sb.personaId === sessionA.personaId);
    return {
      personaName: sessionA.personaName,
      personaRole: sessionA.personaRole,
      runA: {
        goalAchieved: sessionA.goalAchieved,
        frictionCount: sessionA.frictionCount,
        maxSeverity: sessionA.maxSeverity,
        durationSeconds: sessionA.durationSeconds,
        status: sessionA.status,
      },
      runB: matchingB
        ? {
            goalAchieved: matchingB.goalAchieved,
            frictionCount: matchingB.frictionCount,
            maxSeverity: matchingB.maxSeverity,
            durationSeconds: matchingB.durationSeconds,
            status: matchingB.status,
          }
        : null,
      frictionDelta: matchingB ? matchingB.frictionCount - sessionA.frictionCount : null,
    };
  });

  return NextResponse.json({
    runA: dataA,
    runB: dataB,
    deltas,
    personaComparison,
  });
}
