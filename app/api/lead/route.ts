import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export const runtime = 'nodejs';

const MAX_REQUEST_BYTES = 12_000;
const MAX_LENGTH = {
  firstName: 80,
  lastName: 80,
  email: 254,
  phone: 40,
  company: 160,
  message: 4000,
} as const;

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
};

type Lead = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  message: string;
};

function asText(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= limit ? text : null;
}

function parseLead(value: unknown): Lead | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const firstName = asText(body.firstName, MAX_LENGTH.firstName);
  const lastName = asText(body.lastName, MAX_LENGTH.lastName);
  const email = asText(body.email, MAX_LENGTH.email);
  const phone = asText(body.phone, MAX_LENGTH.phone);
  const message = asText(body.message, MAX_LENGTH.message);
  const company = typeof body.company === 'string'
    ? body.company.trim().slice(0, MAX_LENGTH.company)
    : '';

  if (!firstName || !lastName || !email || !phone || !message) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (phone.replace(/\D/g, '').length < 7) return null;

  return { firstName, lastName, email, phone, company, message };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => HTML_ESCAPES[character] ?? character);
}

function hasMailConfig(): boolean {
  return Boolean(
    process.env.SMTP_EMAIL &&
      process.env.SMTP_PASSWORD &&
      process.env.NOTIFICATION_EMAIL,
  );
}

function hasCrmConfig(): boolean {
  return Boolean(process.env.ESPOCRM_URL && process.env.ESPOCRM_API_KEY);
}

async function createEspoLead(lead: Lead): Promise<boolean> {
  if (!hasCrmConfig()) return false;

  try {
    const response = await fetch(`${process.env.ESPOCRM_URL}/Lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': process.env.ESPOCRM_API_KEY!,
      },
      body: JSON.stringify({
        firstName: lead.firstName,
        lastName: lead.lastName,
        emailAddress: lead.email,
        accountName: lead.company,
        description: `Phone: ${lead.phone}\n\nMessage:\n${lead.message}`,
        status: 'New Lead',
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (response.ok) return true;
    console.error('Unable to create lead in CRM:', response.status);
  } catch (error) {
    console.error('CRM lead delivery failed:', error);
  }

  return false;
}

async function sendLeadEmails(lead: Lead): Promise<boolean> {
  if (!hasMailConfig()) return false;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: process.env.SMTP_EMAIL, pass: process.env.SMTP_PASSWORD },
  });

  const safe = {
    firstName: escapeHtml(lead.firstName),
    lastName: escapeHtml(lead.lastName),
    email: escapeHtml(lead.email),
    phone: escapeHtml(lead.phone),
    company: escapeHtml(lead.company || 'Not provided'),
    message: escapeHtml(lead.message).replace(/\n/g, '<br />'),
  };

  try {
    await transporter.sendMail({
      from: process.env.SMTP_EMAIL,
      to: process.env.NOTIFICATION_EMAIL,
      subject: 'New Quote Request - Oliphant Removal',
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2>New Quote Request</h2><p><strong>Name:</strong> ${safe.firstName} ${safe.lastName}</p><p><strong>Email:</strong> ${safe.email}</p><p><strong>Phone:</strong> ${safe.phone}</p><p><strong>Address/Company:</strong> ${safe.company}</p><p><strong>Message:</strong><br />${safe.message}</p></div>`,
    });
  } catch (error) {
    console.error('Admin lead email delivery failed:', error);
    return false;
  }

  try {
    await transporter.sendMail({
      from: process.env.SMTP_EMAIL,
      to: lead.email,
      subject: 'We Received Your Quote Request',
      html: `<div style="font-family:Arial,sans-serif;padding:20px"><h2>Thank You for Contacting Oliphant Removal</h2><p>Hello ${safe.firstName},</p><p>We received your quote request successfully.</p><p>Our team will review it and contact you shortly.</p><hr /><p><strong>Oliphant Removal</strong><br />Professional Tree Removal &amp; Cleanup Services</p></div>`,
    });
  } catch (error) {
    console.error('Customer confirmation email failed:', error);
  }

  return true;
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { success: false, error: 'Request is too large.' },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Request is too large.' },
        { status: 413 },
      );
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 400 });
  }

  const lead = parseLead(body);
  if (!lead) {
    return NextResponse.json(
      { success: false, error: 'Please provide valid contact information.' },
      { status: 400 },
    );
  }

  const [storedInCrm, emailed] = await Promise.all([
    createEspoLead(lead),
    sendLeadEmails(lead),
  ]);

  if (!storedInCrm && !emailed) {
    return NextResponse.json(
      { success: false, error: 'We could not submit your request. Please call us directly.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true });
}

