import "server-only";
import { neon } from "@neondatabase/serverless";

export function portalDb() {
  // Preview deployments share project variables unless a separate database is configured.
  // Never let a preview read or modify the production customer portal.
  if (process.env.VERCEL_ENV === "preview") throw new Error("Customer portals are unavailable in previews.");
  const url = process.env.ORSTORAGE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Customer portal storage is not configured.");
  return neon(url);
}

export function portalCustomer(row: Record<string, unknown>) {
  return { id: row.id, name: row.name, email: row.email, phone: row.phone, address: row.address, enabled: row.enabled };
}

export function portalJob(row: Record<string, unknown>) {
  return { id: row.id, title: row.title, service: row.service, status: row.status, scheduledDate: row.scheduled_date, scheduledTime: row.scheduled_time, description: row.description };
}

export function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function field(value: unknown, max: number, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new Error("Invalid field.");
  return value.trim();
}

export function emailAddress(value: unknown): string {
  const email = field(value, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email.");
  return email;
}

export function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validatePublishedJob(body: unknown) {
  if (!record(body)) throw new Error("Invalid job.");
  const title = field(body.title, 200, true), service = field(body.service, 80, true), status = field(body.status, 30, true), date = field(body.scheduledDate, 10), time = field(body.scheduledTime, 5), description = field(body.description, 5000);
  if (!["New lead", "Estimate sent", "Scheduled", "In progress", "Completed", "Lost"].includes(status)) throw new Error("Invalid status.");
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw new Error("Invalid date.");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Invalid time.");
  return { title, service, status, date, time, description };
}

