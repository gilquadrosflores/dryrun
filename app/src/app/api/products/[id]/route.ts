import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
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
  const db = getDb();
  const { id } = await params;
  const product = await db.select().from(products).where(eq(products.id, id)).get();
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(product);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const { id } = await params;

  const product = await db.select().from(products).where(eq(products.id, id)).get();
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete all related data in order
  const productRuns = await db.select().from(runs).where(eq(runs.productId, id)).all();
  for (const run of productRuns) {
    const runSessions = await db.select().from(sessions).where(eq(sessions.runId, run.id)).all();
    for (const session of runSessions) {
      await db.delete(scores).where(eq(scores.sessionId, session.id));
      await db.delete(reports).where(eq(reports.sessionId, session.id));
    }
    await db.delete(sessions).where(eq(sessions.runId, run.id));
  }
  await db.delete(runs).where(eq(runs.productId, id));

  const productPersonas = await db.select().from(personas).where(eq(personas.productId, id)).all();
  for (const persona of productPersonas) {
    const personaPlans = await db.select().from(plans).where(eq(plans.personaId, persona.id)).all();
    for (const plan of personaPlans) {
      await db.delete(missions).where(eq(missions.id, plan.missionId));
    }
    await db.delete(plans).where(eq(plans.personaId, persona.id));
  }
  await db.delete(personas).where(eq(personas.productId, id));
  await db.delete(missions).where(eq(missions.productId, id));
  await db.delete(products).where(eq(products.id, id));

  return NextResponse.json({ success: true });
}
