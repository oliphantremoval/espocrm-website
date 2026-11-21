"use client";

import { useEffect, useState, type FormEvent } from "react";
import { isWebsiteContent, type WebsiteContent, type WebsiteService } from "@/lib/website-content";

type EditableField = "businessName" | "tagline" | "heroTitle" | "heroHighlight" | "heroDescription" | "heroImageUrl" | "primaryCtaLabel" | "phoneCtaLabel" | "quoteHeading" | "quoteDescription" | "quoteSubmitLabel" | "contactHeading" | "phone" | "email" | "serviceArea";

function responseError(value: unknown, fallback: string): string {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

export default function WebsiteSettingsPanel() {
  const [content, setContent] = useState<WebsiteContent | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await fetch("/api/crm/website", { cache: "no-store", headers: { Accept: "application/json" } });
        const body: unknown = await result.json().catch(() => null);
        if (!result.ok || !isWebsiteContent(body)) throw new Error(responseError(body, "Website settings could not be loaded."));
        if (active) setContent(body);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Website settings could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [reloadCount]);

  function updateField(field: EditableField, value: string) {
    setSaved("");
    setContent((current) => current ? { ...current, [field]: value } : current);
  }

  function updateService(index: number, field: keyof WebsiteService, value: string) {
    setSaved("");
    setContent((current) => current ? {
      ...current,
      services: current.services.map((service, serviceIndex) => serviceIndex === index ? { ...service, [field]: value } : service),
    } : current);
  }

  function addService() {
    setSaved("");
    setContent((current) => current && current.services.length < 9 ? {
      ...current,
      services: [...current.services, { title: "New service", description: "Describe the service offered to your customers." }],
    } : current);
  }

  function removeService(index: number) {
    setSaved("");
    setContent((current) => current && current.services.length > 1 ? {
      ...current,
      services: current.services.filter((_, serviceIndex) => serviceIndex !== index),
    } : current);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content) return;
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const result = await fetch("/api/crm/website", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(content),
      });
      const body: unknown = await result.json().catch(() => null);
      if (!result.ok || !isWebsiteContent(body)) throw new Error(responseError(body, "Website changes could not be published."));
      setContent(body);
      setSaved("Website changes are published. Refresh the public website to see them.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Website changes could not be published.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="crm-settings-form"><p className="crm-website-settings-message">Loading website settings…</p></div>;
  if (!content) return <div className="crm-settings-form"><p className="crm-error" role="alert">{error || "Website settings could not be loaded."}</p><div className="crm-settings-actions"><button type="button" className="crm-button is-secondary" onClick={() => setReloadCount((count) => count + 1)}>Try again</button></div></div>;

  return <form className="crm-settings-form" onSubmit={save}>
    <div className="crm-panel-heading">
      <div><h2>Website editor</h2><p>Publish the text, contact details, image, and service cards shown on your public website.</p></div>
      <a className="crm-button is-secondary" href="/" target="_blank" rel="noreferrer">Open website</a>
    </div>
    {error && <p className="crm-error crm-website-settings-error" role="alert">{error}</p>}
    {saved && <p className="crm-success" role="status">{saved}</p>}

    <h3 className="crm-settings-subheading">Brand and hero</h3>
    <div className="crm-form-grid">
      <label className="crm-field"><span>Business name</span><input required maxLength={100} value={content.businessName} onChange={(event) => updateField("businessName", event.target.value)} /></label>
      <label className="crm-field"><span>Tagline</span><input maxLength={160} value={content.tagline} onChange={(event) => updateField("tagline", event.target.value)} placeholder="Tree Removal • Trimming • Storm Cleanup" /></label>
      <label className="crm-field"><span>Hero title</span><input required maxLength={100} value={content.heroTitle} onChange={(event) => updateField("heroTitle", event.target.value)} /></label>
      <label className="crm-field"><span>Hero highlight</span><input required maxLength={100} value={content.heroHighlight} onChange={(event) => updateField("heroHighlight", event.target.value)} /></label>
      <label className="crm-field crm-field-wide"><span>Hero description</span><textarea required rows={4} maxLength={1_000} value={content.heroDescription} onChange={(event) => updateField("heroDescription", event.target.value)} /></label>
      <label className="crm-field crm-field-wide"><span>Hero image URL</span><input type="url" required maxLength={2_048} value={content.heroImageUrl} onChange={(event) => updateField("heroImageUrl", event.target.value)} placeholder="https://…" /></label>
      <label className="crm-field"><span>Quote button label</span><input required maxLength={50} value={content.primaryCtaLabel} onChange={(event) => updateField("primaryCtaLabel", event.target.value)} /></label>
      <label className="crm-field"><span>Call button label</span><input required maxLength={50} value={content.phoneCtaLabel} onChange={(event) => updateField("phoneCtaLabel", event.target.value)} /></label>
    </div>

    <h3 className="crm-settings-subheading">Quote and contact</h3>
    <div className="crm-form-grid">
      <label className="crm-field"><span>Quote section heading</span><input required maxLength={100} value={content.quoteHeading} onChange={(event) => updateField("quoteHeading", event.target.value)} /></label>
      <label className="crm-field"><span>Quote submit button</span><input required maxLength={50} value={content.quoteSubmitLabel} onChange={(event) => updateField("quoteSubmitLabel", event.target.value)} /></label>
      <label className="crm-field crm-field-wide"><span>Quote section description</span><textarea required rows={3} maxLength={500} value={content.quoteDescription} onChange={(event) => updateField("quoteDescription", event.target.value)} /></label>
      <label className="crm-field"><span>Contact section heading</span><input required maxLength={100} value={content.contactHeading} onChange={(event) => updateField("contactHeading", event.target.value)} /></label>
      <label className="crm-field"><span>Public phone</span><input type="tel" required maxLength={80} value={content.phone} onChange={(event) => updateField("phone", event.target.value)} /></label>
      <label className="crm-field"><span>Public email</span><input type="email" required maxLength={254} value={content.email} onChange={(event) => updateField("email", event.target.value)} /></label>
      <label className="crm-field crm-field-wide"><span>Service area</span><input required maxLength={500} value={content.serviceArea} onChange={(event) => updateField("serviceArea", event.target.value)} /></label>
    </div>

    <div className="crm-settings-services-heading"><div><h3>Service cards</h3><p>These appear on the public website. You can show up to nine services.</p></div><button type="button" className="crm-button is-secondary" onClick={addService} disabled={content.services.length >= 9}>Add service</button></div>
    <div className="crm-website-service-editor">
      {content.services.map((service, index) => <article className="crm-website-service-card" key={`${index}-${service.title}`}>
        <div className="crm-website-service-card-heading"><span>Service {index + 1}</span><button type="button" className="crm-text-button is-danger" onClick={() => removeService(index)} disabled={content.services.length === 1}>Remove</button></div>
        <label className="crm-field"><span>Service title</span><input required maxLength={80} value={service.title} onChange={(event) => updateService(index, "title", event.target.value)} /></label>
        <label className="crm-field"><span>Service description</span><textarea required rows={3} maxLength={500} value={service.description} onChange={(event) => updateService(index, "description", event.target.value)} /></label>
      </article>)}
    </div>
    <p className="crm-settings-note">Only the signed-in owner can publish website changes. Public pages read these settings from private hosting storage; no account or payment credentials are exposed.</p>
    <div className="crm-settings-actions"><button type="button" className="crm-button is-secondary" onClick={() => setReloadCount((count) => count + 1)} disabled={saving}>Discard and reload</button><button className="crm-button is-primary" type="submit" disabled={saving}>{saving ? "Publishing…" : "Publish website changes"}</button></div>
  </form>;
}

