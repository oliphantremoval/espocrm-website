"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Customer, Job } from "./model";

type PortalCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  enabled: boolean;
};

type PortalJob = {
  id: string;
  title: string;
  service: string;
  status: string;
  scheduledDate: string;
  scheduledTime: string;
  description: string;
};

const statuses = ["New lead", "Estimate sent", "Scheduled", "In progress", "Completed", "Lost"];

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: { Accept: "application/json", ...(options?.body ? { "Content-Type": "application/json" } : {}), ...options?.headers },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error : "The request could not be completed. Please try again.";
    throw new Error(message);
  }
  return payload as T;
}

function field(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

/** Owner-only portal management, backed by the protected portal API. */
export default function PortalManagement({ localCustomers, localJobs }: { localCustomers: Customer[]; localJobs: Job[] }) {
  const [customers, setCustomers] = useState<PortalCustomer[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [jobs, setJobs] = useState<PortalJob[]>([]);
  const [editingJob, setEditingJob] = useState<PortalJob | null>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerSource, setCustomerSource] = useState("");
  const [jobSource, setJobSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const payload = await request<{ customers: PortalCustomer[] }>("/api/crm/portal/customers", { signal: controller.signal });
        if (!Array.isArray(payload.customers)) throw new Error("Customer portals could not be loaded.");
        setCustomers(payload.customers);
        setError("");
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Customer portals could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    async function load() {
      setLoadingJobs(true);
      setJobs([]);
      try {
        const payload = await request<{ jobs: PortalJob[] }>(`/api/crm/portal/customers/${encodeURIComponent(selectedId)}/jobs`, { signal: controller.signal });
        if (!Array.isArray(payload.jobs)) throw new Error("Shared jobs could not be loaded.");
        setJobs(payload.jobs);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Shared jobs could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoadingJobs(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [selectedId]);

  const selected = customers.find((customer) => customer.id === selectedId);
  const sourceCustomer = localCustomers.find((customer) => customer.id === customerSource);
  const matchingCustomers = selected ? localCustomers.filter((customer) => customer.email.trim().toLowerCase() === selected.email.trim().toLowerCase() && Boolean(customer.email.trim())) : [];
  const matchingJobs = matchingCustomers.length === 1 ? localJobs.filter((job) => job.customerId === matchingCustomers[0].id) : [];
  const sourceJob = matchingJobs.find((job) => job.id === jobSource);

  async function addCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const { customer } = await request<{ customer: PortalCustomer }>("/api/crm/portal/customers", {
        method: "POST",
        body: JSON.stringify({ name: field(form, "name"), email: field(form, "email"), phone: field(form, "phone"), address: field(form, "address") }),
      });
      setCustomers((current) => [...current, customer]);
      setSelectedId(customer.id);
      setCustomerSource("");
      setJobSource("");
      element.reset();
      setMessage("Customer added. Portal access is off until you enable it.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Customer could not be added.");
    } finally {
      setWorking(false);
    }
  }

  async function setAccess(customer: PortalCustomer) {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const payload = await request<{ customer: PortalCustomer }>(`/api/crm/portal/customers/${encodeURIComponent(customer.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !customer.enabled }),
      });
      setCustomers((current) => current.map((item) => item.id === customer.id ? payload.customer : item));
      setMessage(payload.customer.enabled ? "Portal access enabled for this customer." : "Portal access disabled for this customer.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Portal access could not be changed.");
    } finally {
      setWorking(false);
    }
  }

  async function saveCustomerProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const emailChanged = field(form, "email").toLowerCase() !== selected.email.toLowerCase();
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const payload = await request<{ customer: PortalCustomer }>(`/api/crm/portal/customers/${encodeURIComponent(selected.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ profile: { name: field(form, "name"), email: field(form, "email"), phone: field(form, "phone"), address: field(form, "address") } }),
      });
      setCustomers((current) => current.map((customer) => customer.id === selected.id ? payload.customer : customer));
      setEditingCustomer(false);
      setMessage(emailChanged ? "Customer details saved. Access is off until you enable the new email address." : "Customer details saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Customer details could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  async function saveJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const endpoint = `/api/crm/portal/customers/${encodeURIComponent(selected.id)}/jobs`;
      const payload = await request<{ job: PortalJob }>(editingJob ? `${endpoint}/${encodeURIComponent(editingJob.id)}` : endpoint, {
        method: editingJob ? "PATCH" : "POST",
        body: JSON.stringify({
          title: field(form, "title"), service: field(form, "service"), status: field(form, "status"),
          scheduledDate: field(form, "scheduledDate"), scheduledTime: field(form, "scheduledTime"), description: field(form, "description"),
        }),
      });
      setJobs((current) => editingJob ? current.map((job) => job.id === editingJob.id ? payload.job : job) : [payload.job, ...current]);
      element.reset();
      setEditingJob(null);
      setJobSource("");
      setMessage(editingJob ? "Shared job updated." : `Job shared with ${selected.name}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Job could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  async function unpublishJob(job: PortalJob) {
    if (!selected || !window.confirm(`Remove “${job.title}” from ${selected.name}’s portal? The customer will no longer see it.`)) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await request(`/api/crm/portal/customers/${encodeURIComponent(selected.id)}/jobs/${encodeURIComponent(job.id)}`, { method: "DELETE" });
      setJobs((current) => current.filter((item) => item.id !== job.id));
      if (editingJob?.id === job.id) setEditingJob(null);
      setMessage("Job removed from the customer portal.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Job could not be removed from the portal.");
    } finally {
      setWorking(false);
    }
  }

  return <div className="crm-schedule-page">
    <section className="crm-panel">
      <div className="crm-panel-heading"><div><h2>Customer portals</h2><p>Control access and choose the information each customer can see.</p></div><a className="crm-button is-secondary" href="/portal/login" target="_blank" rel="noreferrer">Customer sign-in</a><button className="crm-button is-secondary" type="button" onClick={() => setRefresh((count) => count + 1)} disabled={loading || working}>Refresh</button></div>
      <p className="crm-settings-note" style={{ marginTop: 20 }}>Copy customer and job details from the CRM below. Update the portal here when CRM details change. Private CRM notes stay in the CRM.</p>
      {error && <p className="crm-error" role="alert" style={{ margin: "0 22px 18px" }}>{error}</p>}
      {message && <p className="crm-success" role="status" style={{ marginBottom: 18 }}>{message}</p>}
      {loading ? <p className="crm-muted" style={{ padding: "0 22px 20px" }}>Loading customer portals…</p> : customers.length === 0 ? <p className="crm-muted" style={{ padding: "0 22px 20px" }}>No portal customers yet. Add one below.</p> : <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Customer</th><th>Email</th><th>Access</th><th>Manage</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong></td><td>{customer.email}</td><td>{customer.enabled ? "Enabled" : "Disabled"}</td><td><button type="button" className="crm-button is-small is-secondary" disabled={working} onClick={() => { setSelectedId(customer.id); setEditingJob(null); setEditingCustomer(false); setJobSource(""); setError(""); setMessage(""); }} aria-label={`Manage portal for ${customer.name}`}>Manage</button></td></tr>)}</tbody></table></div>}
    </section>

    <section className="crm-panel"><div className="crm-panel-heading"><div><h2>Add a portal customer</h2><p>Use the customer’s own email address. Access starts disabled.</p></div></div>
      <form key={customerSource || "new-customer"} onSubmit={addCustomer}><div className="crm-form-grid">
        {localCustomers.length > 0 && <label className="crm-field crm-field-wide"><span>Copy details from a CRM customer</span><select value={customerSource} onChange={(event) => setCustomerSource(event.target.value)}><option value="">Enter a new customer</option>{localCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.email ? ` — ${customer.email}` : ""}</option>)}</select></label>}
        <label className="crm-field"><span>Name *</span><input name="name" required maxLength={200} defaultValue={sourceCustomer?.name ?? ""} /></label>
        <label className="crm-field"><span>Email *</span><input name="email" type="email" required maxLength={254} defaultValue={sourceCustomer?.email ?? ""} /></label>
        <label className="crm-field"><span>Phone</span><input name="phone" type="tel" maxLength={80} defaultValue={sourceCustomer?.phone ?? ""} /></label>
        <label className="crm-field"><span>Address</span><input name="address" maxLength={500} defaultValue={sourceCustomer?.address ?? ""} /></label>
      </div><div className="crm-settings-actions"><button type="submit" className="crm-button is-primary" disabled={working}>Add customer</button></div></form>
    </section>

    {selected && <section className="crm-panel"><div className="crm-panel-heading"><div><h2>{selected.name}’s portal</h2><p>{selected.email} · Access {selected.enabled ? "enabled" : "disabled"}</p></div><button type="button" className={`crm-button ${selected.enabled ? "is-danger" : "is-primary"}`} onClick={() => setAccess(selected)} disabled={working}>{selected.enabled ? "Disable access" : "Enable access"}</button></div>
      <p className="crm-settings-note" style={{ marginTop: 18 }}>When access is enabled, share <a className="crm-green" href="/portal/login" target="_blank" rel="noreferrer">oliphantremoval.com/portal/login</a> with the customer. They enter the email shown above to receive a sign-in link.</p>
      <div className="crm-toolbar"><div><h3>Customer details</h3><p className="crm-muted">The customer sees these details in their portal.</p></div>{!editingCustomer && <button type="button" className="crm-button is-secondary" disabled={working} onClick={() => setEditingCustomer(true)}>Edit details</button>}</div>
      {editingCustomer && <form key={selected.id} onSubmit={saveCustomerProfile}><div className="crm-form-grid">
        <label className="crm-field"><span>Name *</span><input name="name" required maxLength={200} defaultValue={selected.name} /></label>
        <label className="crm-field"><span>Sign-in email *</span><input name="email" type="email" required maxLength={254} defaultValue={selected.email} /></label>
        <label className="crm-field"><span>Phone</span><input name="phone" type="tel" maxLength={80} defaultValue={selected.phone} /></label>
        <label className="crm-field"><span>Address</span><input name="address" maxLength={500} defaultValue={selected.address} /></label>
      </div><p className="crm-settings-note">Changing the email signs the customer out and turns access off until you enable it again.</p><div className="crm-settings-actions"><button type="button" className="crm-button is-secondary" disabled={working} onClick={() => setEditingCustomer(false)}>Cancel</button><button type="submit" className="crm-button is-primary" disabled={working}>Save details</button></div></form>}
      <div className="crm-toolbar"><div><h3>Shared jobs</h3><p className="crm-muted">These are the jobs this customer can see when access is enabled.</p></div></div>
      {loadingJobs ? <p className="crm-muted" style={{ padding: "0 22px 20px" }}>Loading shared jobs…</p> : jobs.length === 0 ? <p className="crm-muted" style={{ padding: "0 22px 20px" }}>No jobs have been shared with this customer.</p> : <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Job</th><th>Service</th><th>Status</th><th>Scheduled</th><th>Shared details</th><th>Actions</th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td><strong>{job.title}</strong></td><td>{job.service}</td><td>{job.status}</td><td>{[job.scheduledDate, job.scheduledTime].filter(Boolean).join(" ") || "Not scheduled"}</td><td style={{ whiteSpace: "normal", minWidth: 180 }}>{job.description || "—"}</td><td><button type="button" className="crm-button is-small is-secondary" disabled={working} onClick={() => setEditingJob(job)} aria-label={`Edit shared job ${job.title}`}>Edit</button>{" "}<button type="button" className="crm-button is-small is-danger" disabled={working} onClick={() => unpublishJob(job)} aria-label={`Unpublish ${job.title}`}>Unpublish</button></td></tr>)}</tbody></table></div>}
      <div className="crm-toolbar"><div><h3>{editingJob ? "Edit shared job" : "Share a job"}</h3><p className="crm-muted">Everything below is visible to this customer. Do not include private notes.</p></div></div>
      <form key={`${selected.id}-${editingJob?.id ?? `new-${jobSource}`}`} onSubmit={saveJob}><div className="crm-form-grid">
        {!editingJob && matchingJobs.length > 0 && <label className="crm-field crm-field-wide"><span>Copy details from a CRM job</span><select value={jobSource} onChange={(event) => setJobSource(event.target.value)}><option value="">Enter a new job</option>{matchingJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>}
        <label className="crm-field"><span>Job title *</span><input name="title" required maxLength={200} defaultValue={editingJob?.title ?? sourceJob?.title ?? ""} /></label>
        <label className="crm-field"><span>Service *</span><input name="service" required maxLength={80} placeholder="Tree removal" defaultValue={editingJob?.service ?? sourceJob?.service ?? ""} /></label>
        <label className="crm-field"><span>Status</span><select name="status" defaultValue={editingJob?.status ?? sourceJob?.stage ?? "New lead"}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="crm-field"><span>Scheduled date</span><input name="scheduledDate" type="date" defaultValue={editingJob?.scheduledDate ?? sourceJob?.scheduledDate ?? ""} /></label>
        <label className="crm-field"><span>Arrival time</span><input name="scheduledTime" type="time" defaultValue={editingJob?.scheduledTime ?? sourceJob?.scheduledTime ?? ""} /></label>
        <label className="crm-field crm-field-wide"><span>Customer-facing details</span><textarea name="description" rows={3} maxLength={2000} placeholder="Details you want this customer to see" defaultValue={editingJob?.description ?? ""} /></label>
      </div><div className="crm-settings-actions">{editingJob && <button type="button" className="crm-button is-secondary" disabled={working} onClick={() => setEditingJob(null)}>Cancel edit</button>}<button type="submit" className="crm-button is-primary" disabled={working || loadingJobs}>{editingJob ? "Save changes" : "Share job"}</button></div></form>
    </section>}
  </div>;
}
