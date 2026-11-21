import "server-only";

import { get, put } from "@vercel/blob";
import { createDefaultWebsiteContent, normalizeWebsiteContent, type WebsiteContent } from "./website-content";

const PATHNAME = "website-content/current.json";

function storageIsConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

export async function getWebsiteContent(): Promise<WebsiteContent> {
  const fallback = createDefaultWebsiteContent();
  if (!storageIsConfigured()) return fallback;

  try {
    const result = await get(PATHNAME, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return fallback;
    const raw = await new Response(result.stream).text();
    const parsed: unknown = JSON.parse(raw);
    const updatedAt = typeof (parsed as { updatedAt?: unknown }).updatedAt === "string"
      ? (parsed as { updatedAt: string }).updatedAt
      : "";
    return normalizeWebsiteContent(parsed, updatedAt);
  } catch (error) {
    console.error("Website content could not be loaded:", error instanceof Error ? error.name : "unknown error");
    return fallback;
  }
}

export async function saveWebsiteContent(input: unknown): Promise<WebsiteContent> {
  if (!storageIsConfigured()) throw new Error("Website storage is not connected.");
  const content = normalizeWebsiteContent(input);
  await put(PATHNAME, JSON.stringify(content), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: "application/json",
  });
  return content;
}

