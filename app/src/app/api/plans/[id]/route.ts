import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { plans, missions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const { id } = await params;

  const plan = await db.select().from(plans).where(eq(plans.id, id)).get();

  if (!plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  await db.delete(missions).where(eq(missions.id, plan.missionId));
  await db.delete(plans).where(eq(plans.id, id));

  return NextResponse.json({ success: true });
}
