import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { runs, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const db = getDb();
  const { id } = await params;

  const run = await db.select().from(runs).where(eq(runs.id, id)).get();
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const runSessions = await db
    .select()
    .from(sessions)
    .where(eq(sessions.runId, id))
    .all();

  return NextResponse.json({ run, sessions: runSessions });
}
