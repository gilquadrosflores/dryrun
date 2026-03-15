import { NextResponse } from "next/server";
import { getR2Bucket } from "@/lib/utils";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId parameter required" }, { status: 400 });
  }

  const bucket = getR2Bucket();
  if (!bucket) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }

  const object = await bucket.get(`recordings/${sessionId}.json`);
  if (!object) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
