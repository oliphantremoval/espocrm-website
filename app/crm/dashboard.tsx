"use client";

import Image from "next/image";
import Link from "next/link";
import { cloneElement, useEffect, useId, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from "react";
import { createEmptyState, initials, money, priorities, services, stages, validateImport, type CRMState, type Customer, type Job } from "./model";
import { useCrmStore } from "./use-crm-store";

type View = "Overview" | "Leads & jobs" | "Customers" | "Estimates" | "Schedule" | "Tasks";
type IconName = "grid" | "briefcase" | "users" | "quote" | "calendar" | "check" | "plus" | "search" | "arrow" | "download" | "upload" | "trash" | "close" | "leaf" | "clock" | "money" | "menu";
const nav: { name: View; icon: IconName }[] = [{ name: "Overview", icon: "grid" }, { name: "Leads & jobs", icon: "briefcase" }, { name: "Customers", icon: "users" }, { name: "Estimates", icon: "quote" }, { name: "Schedule", icon: "calendar" }, { name: "Tasks", icon: "check" }];
const iconPaths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a24 24 0 0 0 18 0M12 11v4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5" /></>,
  quote: <><path d="M6 3h12a2 2 0 0 1 2 2v16l-4-2-4 2-4-2-4 2V5a2 2 0 0 1 2-2Z" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" /></>,
  check: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m7 12 3 3 7-7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></>,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  leaf: <><path d="M20 3c-8 0-15 2-15 9a7 7 0 0 0 7 7c7 0 9-8 8-16ZM3 22 15 10" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  money: <><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 12h.01M18 12h.01" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
};
function Icon({ name }: { name: IconName }) { return <svg className="crm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function displayDate(value: string, options?: Intl.DateTimeFormatOptions) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", options ?? { month: "short", day: "numeric" }) : "Unscheduled"; }
function stageClass(stage: string) { return `stage-${stage.toLowerCase().replaceAll(" ", "-")}`; }
function Badge({ job }: { job: Job }) { return <span className={`crm-badge ${stageClass(job.stage)}`}><span />{job.stage}</span>; }
function Empty({ title, detail }: { title: string; detail: string }) { return <div className="crm-empty"><Icon name="leaf" /><h3>{title}</h3><p>{detail}</p></div>; }
function id() { return crypto.randomUUID(); }

