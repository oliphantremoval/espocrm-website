import { NextResponse } from "next/server";
import { createDefaultSettings, validateImport, type CRMState } from "@/app/crm/model";
import { isSameOrigin, privateHeaders } from "@/lib/crm-auth";
import { currentCrmActor, currentCrmIdentity } from "@/lib/crm-team-auth";
import { readSmallBody } from "@/lib/portal-auth";
import { portalDb, record } from "@/lib/portal-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Leave space for metadata and server-owned settings within Vercel's body limit.
const MAX_BODY_BYTES = 3_900_000;
const MAX_REVISION = 2_147_483_646;
const SIZE_ERROR = "The workspace is too large to save online. Keep a backup and remove older records before trying again.";
const CONFLICT_ERROR = "Someone else changed this workspace. Reload the shared workspace, then review and reapply your edit.";

type Actor = NonNullable<Awaited<ReturnType<typeof currentCrmActor>>>;

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: privateHeaders });
}

/** Return only the settings a team member uses in their role. */
function visibleState(state: CRMState, actor: Actor): CRMState {
  if (actor.role === "primary") return state;
  const defaults = createDefaultSettings();
  const profile = {
    ownerName: actor.name,
    title: actor.role === "manager" ? "Manager" : "Co-owner",
    contactEmail: actor.email,
    phone: "",
  };
  if (actor.role === "co-owner") return { ...state, settings: { ...state.settings, profile } };
  return {
    ...state,
    settings: {
      ...defaults,
      profile,
      business: {
        ...defaults.business,
        name: state.settings.business.name,
        timezone: state.settings.business.timezone,
      },
      services: state.settings.services,
      jobDefaults: state.settings.jobDefaults,
    },
  };
}

function workspaceResponse(row: Record<string, unknown>, actor: Actor) {
  return json({ state: visibleState(validateImport(row.state), actor), revision: row.revision });
}

export async function GET() {
  try {
    const actor = await currentCrmActor();
    if (!actor) return json({ error: "Sign in to open the shared workspace." }, 401);
    const sql = portalDb();
    const [row] = await sql`SELECT state, revision FROM crm_workspace WHERE id = 1`;
    return row ? workspaceResponse(row, actor) : json({ state: null, revision: null });
  } catch {
    return json({ error: "The shared workspace could not be loaded. Try again shortly." }, 503);
  }
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) return json({ error: "This request must come from the CRM." }, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Send the workspace as JSON." }, 415);
  }

  try {
    const identity = await currentCrmIdentity();
    if (!identity) return json({ error: "Sign in to save the shared workspace." }, 401);
    const { actor } = identity;

    let raw: string;
    try {
      raw = await readSmallBody(request, MAX_BODY_BYTES);
    } catch (error) {
      if (error instanceof Error && error.message === "Request too large.") return json({ error: SIZE_ERROR }, 413);
      return json({ error: "The workspace request could not be read." }, 400);
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "The workspace request is not valid JSON." }, 400);
    }
    if (!record(body)) return json({ error: "The workspace request is missing." }, 400);
    const revision = body.revision;
    if (revision !== null && (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1 || revision > MAX_REVISION)) {
      return json({ error: "The workspace version is invalid. Reload the CRM and try again." }, 400);
    }
    if (revision === null && actor.role !== "primary") {
      return json({ error: "The primary owner needs to set up the shared workspace first." }, 403);
    }

    let state: CRMState;
    try {
      state = validateImport(body.state);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "The workspace data is invalid." }, 400);
    }
    if (state.demo) return json({ error: "A demo workspace cannot be shared. Start with an empty workspace or import real records." }, 400);
    const serialized = JSON.stringify(state);
    if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) return json({ error: SIZE_ERROR }, 413);

    const sql = portalDb();
    if (revision === null) {
      // A second initialization attempt can never overwrite the first one.
      const [row] = await sql`
        INSERT INTO crm_workspace (id, state) VALUES (1, ${serialized}::jsonb)
        ON CONFLICT (id) DO NOTHING
        RETURNING state, revision
      `;
      return row ? workspaceResponse(row, actor) : json({ error: CONFLICT_ERROR }, 409);
    }

    // Check team access and the workspace revision during the update. The
    // team member row lock orders the update against account access changes.
    const primary = actor.role === "primary";
    const [result] = await sql`
      WITH active_member AS MATERIALIZED (
        SELECT m.id
        FROM crm_team_sessions AS s JOIN crm_team_members AS m ON m.id = s.member_id
        WHERE s.token_hash = ${identity.teamSessionHash} AND s.expires_at > now()
          AND m.enabled AND m.access_version = s.access_version AND m.role = ${actor.role}
        FOR SHARE OF m
      ), updated AS (
        UPDATE crm_workspace AS existing
        SET state = CASE ${actor.role}::text
          WHEN 'manager' THEN jsonb_set(submitted.state, '{settings}', existing.state -> 'settings')
          WHEN 'co-owner' THEN jsonb_set(submitted.state, '{settings,profile}', existing.state #> '{settings,profile}')
          ELSE submitted.state
        END,
        revision = existing.revision + 1,
        updated_at = now()
        FROM (SELECT ${serialized}::jsonb AS state) AS submitted
        WHERE existing.id = 1 AND existing.revision = ${revision}
          AND (${primary}::boolean OR EXISTS (SELECT 1 FROM active_member))
        RETURNING existing.state, existing.revision
      )
      SELECT (${primary}::boolean OR EXISTS (SELECT 1 FROM active_member)) AS allowed,
        (SELECT to_jsonb(updated) FROM updated) AS workspace
    `;
    if (!result.allowed) return json({ error: "Your team access changed. Sign in again to continue." }, 401);
    return result.workspace ? workspaceResponse(result.workspace, actor) : json({ error: CONFLICT_ERROR }, 409);
  } catch {
    return json({ error: "The shared workspace save could not be confirmed. Reload to check the latest records before trying again." }, 503);
  }
}
