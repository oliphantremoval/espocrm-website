import { NextResponse } from "next/server";
import { isSameOrigin, ownerAuthConfig, ownerIsSignedIn, privateHeaders } from "@/lib/crm-auth";
import { getWebsiteContent, saveWebsiteContent } from "@/lib/website-content-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 20_000;

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: privateHeaders });
}

async function authorized(): Promise<boolean> {
  const config = ownerAuthConfig();
  return Boolean(config && await ownerIsSignedIn(config));
}

async function readBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw new Error("Request is too large.");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("Request is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Enter valid website content.");
  }
}

export async function GET() {
  if (!(await authorized())) return new NextResponse("Unauthorized", { status: 401, headers: privateHeaders });
  return json(await getWebsiteContent());
}

export async function PUT(request: Request) {
  if (!(await authorized())) return new NextResponse("Unauthorized", { status: 401, headers: privateHeaders });
  if (!isSameOrigin(request)) return new NextResponse("Forbidden", { status: 403, headers: privateHeaders });
  try {
    const content = await saveWebsiteContent(await readBody(request));
    return json(content);
  } catch (error) {
    const message = error instanceof Error && /^(Request is too large|Enter valid|.+must |.+between |.+digits|.+unique)/.test(error.message)
      ? error.message
      : "Website content could not be saved. Please try again.";
    return json({ error: message }, 400);
  }
}

