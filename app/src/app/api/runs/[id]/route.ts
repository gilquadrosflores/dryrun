import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runs, sessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const run = db.select().from(runs).where(eq(runs.id, id)).get();
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const runSessions = db
    .select()
    .from(sessions)
    .where(eq(sessions.runId, id))
    .all();

  return NextResponse.json({ run, sessions: runSessions });
}
