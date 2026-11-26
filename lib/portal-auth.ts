import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { portalDb } from "./portal-db";

export const portalCookie = process.env.NODE_ENV === "production" ? "__Host-oliphant-customer" : "oliphant-customer";
export const portalCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 60 * 60 * 24 };
export const portalHeaders = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export function newToken(): string { return randomBytes(32).toString("base64url"); }
export function validToken(token: string): boolean { return /^[A-Za-z0-9_-]{43}$/.test(token); }
export function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }

export async function currentSessionHash(): Promise<string | null> {
  const raw = (await headers()).get("cookie") ?? "";
  if (raw.split(";").filter((part) => part.trim().split("=", 1)[0] === portalCookie).length !== 1) return null;
  const token = (await cookies()).get(portalCookie)?.value ?? "";
  if (!validToken(token)) return null;
  return tokenHash(token);
}

export async function allowLoginRequest(request: Request, email: string): Promise<boolean> {
  const secret = process.env.CRM_SESSION_SECRET;
  if (!secret || secret.length < 32) return false;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ip = /^[0-9a-fA-F:.]{1,64}$/.test(forwarded) ? forwarded : "unknown";
  const ipKey = createHmac("sha256", secret).update(`portal-rate-ip\0${ip}`).digest("hex");
  const emailKey = createHmac("sha256", secret).update(`portal-rate-email\0${email}`).digest("hex");
  const sql = portalDb();
  const rows = await sql`INSERT INTO portal_rate_limits (key_hash, window_start, attempts) VALUES (${ipKey}, date_trunc('hour', now()), 1), (${emailKey}, date_trunc('hour', now()), 1) ON CONFLICT (key_hash, window_start) DO UPDATE SET attempts = portal_rate_limits.attempts + 1 RETURNING key_hash, attempts`;
  return rows.length === 2 && rows.every((row) => Number(row.attempts) <= (row.key_hash === ipKey ? 20 : 4));
}

export async function readSmallBody(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Request too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new Error("Request too large."); }
      chunks.push(value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } finally { reader.releaseLock(); }
}

