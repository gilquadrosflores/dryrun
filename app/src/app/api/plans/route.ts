import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { plans, personas, missions, products } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { generatePlans } from "@/lib/ai/plans";

export async function GET(req: Request) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  const personaId = searchParams.get("personaId");

  if (personaId) {
    const result = await db
      .select()
      .from(plans)
      .where(eq(plans.personaId, personaId))
      .all();
    return NextResponse.json(result);
  }

  if (productId) {
    const productPersonas = await db
      .select()
      .from(personas)
      .where(eq(personas.productId, productId))
      .all();
    const personaIds = productPersonas.map((p) => p.id);

    const allPlans = await db.select().from(plans).all();
    const filtered = allPlans.filter((p) => personaIds.includes(p.personaId));
    return NextResponse.json(filtered);
  }

  return NextResponse.json(
    { error: "productId or personaId is required" },
    { status: 400 }
  );
}

export async function POST(req: Request) {
  const db = getDb();
  const body = await req.json();
  const { personaId, count = 2 } = body;

  if (!personaId) {
    return NextResponse.json(
      { error: "personaId is required" },
      { status: 400 }
    );
  }

  const persona = await db
    .select()
    .from(personas)
    .where(eq(personas.id, personaId))
    .get();

  if (!persona) {
    return NextResponse.json(
      { error: "Persona not found" },
      { status: 404 }
    );
  }

  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, persona.productId))
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
        coreWorkflows: ["main product flow"],
      };

  const behavioralFields = JSON.parse(persona.behavioralFields);

  const generated = await generatePlans(
    {
      productName: crawlSummary.productName || product.name,
      productUrl: product.url,
      purpose: crawlSummary.purpose || "",
      coreWorkflows: crawlSummary.coreWorkflows || [],
      personaName: persona.name,
      personaRole: persona.role,
      behavioralFields,
    },
    count
  );

  const now = Math.floor(Date.now() / 1000);
  const created = [];
  for (const p of generated) {
    const planId = uuid();
    const missionId = uuid();

    await db.insert(missions).values({
      id: missionId,
      productId: product.id,
      description: p.missionDescription,
      entryPoint: p.entryPoint,
      createdAt: now,
    });

    await db.insert(plans).values({
      id: planId,
      personaId,
      missionId,
      scenarioDimensions: JSON.stringify(p.scenarioDimensions),
      teacherState: p.teacherState,
      steps: JSON.stringify(p.steps),
      approved: 0,
      createdAt: now,
    });

    created.push({ id: planId, missionId, ...p, personaId, createdAt: now });
  }

  return NextResponse.json(created, { status: 201 });
}

export async function PATCH(req: Request) {
  const db = getDb();
  const body = await req.json();
  const { planId, approved } = body;

  if (!planId) {
    return NextResponse.json(
      { error: "planId is required" },
      { status: 400 }
    );
  }

  await db.update(plans)
    .set({ approved: approved ? 1 : 0 })
    .where(eq(plans.id, planId));

  return NextResponse.json({ success: true });
}
