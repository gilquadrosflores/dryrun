import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { personas, products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { generatePersonas } from "@/lib/ai/personas";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");

  if (!productId) {
    return NextResponse.json(
      { error: "productId is required" },
      { status: 400 }
    );
  }

  const result = db
    .select()
    .from(personas)
    .where(eq(personas.productId, productId))
    .all();
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { productId, count = 5 } = body;

  if (!productId) {
    return NextResponse.json(
      { error: "productId is required" },
      { status: 400 }
    );
  }

  const product = db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .get();

  if (!product) {
    return NextResponse.json(
      { error: "Product not found" },
      { status: 404 }
    );
  }

  const crawlSummary = product.crawlSummary
    ? JSON.parse(product.crawlSummary)
    : {
        productName: product.name,
        purpose: `Web application at ${product.url}`,
        targetUsers: ["general users"],
        coreWorkflows: ["main product flow"],
        keyFeatures: [],
      };

  const generated = await generatePersonas(
    crawlSummary,
    count,
    product.goals || undefined
  );

  const now = Math.floor(Date.now() / 1000);
  const created = generated.map((p) => {
    const id = uuid();
    db.insert(personas)
      .values({
        id,
        productId,
        name: p.name,
        role: p.role,
        behavioralFields: JSON.stringify(p.behavioralFields),
        evidenceSources: null,
        validated: 0,
        createdAt: now,
      })
      .run();
    return { id, ...p, productId, createdAt: now };
  });

  return NextResponse.json(created, { status: 201 });
}
