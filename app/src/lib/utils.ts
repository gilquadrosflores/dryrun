import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { getCloudflareContext } from "@opennextjs/cloudflare";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type R2Bucket = {
  get: (key: string) => Promise<{
    body: ReadableStream;
    httpMetadata?: { contentType?: string };
    text: () => Promise<string>;
  } | null>;
};

export function getR2Bucket(): R2Bucket | undefined {
  const { env } = getCloudflareContext();
  return (env as unknown as Record<string, unknown>).SCREENSHOTS as R2Bucket | undefined;
}
