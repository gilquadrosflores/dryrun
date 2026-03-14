import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { products, personas, plans, runs } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";

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

  const personaCountRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(personas)
    .where(eq(personas.productId, id))
    .get();
  const personaCount = personaCountRow?.count ?? 0;

  const planCountRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(plans)
    .innerJoin(personas, eq(plans.personaId, personas.id))
    .where(eq(personas.productId, id))
    .get();
  const planCount = planCountRow?.count ?? 0;

  const runCountRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(runs)
    .where(eq(runs.productId, id))
    .get();
  const runCount = runCountRow?.count ?? 0;

  const lastRun = await db
    .select({ status: runs.status })
    .from(runs)
    .where(eq(runs.productId, id))
    .orderBy(desc(runs.createdAt))
    .limit(1)
    .get();

  return NextResponse.json({
    personaCount,
    planCount,
    runCount,
    lastRunStatus: lastRun?.status ?? null,
  });
}
