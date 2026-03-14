import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { v4 as uuid } from "uuid";
import { crawlProduct } from "@/lib/crawl";
import { desc, eq } from "drizzle-orm";

export async function GET() {
  const db = getDb();
  const allProducts = await db
    .select()
    .from(products)
    .orderBy(desc(products.createdAt))
    .all();
  return NextResponse.json(allProducts);
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();
  const { url, name, goals } = body;

  if (!url || !name) {
    return NextResponse.json(
      { error: "url and name are required" },
      { status: 400 }
    );
  }

  const id = uuid();
  const now = Math.floor(Date.now() / 1000);

  let crawlSummary = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      const result = await crawlProduct(url, goals);
      crawlSummary = JSON.stringify(result);
    } catch (error) {
      console.error("Crawl failed:", error);
    }
  }

  await db.insert(products).values({
    id,
    name,
    url,
    crawlSummary,
    goals: goals || null,
    createdAt: now,
    updatedAt: now,
  });

  const product = await db.select().from(products).where(eq(products.id, id)).get();

  return NextResponse.json(product, { status: 201 });
}
