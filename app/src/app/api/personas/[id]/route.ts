import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { personas, plans, missions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const persona = db
    .select()
    .from(personas)
    .where(eq(personas.id, id))
    .get();

  if (!persona) {
    return NextResponse.json({ error: "Persona not found" }, { status: 404 });
  }

  // Delete associated plans and missions
  const personaPlans = db
    .select()
    .from(plans)
    .where(eq(plans.personaId, id))
    .all();

  for (const plan of personaPlans) {
    db.delete(missions).where(eq(missions.id, plan.missionId)).run();
    db.delete(plans).where(eq(plans.id, plan.id)).run();
  }

  db.delete(personas).where(eq(personas.id, id)).run();

  return NextResponse.json({ success: true });
}
