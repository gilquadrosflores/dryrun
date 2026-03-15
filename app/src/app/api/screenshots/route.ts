import { NextResponse } from "next/server";
import { getR2Bucket } from "@/lib/utils";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "key parameter required" }, { status: 400 });
  }

  const bucket = getR2Bucket();
  if (!bucket) {
    return NextResponse.json({ error: "Screenshots storage not configured" }, { status: 500 });
  }

  const object = await bucket.get(key);
  if (!object) {
    return NextResponse.json({ error: "Screenshot not found" }, { status: 404 });
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
