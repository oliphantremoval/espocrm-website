"use client";

import { useEffect, useState, type FormEvent } from "react";

type TeamRole = "manager" | "co-owner";
type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  enabled: boolean;
  lastSignInAt: string | null;
};

const labels: Record<TeamRole, string> = { manager: "Manager", "co-owner": "Co-owner" };
const teamPath = "/api/crm/team";
const signInPath = "/crm/login";

async function teamRequest<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    signal,
    headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) throw new Error("Your session ended. Sign in again to manage your team.");
    const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : null;
    throw new Error(message || "The team request could not be completed. Try again.");
  }
  return data as T;
}

function lastSignIn(value: string | null) {
  if (!value) return "Hasn’t signed in";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function MemberRoleForm({ member, busy, onChange }: { member: TeamMember; busy: boolean; onChange: (role: TeamRole) => void }) {
  const [role, setRole] = useState<TeamRole>(member.role);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (role === member.role) return;
    if (role === "co-owner" && !window.confirm(`Make ${member.name} a co-owner? They’ll be able to edit business settings and manage manager accounts.`)) return;
    onChange(role);
  }

  return <form className="flex items-center gap-2" onSubmit={submit}>
    <label className="crm-field">
      <select aria-label={`Role for ${member.name}`} value={role} onChange={(event) => setRole(event.target.value as TeamRole)} disabled={busy}>
        <option value="manager">Manager</option>
        <option value="co-owner">Co-owner</option>
      </select>
    </label>
    <button type="submit" className="crm-button is-small is-secondary" disabled={busy || role === member.role}>Save role</button>
  </form>;
}

