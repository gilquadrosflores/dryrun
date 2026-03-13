import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  products,
  personas,
  plans,
  missions,
  runs,
  sessions,
  scores,
  reports,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = db.select().from(products).where(eq(products.id, id)).get();
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(product);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const product = db.select().from(products).where(eq(products.id, id)).get();
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete all related data in order
  const productRuns = db.select().from(runs).where(eq(runs.productId, id)).all();
  for (const run of productRuns) {
    const runSessions = db.select().from(sessions).where(eq(sessions.runId, run.id)).all();
    for (const session of runSessions) {
      db.delete(scores).where(eq(scores.sessionId, session.id)).run();
      db.delete(reports).where(eq(reports.sessionId, session.id)).run();
    }
    db.delete(sessions).where(eq(sessions.runId, run.id)).run();
  }
  db.delete(runs).where(eq(runs.productId, id)).run();

  const productPersonas = db.select().from(personas).where(eq(personas.productId, id)).all();
  for (const persona of productPersonas) {
    const personaPlans = db.select().from(plans).where(eq(plans.personaId, persona.id)).all();
    for (const plan of personaPlans) {
      db.delete(missions).where(eq(missions.id, plan.missionId)).run();
    }
    db.delete(plans).where(eq(plans.personaId, persona.id)).run();
  }
  db.delete(personas).where(eq(personas.productId, id)).run();
  db.delete(missions).where(eq(missions.productId, id)).run();
  db.delete(products).where(eq(products.id, id)).run();

  return NextResponse.json({ success: true });
}
