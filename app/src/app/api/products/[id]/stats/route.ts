import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { products, personas, plans, runs, missions } from "@/lib/db/schema";
import { eq, sql, desc } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const product = db.select().from(products).where(eq(products.id, id)).get();
  if (!product) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const personaCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(personas)
      .where(eq(personas.productId, id))
      .get()?.count ?? 0;

  // Plans are linked through personas and missions, both scoped to the product.
  // Count plans whose persona belongs to this product.
  const planCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(plans)
      .innerJoin(personas, eq(plans.personaId, personas.id))
      .where(eq(personas.productId, id))
      .get()?.count ?? 0;

  const runCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(runs)
      .where(eq(runs.productId, id))
      .get()?.count ?? 0;

  const lastRun = db
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
