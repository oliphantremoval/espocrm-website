"use client";

import { useEffect, useState } from "react";

export type WebsiteLead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  description: string;
  status: string;
  createdAt: string;
};

type WebsiteLeadsPanelProps = {
  onCreateLocalLead: (lead: WebsiteLead) => void;
};

type InboxState = {
  error: string;
  leads: WebsiteLead[];
  loading: boolean;
  total: number;
};

const initialState: InboxState = { error: "", leads: [], loading: true, total: 0 };

function receivedAt(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Recently received";
}

function isLead(value: unknown): value is WebsiteLead {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const lead = value as Record<string, unknown>;
  return ["id", "name", "email", "phone", "company", "description", "status", "createdAt"].every((key) => typeof lead[key] === "string");
}

export default function WebsiteLeadsPanel({ onCreateLocalLead }: WebsiteLeadsPanelProps) {
  const [state, setState] = useState<InboxState>(initialState);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let current = true;
    async function load() {
      setState((previous) => ({ ...previous, loading: true, error: "" }));
      try {
        const result = await fetch("/api/crm/leads", { cache: "no-store", headers: { Accept: "application/json" } });
        const body: unknown = await result.json().catch(() => null);
        if (!result.ok || !body || typeof body !== "object") {
          throw new Error("Website leads could not be loaded right now.");
        }
        const payload = body as { list?: unknown; total?: unknown };
        const leads = Array.isArray(payload.list) ? payload.list.filter(isLead) : [];
        const total = typeof payload.total === "number" && Number.isFinite(payload.total) ? payload.total : leads.length;
        if (current) setState({ error: "", leads, loading: false, total });
      } catch (error) {
        if (current) setState({ error: error instanceof Error ? error.message : "Website leads could not be loaded right now.", leads: [], loading: false, total: 0 });
      }
    }
    void load();
    return () => { current = false; };
  }, [refreshCount]);

  return <section className="crm-panel crm-website-leads">
    <div className="crm-panel-heading">
      <div><h2>Website lead inbox {state.total > 0 && <span className="crm-count">{state.total}</span>}</h2><p>New quote requests sent through oliphantremoval.com.</p></div>
      <button type="button" className="crm-button is-secondary" onClick={() => setRefreshCount((count) => count + 1)} disabled={state.loading}>{state.loading ? "Refreshing…" : "Refresh"}</button>
    </div>
    {state.error && <div className="crm-error crm-website-leads-error" role="alert">{state.error}</div>}
    {!state.error && state.loading && <p className="crm-website-leads-message">Loading website leads…</p>}
    {!state.error && !state.loading && state.leads.length === 0 && <p className="crm-website-leads-message">No website quote requests have arrived yet.</p>}
    {!state.error && !state.loading && state.leads.length > 0 && <div className="crm-website-lead-list">
      {state.leads.map((lead) => <article className="crm-website-lead" key={lead.id}>
        <div className="crm-website-lead-heading"><div><strong>{lead.name}</strong><span>{lead.company || lead.status}</span></div><time dateTime={lead.createdAt}>{receivedAt(lead.createdAt)}</time></div>
        <div className="crm-website-lead-contact">{lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}{lead.phone && <a href={`tel:${lead.phone}`}>{lead.phone}</a>}</div>
        {lead.description && <p>{lead.description}</p>}
        <div className="crm-website-lead-actions"><span className="crm-badge stage-new-lead"><span />{lead.status}</span><button type="button" className="crm-button is-small is-secondary" onClick={() => onCreateLocalLead(lead)}>Create local lead</button></div>
      </article>)}
    </div>}
  </section>;
}