export default function TeamSettingsPanel({ role }: { role: "primary" | "co-owner" }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const isPrimary = role === "primary";
  const busy = pending !== "";

  useEffect(() => {
    const controller = new AbortController();
    void teamRequest<{ members: TeamMember[] }>(teamPath, "GET", undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setMembers(result.members);
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "The team could not be loaded.");
      });
    return () => controller.abort();
  }, [loadAttempt]);

  async function act(key: string, work: () => Promise<void>) {
    setPending(key);
    setNotice("");
    setError("");
    try {
      await work();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The team request could not be completed.");
    } finally {
      setPending("");
    }
  }

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    return act("add", async () => {
      const { member } = await teamRequest<{ member: TeamMember }>(teamPath, "POST", {
        name: String(fields.get("name") ?? "").trim(),
        email: String(fields.get("email") ?? "").trim(),
        role: fields.get("role") ?? "manager",
      });
      setMembers((current) => [...(current ?? []), member]);
      form.reset();
      setNotice(`${member.name} can now sign in with ${member.email}. Send an invitation from their row or share the sign-in link.`);
    });
  }

  function updateMember(member: TeamMember, change: { role?: TeamRole; enabled?: boolean }) {
    if (change.enabled === false && !window.confirm(`Disable access for ${member.name}? They’ll be signed out and their sign-in links will stop working.`)) return;
    return act(`change-${member.id}`, async () => {
      const result = await teamRequest<{ member: TeamMember }>(`${teamPath}/${encodeURIComponent(member.id)}`, "PATCH", change);
      setMembers((current) => current?.map((entry) => entry.id === member.id ? result.member : entry) ?? []);
      if (change.role) {
        setNotice(`${member.name}’s role is now ${labels[result.member.role]}. They’ll need to sign in again.`);
      } else {
        setNotice(result.member.enabled ? `Access restored for ${member.name}.` : `Access disabled for ${member.name}.`);
      }
    });
  }

  function sendInvite(member: TeamMember) {
    return act(`invite-${member.id}`, async () => {
      const result = await teamRequest<{ sent: boolean }>(`${teamPath}/${encodeURIComponent(member.id)}/invite`, "POST");
      if (!result.sent) throw new Error("The invitation email could not be sent. You can share the sign-in link instead.");
      setNotice(`Invitation emailed to ${member.email}.`);
    });
  }

  function copySignIn() {
    return act("copy", async () => {
      try {
        await navigator.clipboard.writeText(new URL(signInPath, window.location.origin).href);
      } catch {
        throw new Error("Couldn’t copy the link. Open CRM sign-in and copy the address from your browser.");
      }
      setNotice("CRM sign-in link copied.");
    });
  }

  return <div className="crm-settings-form">
    <div className="crm-panel-heading">
      <div><h2>Team access</h2><p>Give each teammate their own CRM sign-in.</p></div>
    </div>

    {notice && <p className="crm-success m-5" role="status">{notice}</p>}
    {error && <p className="crm-error m-5" role="alert">{error}</p>}

    <form onSubmit={addMember}>
      <div className="crm-form-grid">
        <label className="crm-field"><span>Full name</span><input name="name" required maxLength={100} autoComplete="off" disabled={busy || !members} /></label>
        <label className="crm-field"><span>Work email</span><input name="email" type="email" required maxLength={254} autoComplete="off" disabled={busy || !members} /></label>
        {isPrimary && <label className="crm-field crm-field-wide"><span>Role</span><select name="role" defaultValue="manager" disabled={busy || !members}>
          <option value="manager">Manager</option>
          <option value="co-owner">Co-owner</option>
        </select></label>}
      </div>
      <p className="crm-settings-note">
        Managers can work with leads, customers, jobs, scheduling, and customer portals. {isPrimary ? "Co-owners can also edit business settings and manage managers. You control who becomes a co-owner." : "The main owner manages co-owner accounts."}
      </p>
      <div className="crm-settings-actions">
        <button type="submit" className="crm-button is-primary" disabled={busy || !members}>{pending === "add" ? "Adding…" : "Add team member"}</button>
      </div>
    </form>

    <div className="crm-panel-heading flex-wrap">
      <div><h3>Team members</h3><p>Teammates use their approved email to request a sign-in link.</p></div>
      <div className="flex flex-wrap gap-2">
        <a href={signInPath} target="_blank" rel="noreferrer" className="crm-button is-small is-secondary">Open CRM sign-in</a>
        <button type="button" className="crm-button is-small is-secondary" onClick={copySignIn} disabled={busy}>Copy sign-in link</button>
      </div>
    </div>

    {members ? members.length > 0 ? <div className="crm-table-wrap">
      <table className="crm-table">
        <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Access</th><th scope="col">Actions</th></tr></thead>
        <tbody>{members.map((member) => {
          const canManage = isPrimary || member.role === "manager";
          return <tr key={member.id}>
            <td><strong>{member.name}</strong><span className="crm-muted">{member.email}</span></td>
            <td>{isPrimary ? <MemberRoleForm key={`${member.id}-${member.role}`} member={member} busy={busy} onChange={(next) => updateMember(member, { role: next })} /> : labels[member.role]}</td>
            <td><strong>{member.enabled ? "Enabled" : "Disabled"}</strong><span className="crm-muted">{lastSignIn(member.lastSignInAt)}</span></td>
            <td>{canManage && <div className="flex items-center gap-2">
              {member.enabled && <button type="button" className="crm-button is-small is-secondary" aria-label={`Send invitation to ${member.name}`} onClick={() => sendInvite(member)} disabled={busy}>{pending === `invite-${member.id}` ? "Sending…" : "Send invitation"}</button>}
              <button type="button" className={`crm-button is-small ${member.enabled ? "is-danger" : "is-secondary"}`} aria-label={`${member.enabled ? "Disable" : "Restore"} access for ${member.name}`} onClick={() => updateMember(member, { enabled: !member.enabled })} disabled={busy}>{member.enabled ? "Disable access" : "Restore access"}</button>
            </div>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <p className="crm-settings-note mt-5">No additional team members yet.</p> : error ?
      <div className="crm-settings-actions"><button type="button" className="crm-button is-secondary" onClick={() => { setError(""); setLoadAttempt((current) => current + 1); }}>Retry loading team</button></div> :
      <p className="crm-settings-note mt-5" role="status">Loading team members…</p>}
  </div>;
}