export default function Dashboard() {
  const { state, save, error } = useCrmStore();
  const [view, setView] = useState<View>("Overview");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("All stages");
  const [jobModal, setJobModal] = useState<Job | "new" | null>(null);
  const [customerModal, setCustomerModal] = useState<Customer | "new" | null>(null);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(""), 5500); return () => clearTimeout(timeout); }, [toast]);

  if (!state) return <main className="crm-loading"><Icon name="leaf" /><h1>Opening your workspace…</h1>{error && <p role="alert">{error}</p>}</main>;
  const data = state;
  const active = data.jobs.filter(j => !["Completed", "Lost"].includes(j.stage));
  const pipeline = active.reduce((sum, j) => sum + j.amount, 0);
  const completed = data.jobs.filter(j => j.stage === "Completed");
  const todayJobs = data.jobs.filter(j => j.scheduledDate === today() && !["Completed", "Lost"].includes(j.stage)).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
  const query = search.toLowerCase().trim();
  const findCustomer = (job: Job) => data.customers.find(c => c.id === job.customerId)!;
  const matches = (job: Job) => { const c = findCustomer(job); return `${job.title} ${job.service} ${c.name} ${c.address} ${c.email} ${c.phone} ${job.crew}`.toLowerCase().includes(query); };
  const filteredJobs = data.jobs.filter(j => matches(j) && (stageFilter === "All stages" || j.stage === stageFilter));
  const filteredCustomers = data.customers.filter(c => `${c.name} ${c.email} ${c.phone} ${c.address}`.toLowerCase().includes(query));
  const estimateJobs = filteredJobs.filter(j => ["New lead", "Estimate sent"].includes(j.stage));

  function persist(next: CRMState, message: string) { try { save(next); setToast(message); return true; } catch (e) { setToast(e instanceof Error ? e.message : "Could not save your changes."); return false; } }
  function go(next: View) { setView(next); setStageFilter("All stages"); setSearch(""); setMobileNav(false); }
  function clearWorkspace() { if (confirm("Start with an empty workspace? All current records will be removed from this browser. Export a backup first if you need them.")) persist(createEmptyState(), "Your empty workspace is ready."); }
  function exportData() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `oliphant-workspace-${today()}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setToast("Backup exported. Store it somewhere safe; it contains your customer details.");
  }
  async function importData(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try { if (file.size > 5_000_000) throw new Error("Choose a backup smaller than 5 MB."); const next = validateImport(JSON.parse(await file.text())); if (confirm(`Replace this workspace with ${next.customers.length} customers and ${next.jobs.length} jobs from the backup?`)) persist(next, "Workspace restored from backup."); } catch (e) { setToast(e instanceof Error ? e.message : "This file is not a valid workspace backup."); }
  }
  function changeStage(job: Job, stage: Job["stage"]) { persist({ ...data, jobs: data.jobs.map(j => j.id === job.id ? { ...j, stage } : j) }, `${job.title} marked ${stage.toLowerCase()}.`); }

  function jobTable(jobs: Job[], compact = false) {
    if (!jobs.length) return <Empty title={query || stageFilter !== "All stages" ? "No matching jobs" : "Your next job starts here"} detail={query ? "Try another customer, service, or address." : "Add a lead or job to keep the work moving."} />;
    return <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Job / customer</th>{!compact && <th>Service</th>}<th>Status</th><th>Estimate</th><th>Scheduled</th><th><span className="crm-sr-only">Open job</span></th></tr></thead><tbody>{jobs.map(job => { const customer = findCustomer(job); return <tr key={job.id}><td><button className="crm-person crm-text-button" onClick={() => setJobModal(job)}><span className="crm-avatar">{initials(customer.name)}</span><span><strong>{job.title}</strong><span className="crm-muted">{customer.name}{job.priority === "Urgent" && <span className="crm-urgent"> · Urgent</span>}</span></span></button></td>{!compact && <td>{job.service}</td>}<td><Badge job={job} /></td><td className="crm-amount">{job.amount ? money(job.amount) : "To quote"}</td><td className="crm-muted">{displayDate(job.scheduledDate)}</td><td><button className="crm-icon-button" aria-label={`Edit ${job.title}`} onClick={() => setJobModal(job)}><Icon name="arrow" /></button></td></tr>; })}</tbody></table></div>;
  }
  function taskPanel(full = false) {
    const tasks = data.tasks.filter(t => !query || t.title.toLowerCase().includes(query));
    return <section className="crm-panel"><div className="crm-panel-heading"><div><h2>Follow-ups & tasks</h2><p>{data.tasks.filter(t => !t.done).length} things to keep moving</p></div>{!full && <button className="crm-text-button crm-green" onClick={() => go("Tasks")}>View all <Icon name="arrow" /></button>}</div><div className="crm-task-list">{tasks.length ? tasks.slice(0, full ? tasks.length : 4).map(task => <div className={`crm-task ${task.done ? "is-done" : ""}`} key={task.id}><label><input type="checkbox" checked={task.done} onChange={() => persist({ ...data, tasks: data.tasks.map(t => t.id === task.id ? { ...t, done: !t.done } : t) }, task.done ? "Task reopened." : "Task completed.")} /><span><strong>{task.title}</strong><span className="crm-muted">{task.dueDate ? displayDate(task.dueDate) : "No due date"}</span></span></label><button className="crm-icon-button" aria-label={`Delete task ${task.title}`} onClick={() => persist({ ...data, tasks: data.tasks.filter(t => t.id !== task.id) }, "Task deleted.")}><Icon name="close" /></button></div>) : <p className="crm-muted crm-padding">No tasks here. Add your next follow-up below.</p>}</div><form className="crm-task-add" onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const input = new FormData(form); const title = String(input.get("task") ?? "").trim(); if (!title) return; if (persist({ ...data, tasks: [...data.tasks, { id: id(), title, done: false, dueDate: String(input.get("dueDate") ?? "") }] }, "Task added.")) form.reset(); }}><input name="task" placeholder="Add a follow-up…" aria-label="Task title" required maxLength={200} /><input type="date" name="dueDate" aria-label="Task due date" /><button className="crm-icon-button" type="submit" aria-label="Add task"><Icon name="plus" /></button></form></section>;
  }
  function scheduleCard(job: Job) { const customer = findCustomer(job); return <article key={job.id} className="crm-schedule-item"><div className="crm-schedule-time">{job.scheduledTime || "TBD"}<span>{job.crew || "Unassigned"}</span></div><div className="crm-schedule-info"><button className="crm-text-button" onClick={() => setJobModal(job)}><strong>{job.title}</strong></button><p>{customer.name} · {customer.address || "Address needed"}</p><Badge job={job} /></div><div className="crm-schedule-actions">{job.stage === "Scheduled" && <button className="crm-button is-small is-secondary" onClick={() => changeStage(job, "In progress")}>Start job</button>}{job.stage === "In progress" && <button className="crm-button is-small is-primary" onClick={() => changeStage(job, "Completed")}>Complete</button>}<button className="crm-icon-button" aria-label={`Edit scheduled job ${job.title}`} onClick={() => setJobModal(job)}><Icon name="arrow" /></button></div></article>; }

  const headings: Record<View, [string, string]> = {
    Overview: ["A clear view of the work ahead.", "Your customers, your crew, and every job in between."],
    "Leads & jobs": ["Good work starts with a lead.", "Keep every request moving, from the first call to the final cleanup."],
    Customers: ["People behind every project.", "Contact details, property addresses, and the jobs you’ve done together."],
    Estimates: ["Turn the next quote into a job.", "Track new requests and estimates waiting for a decision."],
    Schedule: ["The right crew. The right place.", "See what’s booked and make a plan for the work still to schedule."],
    Tasks: ["Stay one step ahead.", "A little follow-through goes a long way. Keep your next actions here."],
  };

  return <div className="crm-shell">
    <aside className={`crm-sidebar ${mobileNav ? "is-open" : ""}`}>
      <Link href="/" className="crm-brand"><span className="crm-brand-mark"><Image src="/logo.png" alt="" width={42} height={42} /></span><span>OLIPHANT<span>REMOVAL</span></span></Link>
      <div className="crm-workspace-label">YOUR WORKSPACE</div>
      <nav aria-label="CRM navigation">{nav.map(item => <button key={item.name} className={`crm-nav-item ${view === item.name ? "is-active" : ""}`} aria-current={view === item.name ? "page" : undefined} onClick={() => go(item.name)}><Icon name={item.icon} /><span>{item.name}</span>{item.name === "Leads & jobs" && <span className="crm-nav-count">{active.length}</span>}{item.name === "Tasks" && data.tasks.some(t => !t.done) && <span className="crm-nav-dot" />}</button>)}</nav>
      <div className="crm-sidebar-bottom"><div className="crm-storage-note"><span className="crm-online-dot" /><strong>Saved in this browser</strong><p>Back up your workspace regularly. Data isn’t shared between devices.</p></div><button className="crm-nav-item" onClick={exportData}><Icon name="download" />Export backup</button><button className="crm-nav-item" onClick={() => fileRef.current?.click()}><Icon name="upload" />Import backup</button><button className="crm-nav-item" onClick={clearWorkspace}><Icon name="trash" />Clear workspace</button><input type="file" ref={fileRef} accept="application/json,.json" onChange={importData} hidden /><div className="crm-sidebar-footer"><span className="crm-avatar">OR</span><span><strong>Oliphant Removal</strong><small>Local workspace · v1.0</small></span></div></div>
    </aside>
    <div className="crm-main">
      <header className="crm-topbar"><button className="crm-icon-button crm-mobile-menu" aria-label="Toggle navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(!mobileNav)}><Icon name={mobileNav ? "close" : "menu"} /></button><div className="crm-breadcrumb">Workspace <span>/</span> <strong>{view}</strong></div><div className="crm-topbar-actions"><label className="crm-search"><Icon name="search" /><input value={search} onChange={event => { setSearch(event.target.value); if (view === "Overview") setView("Leads & jobs"); }} placeholder="Search your workspace…" aria-label="Search workspace" /></label><button className="crm-button is-primary" onClick={() => setJobModal("new")}><Icon name="plus" /><span>New job</span></button><span className="crm-avatar crm-profile-avatar" aria-hidden="true">OR</span></div></header>
      <main className="crm-content">
        {error && <div className="crm-error" role="alert">{error}</div>}
        {data.demo && <div className="crm-demo-banner"><span><strong>Sample workspace</strong> Explore with fictional customers and jobs. Your changes stay in this browser.</span><button className="crm-text-button" onClick={clearWorkspace}>Start empty <Icon name="arrow" /></button></div>}
        <div className="crm-page-heading"><div><p className="crm-eyebrow">{view === "Overview" ? "LET’S GET TO WORK" : "OLIPHANT REMOVAL"}</p><h1>{headings[view][0]}</h1><p>{headings[view][1]}</p></div><div className="crm-date"><Icon name="calendar" />{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}</div></div>
        {view === "Overview" && <>
          <div className="crm-stat-grid">{[{ label: "Active jobs", value: String(active.length).padStart(2, "0"), sub: `${data.jobs.filter(j => j.stage === "New lead").length} new leads to follow up`, icon: "briefcase" as const }, { label: "Pipeline value", value: money(pipeline), sub: "Estimates across active jobs", icon: "quote" as const }, { label: "On the schedule today", value: String(todayJobs.length).padStart(2, "0"), sub: "Booked and in-progress work", icon: "calendar" as const }, { label: "Completed job value", value: money(completed.reduce((sum, j) => sum + j.amount, 0)), sub: `${completed.length} completed ${completed.length === 1 ? "job" : "jobs"} · before expenses`, icon: "money" as const }].map((stat, i) => <article className={`crm-stat-card crm-stat-${i}`} key={stat.label}><div><p>{stat.label}</p><span className="crm-stat-icon"><Icon name={stat.icon} /></span></div><strong>{stat.value}</strong><small>{stat.sub}</small></article>)}</div>
          <div className="crm-overview-grid"><section className="crm-panel crm-active-panel"><div className="crm-panel-heading"><div><h2>Work in motion <span className="crm-count">{active.length}</span></h2><p>A little progress on every project.</p></div><button className="crm-text-button crm-green" onClick={() => go("Leads & jobs")}>View all jobs <Icon name="arrow" /></button></div>{jobTable(active.slice(0, 5), true)}</section><section className="crm-panel crm-today-panel"><div className="crm-panel-heading"><div><h2>Today’s schedule</h2><p>{displayDate(today(), { weekday: "long", month: "long", day: "numeric" })}</p></div><span className="crm-count">{todayJobs.length}</span></div><div className="crm-schedule-list">{todayJobs.length ? todayJobs.map(scheduleCard) : <Empty title="A little room in the day" detail="Scheduled jobs for today will appear here." />}</div><button className="crm-panel-link" onClick={() => go("Schedule")}>Open full schedule <Icon name="arrow" /></button></section>{taskPanel()}<section className="crm-panel"><div className="crm-panel-heading"><div><h2>Your service mix</h2><p>Where the work is coming from</p></div><Icon name="leaf" /></div><div className="crm-service-list">{services.map((service, index) => { const count = data.jobs.filter(j => j.service === service).length; return <div className="crm-service-row" key={service}><div><span><span className={`crm-service-dot crm-service-${index}`} />{service}</span><strong>{count}</strong></div><div className="crm-progress"><span style={{ width: `${data.jobs.length ? count / data.jobs.length * 100 : 0}%` }} /></div></div>; })}</div><div className="crm-service-total"><span>Total jobs in workspace</span><strong>{data.jobs.length}</strong></div></section></div>
        </>}
        {(view === "Leads & jobs" || view === "Estimates") && <section className="crm-panel"><div className="crm-toolbar"><div><h2>{view === "Estimates" ? "Requests & estimates" : "All leads & jobs"} <span className="crm-count">{view === "Estimates" ? estimateJobs.length : filteredJobs.length}</span></h2><p className="crm-muted">Select a job to view details and update its progress.</p></div><label className="crm-filter"><span className="crm-sr-only">Filter by stage</span><select value={stageFilter} onChange={event => setStageFilter(event.target.value)}><option>All stages</option>{(view === "Estimates" ? stages.filter(s => ["New lead", "Estimate sent"].includes(s)) : stages).map(stage => <option key={stage}>{stage}</option>)}</select></label></div>{jobTable(view === "Estimates" ? estimateJobs : filteredJobs)}</section>}
        {view === "Customers" && <section className="crm-panel"><div className="crm-toolbar"><div><h2>Your customers <span className="crm-count">{filteredCustomers.length}</span></h2><p className="crm-muted">One place for the details that matter.</p></div><button className="crm-button is-secondary" onClick={() => setCustomerModal("new")}><Icon name="plus" />Add customer</button></div>{filteredCustomers.length ? <div className="crm-table-wrap"><table className="crm-table"><thead><tr><th>Customer</th><th>Contact</th><th>Property address</th><th>Jobs</th><th><span className="crm-sr-only">Edit customer</span></th></tr></thead><tbody>{filteredCustomers.map(customer => <tr key={customer.id}><td><button className="crm-person crm-text-button" onClick={() => setCustomerModal(customer)}><span className="crm-avatar">{initials(customer.name)}</span><strong>{customer.name}</strong></button></td><td><div>{customer.email ? <a href={`mailto:${customer.email}`}>{customer.email}</a> : "No email"}</div><div className="crm-muted">{customer.phone ? <a href={`tel:${customer.phone}`}>{customer.phone}</a> : "No phone"}</div></td><td className="crm-muted">{customer.address || "Not provided"}</td><td>{data.jobs.filter(j => j.customerId === customer.id).length}</td><td><button className="crm-icon-button" aria-label={`Edit customer ${customer.name}`} onClick={() => setCustomerModal(customer)}><Icon name="arrow" /></button></td></tr>)}</tbody></table></div> : <Empty title="Make your first connection" detail="Add a customer to keep their contact and property details close." />}</section>}
        {view === "Schedule" && <div className="crm-schedule-page">{(() => { const jobs = filteredJobs.filter(j => !["Completed", "Lost"].includes(j.stage)); const dates = [...new Set(jobs.map(j => j.scheduledDate))].sort((a, b) => (a || "9999").localeCompare(b || "9999")); return dates.length ? dates.map(date => <section className="crm-panel" key={date || "unscheduled"}><div className="crm-panel-heading"><div><h2>{date ? displayDate(date, { weekday: "long", month: "long", day: "numeric" }) : "Ready to schedule"}{date === today() && <span className="crm-count">Today</span>}</h2><p>{date ? date < today() ? "Past schedule · review these jobs" : "Your plan for the day" : "Add a date to book these jobs"}</p></div><Icon name="calendar" /></div><div className="crm-schedule-list">{jobs.filter(j => j.scheduledDate === date).sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime)).map(scheduleCard)}</div></section>) : <section className="crm-panel"><Empty title="Your schedule is clear" detail="New and scheduled jobs will appear here." /></section>; })()}</div>}
        {view === "Tasks" && taskPanel(true)}
        <footer className="crm-content-footer"><span><Icon name="leaf" />Built around the way you work.</span><span>Oliphant Removal · Local workspace</span></footer>
      </main>
    </div>
    <div className="crm-toast" role="status" aria-live="polite">{toast}</div>
    {jobModal && <JobDialog key={jobModal === "new" ? "new-job" : jobModal.id} job={jobModal === "new" ? null : jobModal} data={data} onClose={() => setJobModal(null)} onSave={(job, customer) => { const next = { ...data, customers: customer ? [...data.customers, customer] : data.customers, jobs: data.jobs.some(j => j.id === job.id) ? data.jobs.map(j => j.id === job.id ? job : j) : [job, ...data.jobs] }; if (persist(next, jobModal === "new" ? "New job added. Let’s get to work." : "Job updated.")) setJobModal(null); }} onDelete={job => { if (confirm(`Delete “${job.title}”? The customer record will stay in your workspace.`) && persist({ ...data, jobs: data.jobs.filter(j => j.id !== job.id) }, "Job deleted.")) setJobModal(null); }} />}
    {customerModal && <CustomerDialog key={customerModal === "new" ? "new-customer" : customerModal.id} customer={customerModal === "new" ? null : customerModal} linked={customerModal === "new" ? 0 : data.jobs.filter(j => j.customerId === customerModal.id).length} onClose={() => setCustomerModal(null)} onSave={customer => { if (persist({ ...data, customers: data.customers.some(c => c.id === customer.id) ? data.customers.map(c => c.id === customer.id ? customer : c) : [...data.customers, customer] }, "Customer saved.")) setCustomerModal(null); }} onDelete={customer => { if (confirm(`Delete customer ${customer.name}?`) && persist({ ...data, customers: data.customers.filter(c => c.id !== customer.id) }, "Customer deleted.")) setCustomerModal(null); }} />}
  </div>;
}

function Dialog({ title, subtitle, children, onClose }: { title: string; subtitle: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    const focusable = () => [...(element?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])];
    focusable()[0]?.focus();
    function key(event: KeyboardEvent) { if (event.key === "Escape") onClose(); if (event.key === "Tab") { const all = focusable(); const first = all[0]; const last = all[all.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }
    document.addEventListener("keydown", key); const oldOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, [onClose]);
  return <div className="crm-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><div className="crm-modal" ref={ref} role="dialog" aria-modal="true" aria-labelledby="crm-dialog-title"><div className="crm-modal-header"><div><p className="crm-eyebrow">OLIPHANT REMOVAL</p><h2 id="crm-dialog-title">{title}</h2><p>{subtitle}</p></div><button className="crm-icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>{children}</div></div>;
}
function Field({ label, children, wide = false }: { label: string; children: ReactElement<{ id?: string }>; wide?: boolean }) {
  const fieldId = useId();
  return <div className={`crm-field ${wide ? "is-wide" : ""}`}><label htmlFor={fieldId}>{label}</label>{cloneElement(children, { id: fieldId })}</div>;
}

function JobDialog({ job, data, onClose, onSave, onDelete }: { job: Job | null; data: CRMState; onClose: () => void; onSave: (job: Job, customer?: Customer) => void; onDelete: (job: Job) => void }) {
  const [customerId, setCustomerId] = useState(job?.customerId ?? (data.customers.length ? data.customers[0].id : "new"));
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const text = (name: string) => String(form.get(name) ?? "").trim();
    const stage = text("stage") as Job["stage"]; const amount = Number(text("amount"));
    if (!text("title")) { setError("Add a short job title."); return; }
    if (!Number.isFinite(amount) || amount < 0) { setError("Enter a valid estimate of zero or more."); return; }
    if (["Scheduled", "In progress"].includes(stage) && !text("scheduledDate")) { setError("Choose a date for a scheduled or in-progress job."); return; }
    let customer: Customer | undefined;
    if (customerId === "new") { if (!text("name")) { setError("Enter the new customer’s name."); return; } customer = { id: id(), name: text("name"), email: text("email"), phone: text("phone"), address: text("address"), notes: "" }; }
    if (!customer && !data.customers.some(c => c.id === customerId)) { setError("Choose a customer for this job."); return; }
    onSave({ id: job?.id ?? id(), customerId: customer?.id ?? customerId, title: text("title"), service: text("service") as Job["service"], stage, priority: text("priority") as Job["priority"], amount: Math.round(amount * 100) / 100, scheduledDate: text("scheduledDate"), scheduledTime: text("scheduledTime"), crew: text("crew"), notes: text("notes"), createdAt: job?.createdAt ?? new Date().toISOString() }, customer);
  }
  return <Dialog title={job ? "Job details" : "Let’s add a new job"} subtitle="From the first call to a job well done." onClose={onClose}><form onSubmit={submit}><div className="crm-form-grid"><Field label="Job title *" wide><input name="title" defaultValue={job?.title ?? ""} required maxLength={200} placeholder="e.g. Backyard maple removal" /></Field><Field label="Customer *" wide><select name="customerId" value={customerId} onChange={e => setCustomerId(e.target.value)}>{data.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="new">+ Add a new customer</option></select></Field>{customerId === "new" && <><Field label="Customer name *"><input name="name" required maxLength={200} placeholder="Full name" /></Field><Field label="Phone"><input type="tel" name="phone" maxLength={80} placeholder="(810) 555-0123" /></Field><Field label="Email"><input type="email" name="email" maxLength={254} placeholder="customer@example.com" /></Field><Field label="Property address"><input name="address" maxLength={500} placeholder="Street, city, ZIP" /></Field></>}<Field label="Service"><select name="service" defaultValue={job?.service ?? services[0]}>{services.map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Stage"><select name="stage" defaultValue={job?.stage ?? stages[0]}>{stages.map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Estimate ($)"><input type="number" name="amount" defaultValue={job?.amount || ""} min="0" max="100000000" step="0.01" placeholder="0.00" /></Field><Field label="Priority"><select name="priority" defaultValue={job?.priority ?? priorities[0]}>{priorities.map(p => <option key={p}>{p}</option>)}</select></Field><Field label="Scheduled date"><input type="date" name="scheduledDate" defaultValue={job?.scheduledDate ?? ""} /></Field><Field label="Arrival time"><input type="time" name="scheduledTime" defaultValue={job?.scheduledTime ?? ""} /></Field><Field label="Crew / assigned to" wide><input name="crew" defaultValue={job?.crew ?? ""} maxLength={200} placeholder="e.g. Crew A · Mike & Tyler" /></Field><Field label="Job notes" wide><textarea name="notes" defaultValue={job?.notes ?? ""} rows={3} maxLength={5000} placeholder="Access instructions, equipment, scope of work…" /></Field>{error && <p className="crm-error is-wide" role="alert">{error}</p>}</div><div className="crm-modal-footer">{job && <button type="button" className="crm-button is-danger" onClick={() => onDelete(job)}><Icon name="trash" />Delete job</button>}<div className="crm-modal-footer-actions"><button type="button" className="crm-button is-secondary" onClick={onClose}>Cancel</button><button className="crm-button is-primary" type="submit">{job ? "Save changes" : "Create job"}<Icon name="arrow" /></button></div></div></form></Dialog>;
}
function CustomerDialog({ customer, linked, onClose, onSave, onDelete }: { customer: Customer | null; linked: number; onClose: () => void; onSave: (customer: Customer) => void; onDelete: (customer: Customer) => void }) {
  const [error, setError] = useState("");
  return <Dialog title={customer ? "Customer details" : "Add a customer"} subtitle={linked ? `${linked} linked ${linked === 1 ? "job" : "jobs"} in your workspace.` : "Keep the people and property details together."} onClose={onClose}><form onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const text = (name: string) => String(form.get(name) ?? "").trim(); if (!text("name")) { setError("Enter the customer’s name."); return; } onSave({ id: customer?.id ?? id(), name: text("name"), email: text("email"), phone: text("phone"), address: text("address"), notes: text("notes") }); }}><div className="crm-form-grid"><Field label="Full name *" wide><input name="name" defaultValue={customer?.name ?? ""} required maxLength={200} /></Field><Field label="Email"><input name="email" type="email" defaultValue={customer?.email ?? ""} maxLength={254} /></Field><Field label="Phone"><input name="phone" type="tel" defaultValue={customer?.phone ?? ""} maxLength={80} /></Field><Field label="Property address" wide><input name="address" defaultValue={customer?.address ?? ""} maxLength={500} /></Field><Field label="Customer notes" wide><textarea name="notes" defaultValue={customer?.notes ?? ""} rows={4} maxLength={5000} /></Field>{error && <p className="crm-error is-wide" role="alert">{error}</p>}{customer && linked > 0 && <p className="crm-muted is-wide">To delete this customer, first remove their linked jobs.</p>}</div><div className="crm-modal-footer">{customer && <button className="crm-button is-danger" type="button" disabled={linked > 0} onClick={() => onDelete(customer)}><Icon name="trash" />Delete customer</button>}<div className="crm-modal-footer-actions"><button className="crm-button is-secondary" type="button" onClick={onClose}>Cancel</button><button className="crm-button is-primary" type="submit">Save customer<Icon name="arrow" /></button></div></div></form></Dialog>;
}
