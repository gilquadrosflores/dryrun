import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plans, missions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const plan = db.select().from(plans).where(eq(plans.id, id)).get();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Delete associated mission
  db.delete(missions).where(eq(missions.id, plan.missionId)).run();
  db.delete(plans).where(eq(plans.id, id)).run();

  return NextResponse.json({ success: true });
}
