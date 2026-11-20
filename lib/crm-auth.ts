import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getAuthConfig,
  getEmailAuthConfig,
  verifyEmailSession,
  verifySession,
  type AuthConfig,
  type EmailAuthConfig,
} from "./crm-auth-core";

export type OwnerAuthConfig =
  | { mode: "email"; credentials: EmailAuthConfig }
  | { mode: "password"; credentials: AuthConfig };

export function ownerAuthConfig(): OwnerAuthConfig | null {
  const emailCredentials = getEmailAuthConfig(process.env);
  if (emailCredentials) return { mode: "email", credentials: emailCredentials };
  const passwordCredentials = getAuthConfig(process.env);
  return passwordCredentials ? { mode: "password", credentials: passwordCredentials } : null;
}

export function ownerEmailAuthConfig(): EmailAuthConfig | null {
  return getEmailAuthConfig(process.env);
}

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production"
    ? "__Host-oliphant-crm-session"
    : "oliphant-crm-session";
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  };
}

export async function ownerIsSignedIn(config: OwnerAuthConfig): Promise<boolean> {
  // Next's cookie collection deduplicates names, so inspect the raw header first.
  const name = sessionCookieName();
  const rawCookies = (await headers()).get("cookie") ?? "";
  const matches = rawCookies.split(";").filter((part) => part.trim().split("=", 1)[0] === name);
  if (matches.length !== 1) return false;
  const store = await cookies();
  const tokens = store.getAll(name);
  if (tokens.length !== 1) return false;
  return config.mode === "email"
    ? verifyEmailSession(tokens[0].value, config.credentials)
    : verifySession(tokens[0].value, config.credentials);
}

export async function requireOwner(): Promise<void> {
  const config = ownerAuthConfig();
  if (!config || !(await ownerIsSignedIn(config))) redirect("/crm/login");
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

export const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

