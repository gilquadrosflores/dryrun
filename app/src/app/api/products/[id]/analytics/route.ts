import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  products,
  personas,
  runs,
  sessions,
  scores,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface FrictionEvent {
  step: number;
  severity: number;
  description: string;
  category: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const { id } = await params;

  const product = await db.select().from(products).where(eq(products.id, id)).get();
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get all runs for this product
  const productRuns = await db
    .select()
    .from(runs)
    .where(eq(runs.productId, id))
    .all();

  // Get all sessions across all runs
  const allSessions = (
    await Promise.all(
      productRuns.map((run) =>
        db.select().from(sessions).where(eq(sessions.runId, run.id)).all()
      )
    )
  ).flat();

  // Get all scores
  const allScores = (
    await Promise.all(
      allSessions.map((s) =>
        db.select().from(scores).where(eq(scores.sessionId, s.id)).get()
      )
    )
  ).filter(Boolean);

  // Get all personas
  const productPersonas = await db
    .select()
    .from(personas)
    .where(eq(personas.productId, id))
    .all();

  // Aggregate friction events across all sessions
  const allFrictionEvents: (FrictionEvent & { personaId: string; sessionId: string })[] = [];
  for (const score of allScores) {
    if (!score || !score.frictionEvents) continue;
    try {
      const events: FrictionEvent[] = JSON.parse(score.frictionEvents);
      const session = allSessions.find((s) => s.id === score.sessionId);
      events.forEach((e) =>
        allFrictionEvents.push({
          ...e,
          personaId: session?.personaId || "",
          sessionId: score.sessionId,
        })
      );
    } catch {
      // skip
    }
  }

  // Category breakdown
  const categoryMap: Record<string, { count: number; avgSeverity: number; total: number }> = {};
  for (const event of allFrictionEvents) {
    const cat = event.category || "uncategorized";
    if (!categoryMap[cat]) categoryMap[cat] = { count: 0, avgSeverity: 0, total: 0 };
    categoryMap[cat].count++;
    categoryMap[cat].total += event.severity;
    categoryMap[cat].avgSeverity = categoryMap[cat].total / categoryMap[cat].count;
  }

  // Severity distribution
  const severityDist = [0, 0, 0, 0, 0]; // index 0 = severity 1, etc.
  for (const event of allFrictionEvents) {
    if (event.severity >= 1 && event.severity <= 5) {
      severityDist[event.severity - 1]++;
    }
  }

  // Per-persona performance
  const personaPerformance = productPersonas.map((persona) => {
    const personaSessions = allSessions.filter((s) => s.personaId === persona.id);
    const personaScores = personaSessions
      .map((s) => allScores.find((sc) => sc?.sessionId === s.id))
      .filter(Boolean);

    const totalFriction = personaScores.reduce((acc, sc) => {
      if (!sc?.frictionEvents) return acc;
      try {
        return acc + JSON.parse(sc.frictionEvents).length;
      } catch {
        return acc;
      }
    }, 0);

    const goalCounts = { yes: 0, partial: 0, no: 0 };
    personaSessions.forEach((s) => {
      const g = s.goalAchieved as keyof typeof goalCounts;
      if (g && g in goalCounts) goalCounts[g]++;
    });

    const avgDuration = personaSessions.filter((s) => s.durationSeconds).length > 0
      ? Math.round(
          personaSessions
            .filter((s) => s.durationSeconds)
            .reduce((a, s) => a + (s.durationSeconds || 0), 0) /
            personaSessions.filter((s) => s.durationSeconds).length
        )
      : null;

    const fields = JSON.parse(persona.behavioralFields);

    return {
      personaId: persona.id,
      name: persona.name,
      role: persona.role,
      archetype: fields.archetype,
      sessionCount: personaSessions.length,
      goalCounts,
      avgDuration,
      totalFrictionEvents: totalFriction,
      abandonmentRate: personaSessions.length > 0
        ? Math.round(
            (personaSessions.filter((s) => s.status === "abandoned").length /
              personaSessions.length) *
              100
          )
        : 0,
    };
  });

  // Run-over-run trend
  const runTrend = productRuns
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((run, index) => {
      const runSessions = allSessions.filter((s) => s.runId === run.id);
      const runScores = runSessions
        .map((s) => allScores.find((sc) => sc?.sessionId === s.id))
        .filter(Boolean);

      let totalFriction = 0;
      let maxSeverity = 0;
      for (const sc of runScores) {
        if (!sc?.frictionEvents) continue;
        try {
          const events: FrictionEvent[] = JSON.parse(sc.frictionEvents);
          totalFriction += events.length;
          for (const e of events) {
            if (e.severity > maxSeverity) maxSeverity = e.severity;
          }
        } catch {
          // skip
        }
      }

      const goalsAchieved = runSessions.filter(
        (s) => s.goalAchieved === "yes"
      ).length;

      return {
        runIndex: index + 1,
        runId: run.id,
        createdAt: run.createdAt,
        sessionCount: runSessions.length,
        goalsAchieved,
        goalRate: runSessions.length > 0
          ? Math.round((goalsAchieved / runSessions.length) * 100)
          : 0,
        totalFrictionEvents: totalFriction,
        avgFrictionPerSession: runSessions.length > 0
          ? Math.round((totalFriction / runSessions.length) * 10) / 10
          : 0,
        maxSeverity,
      };
    });

  // Top friction events (most severe across all sessions)
  const topFriction = [...allFrictionEvents]
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 10)
    .map((e) => {
      const persona = productPersonas.find((p) => p.id === e.personaId);
      return {
        ...e,
        personaName: persona?.name || "Unknown",
      };
    });

  return NextResponse.json({
    totalRuns: productRuns.length,
    totalSessions: allSessions.length,
    totalFrictionEvents: allFrictionEvents.length,
    avgSessionDuration: allSessions.filter((s) => s.durationSeconds).length > 0
      ? Math.round(
          allSessions
            .filter((s) => s.durationSeconds)
            .reduce((a, s) => a + (s.durationSeconds || 0), 0) /
            allSessions.filter((s) => s.durationSeconds).length
        )
      : null,
    overallGoalRate: allSessions.length > 0
      ? Math.round(
          (allSessions.filter((s) => s.goalAchieved === "yes").length /
            allSessions.length) *
            100
        )
      : 0,
    overallAbandonmentRate: allSessions.length > 0
      ? Math.round(
          (allSessions.filter((s) => s.status === "abandoned").length /
            allSessions.length) *
            100
        )
      : 0,
    severityDistribution: severityDist,
    categoryBreakdown: Object.entries(categoryMap).map(([category, data]) => ({
      category,
      count: data.count,
      avgSeverity: Math.round(data.avgSeverity * 10) / 10,
    })),
    personaPerformance,
    runTrend,
    topFriction,
  });
}
