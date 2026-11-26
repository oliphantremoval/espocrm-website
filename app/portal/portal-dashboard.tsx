"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PortalJob = {
  id: string;
  title: string;
  service: string;
  status: string;
  scheduledDate: string;
  scheduledTime: string;
  description: string;
};

type PortalData = {
  customer: { name: string; email: string; phone: string; address: string };
  jobs: PortalJob[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isPortalData(value: unknown): value is PortalData {
  if (!isRecord(value) || !isRecord(value.customer) || !Array.isArray(value.jobs)) return false;
  if (!["name", "email", "phone", "address"].every((key) => typeof (value.customer as Record<string, unknown>)[key] === "string")) return false;
  return value.jobs.every((job) => isRecord(job) && ["id", "title", "service", "status", "scheduledDate", "scheduledTime", "description"].every((key) => typeof job[key] === "string"));
}

function displayDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Date to be arranged";
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" }) : "Date to be arranged";
}

export default function PortalDashboard() {
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/portal/me", { cache: "no-store", headers: { Accept: "application/json" } });
        if (response.status === 401) {
          window.location.replace("/portal/login");
          return;
        }
        const result: unknown = await response.json().catch(() => null);
        if (!response.ok || !isPortalData(result)) throw new Error("We couldn’t load your portal right now. Please try again.");
        if (active) setData(result);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "We couldn’t load your portal right now.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [retry]);

  return <div className="portal-shell">
    <header className="portal-header"><div className="portal-header-inner">
      <Link className="portal-brand" href="/"><span className="portal-brand-mark">OR</span><span><strong>Oliphant Removal</strong><small>Customer portal</small></span></Link>
      <form action="/api/portal/auth/logout" method="post"><button type="submit" className="portal-button is-quiet">Sign out</button></form>
    </div></header>
    <main className="portal-content">
      {loading && <div className="portal-state" role="status">Opening your portal…</div>}
      {!loading && error && <div className="portal-state" role="alert"><h1>We couldn’t open your portal.</h1><p>{error}</p><button className="portal-button is-primary" type="button" onClick={() => setRetry((count) => count + 1)}>Try again</button></div>}
      {!loading && !error && data && <>
        <div className="portal-welcome"><div><p className="portal-eyebrow">YOUR CUSTOMER PORTAL</p><h1>Welcome, {data.customer.name.split(/\s+/)[0] || "there"}.</h1><p>Your project details are ready whenever you need them.</p></div><a href="tel:8105425833" className="portal-button is-secondary">Call us <span aria-hidden="true">↗</span></a></div>
        <div className="portal-grid"><section className="portal-card portal-projects" aria-labelledby="projects-title">
          <div className="portal-card-heading"><div><p className="portal-eyebrow">YOUR WORK</p><h2 id="projects-title">Projects &amp; services</h2><p>Updates shared by the Oliphant Removal team.</p></div><span className="portal-count">{data.jobs.length}</span></div>
          {data.jobs.length ? <div className="portal-job-list">{data.jobs.map((job) => <article className="portal-job" key={job.id}>
            <div className="portal-job-heading"><div><span className="portal-service">{job.service || "Service request"}</span><h3>{job.title}</h3></div><span className="portal-status">{job.status || "In review"}</span></div>
            <div className="portal-job-date"><span aria-hidden="true">◷</span><span>{displayDate(job.scheduledDate)}{job.scheduledTime ? ` · ${job.scheduledTime}` : ""}</span></div>
            {job.description && <p className="portal-description">{job.description}</p>}
          </article>)}</div> : <div className="portal-empty"><span aria-hidden="true">✦</span><h3>No project updates yet</h3><p>When the team shares a project with you, it will appear here.</p></div>}
        </section>
        <aside className="portal-side"><section className="portal-card"><div className="portal-card-heading"><div><p className="portal-eyebrow">YOUR DETAILS</p><h2>Account information</h2></div></div><dl className="portal-account">
          <div><dt>Name</dt><dd>{data.customer.name}</dd></div>
          <div><dt>Email</dt><dd>{data.customer.email}</dd></div>
          {data.customer.phone && <div><dt>Phone</dt><dd>{data.customer.phone}</dd></div>}
          {data.customer.address && <div><dt>Address</dt><dd>{data.customer.address}</dd></div>}
        </dl><p className="portal-account-note">Need to update your information? Contact our team.</p></section>
        <section className="portal-contact"><p className="portal-eyebrow">WE’RE HERE TO HELP</p><h2>Questions about your project?</h2><p>Get in touch with Oliphant Removal and we’ll be happy to help.</p><a className="portal-button is-light" href="tel:8105425833">Call (810) 542-5833 <span aria-hidden="true">↗</span></a><a className="portal-contact-email" href="mailto:oliphantremoval@gmail.com">oliphantremoval@gmail.com</a></section></aside></div>
        <footer className="portal-footer"><span>Oliphant Removal</span><Link href="/">Visit our website ↗</Link></footer>
      </>}
    </main>
  </div>;
}

