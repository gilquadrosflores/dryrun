import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "key parameter required" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const bucket = (env as unknown as Record<string, unknown>).SCREENSHOTS as
    | { get: (key: string) => Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string } } | null> }
    | undefined;

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
