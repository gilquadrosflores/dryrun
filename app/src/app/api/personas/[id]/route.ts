import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { personas, plans, missions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const { id } = await params;

  const persona = await db
    .select()
    .from(personas)
    .where(eq(personas.id, id))
    .get();

  if (!persona) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  // Delete associated plans and missions
  const personaPlans = await db
    .select()
    .from(plans)
    .where(eq(plans.personaId, id))
    .all();

  for (const plan of personaPlans) {
    await db.delete(missions).where(eq(missions.id, plan.missionId));
    await db.delete(plans).where(eq(plans.id, plan.id));
  }

  await db.delete(personas).where(eq(personas.id, id));

  return NextResponse.json({ success: true });
}
