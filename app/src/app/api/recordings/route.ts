import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId parameter required" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const bucket = (env as unknown as Record<string, unknown>).SCREENSHOTS as
    | { get: (key: string) => Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null> }
    | undefined;

  if (!bucket) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 500 });
  }

  const key = `recordings/${sessionId}.json`;
  const object = await bucket.get(key);
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
