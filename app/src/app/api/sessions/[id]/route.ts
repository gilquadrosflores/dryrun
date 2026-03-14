import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { sessions, scores, reports, personas, plans, missions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const { id } = await params;

  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .get();

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [score, report, persona, plan] = await Promise.all([
    db.select().from(scores).where(eq(scores.sessionId, id)).get(),
    db.select().from(reports).where(eq(reports.sessionId, id)).get(),
    db.select().from(personas).where(eq(personas.id, session.personaId)).get(),
    db.select().from(plans).where(eq(plans.id, session.planId)).get(),
  ]);

  const mission = plan
    ? await db.select().from(missions).where(eq(missions.id, plan.missionId)).get()
    : null;

  return NextResponse.json({
    session,
    score,
    report,
    persona,
    plan,
    mission,
  });
}
