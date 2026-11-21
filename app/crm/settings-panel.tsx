"use client";

import { useId, useState, type FormEvent } from "react";
import { initials, priorities, type CRMSettings, type CRMState } from "./model";
import WebsiteSettingsPanel from "./website-settings-panel";

type SettingsTab = "Profile" | "Business" | "Website" | "Services" | "Work defaults" | "Notifications" | "Billing" | "Data";

const tabs: SettingsTab[] = ["Profile", "Business", "Website", "Services", "Work defaults", "Notifications", "Billing", "Data"];

type SettingsPanelProps = {
  data: CRMState;
  onClear: () => void;
  onExport: () => void;
  onImport: () => void;
  onSave: (settings: CRMSettings, message: string) => boolean;
};

function readText(form: HTMLFormElement, name: string): string {
  return String(new FormData(form).get(name) ?? "").trim();
}

function Toggle({ checked, description, label, onChange }: { checked: boolean; description: string; label: string; onChange: (checked: boolean) => void }) {
  return <label className="crm-setting-toggle"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

export default function SettingsPanel({ data, onClear, onExport, onImport, onSave }: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>("Profile");
  const [newService, setNewService] = useState("");
  const [serviceError, setServiceError] = useState("");
  const tabId = useId();
  const settings = data.settings;

  const update = (next: CRMSettings, message: string) => onSave(next, message);

  function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update({
      ...settings,
      profile: {
        ownerName: readText(event.currentTarget, "ownerName"),
        title: readText(event.currentTarget, "title"),
        contactEmail: readText(event.currentTarget, "contactEmail"),
        phone: readText(event.currentTarget, "phone"),
      },
    }, "Profile settings saved.");
  }

  function saveBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update({
      ...settings,
      business: {
        name: readText(event.currentTarget, "businessName"),
        email: readText(event.currentTarget, "businessEmail"),
        phone: readText(event.currentTarget, "businessPhone"),
        website: readText(event.currentTarget, "website"),
        address: readText(event.currentTarget, "address"),
        serviceArea: readText(event.currentTarget, "serviceArea"),
        timezone: readText(event.currentTarget, "timezone"),
      },
    }, "Business settings saved.");
  }

  function saveWorkDefaults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    update({
      ...settings,
      jobDefaults: {
        priority: readText(form, "priority") as CRMSettings["jobDefaults"]["priority"],
        crew: readText(form, "crew"),
        arrivalTime: readText(form, "arrivalTime"),
        durationMinutes: Number(new FormData(form).get("durationMinutes")),
      },
      estimateDefaults: {
        validForDays: Number(new FormData(form).get("validForDays")),
        depositPercent: Number(new FormData(form).get("depositPercent")),
        terms: readText(form, "terms"),
      },
    }, "Job and estimate defaults saved.");
  }

  function saveBilling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    update({
      ...settings,
      billing: {
        ...settings.billing,
        invoiceDueDays: Number(new FormData(form).get("invoiceDueDays")),
        lateFeePercent: Number(new FormData(form).get("lateFeePercent")),
      },
    }, "Billing preferences saved.");
  }

  function addService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = newService.trim().replace(/\s+/g, " ");
    if (value.length < 2 || value.length > 80) {
      setServiceError("Use a service name between 2 and 80 characters.");
      return;
    }
    if (settings.services.some((service) => service.localeCompare(value, undefined, { sensitivity: "accent" }) === 0)) {
      setServiceError("That service is already in your list.");
      return;
    }
    if (update({ ...settings, services: [...settings.services, value] }, `${value} added to services.`)) {
      setNewService("");
      setServiceError("");
    }
  }

  function removeService(service: string) {
    if (settings.services.length === 1) {
      setServiceError("Keep at least one active service.");
      return;
    }
    if (update({ ...settings, services: settings.services.filter((item) => item !== service) }, `${service} removed from active services.`)) {
      setServiceError("");
    }
  }

  const setNotification = (key: keyof CRMSettings["notifications"], checked: boolean, label: string) => {
    update({ ...settings, notifications: { ...settings.notifications, [key]: checked } }, `${label} ${checked ? "enabled" : "disabled"}.`);
  };

  const setBilling = (key: "lateFeeEnabled" | "acceptCard" | "acceptBankAccount", checked: boolean, label: string) => {
    update({ ...settings, billing: { ...settings.billing, [key]: checked } }, `${label} ${checked ? "enabled" : "disabled"}.`);
  };

  return <div className="crm-settings-layout">
    <aside className="crm-panel crm-settings-nav">
      <div className="crm-settings-profile">
        <span className="crm-avatar crm-settings-avatar">{initials(settings.profile.ownerName)}</span>
        <div><strong>{settings.profile.ownerName}</strong><small>{settings.profile.title}</small></div>
      </div>
      <div className="crm-settings-tabs" role="tablist" aria-label="Settings sections">
        {tabs.map((item) => <button key={item} id={`${tabId}-${item}`} type="button" role="tab" aria-selected={tab === item} aria-controls={`${tabId}-${item}-panel`} className="crm-settings-tab" onClick={() => setTab(item)}>{item}</button>)}
      </div>
    </aside>

    <section id={`${tabId}-${tab}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${tab}`} className="crm-panel crm-settings-content">
      {tab === "Profile" && <form className="crm-settings-form" onSubmit={saveProfile}>
        <div className="crm-panel-heading"><div><h2>Owner profile</h2><p>Update the contact information shown inside your workspace.</p></div></div>
        <div className="crm-form-grid">
          <label className="crm-field"><span>Full name</span><input name="ownerName" required maxLength={200} defaultValue={settings.profile.ownerName} /></label>
          <label className="crm-field"><span>Title</span><input name="title" required maxLength={100} defaultValue={settings.profile.title} /></label>
          <label className="crm-field"><span>Contact email</span><input name="contactEmail" type="email" maxLength={254} defaultValue={settings.profile.contactEmail} /></label>
          <label className="crm-field"><span>Phone</span><input name="phone" type="tel" maxLength={80} defaultValue={settings.profile.phone} /></label>
        </div>
        <p className="crm-settings-note">Your secure sign-in email is protected separately and is not changed here.</p>
        <div className="crm-settings-actions"><button className="crm-button is-primary" type="submit">Save profile</button></div>
      </form>}

      {tab === "Business" && <form className="crm-settings-form" onSubmit={saveBusiness}>
        <div className="crm-panel-heading"><div><h2>Business profile</h2><p>Keep your public and customer-facing details consistent.</p></div></div>
        <div className="crm-form-grid">
          <label className="crm-field"><span>Business name</span><input name="businessName" required maxLength={200} defaultValue={settings.business.name} /></label>
          <label className="crm-field"><span>Business email</span><input name="businessEmail" type="email" maxLength={254} defaultValue={settings.business.email} /></label>
          <label className="crm-field"><span>Business phone</span><input name="businessPhone" type="tel" maxLength={80} defaultValue={settings.business.phone} /></label>
          <label className="crm-field"><span>Website</span><input name="website" type="url" maxLength={2048} defaultValue={settings.business.website} /></label>
          <label className="crm-field crm-field-wide"><span>Business address</span><input name="address" maxLength={500} defaultValue={settings.business.address} placeholder="Street, city, state, ZIP" /></label>
          <label className="crm-field"><span>Service area</span><input name="serviceArea" maxLength={500} defaultValue={settings.business.serviceArea} /></label>
          <label className="crm-field"><span>Timezone</span><input name="timezone" required maxLength={100} defaultValue={settings.business.timezone} /></label>
        </div>
        <div className="crm-settings-actions"><button className="crm-button is-primary" type="submit">Save business profile</button></div>
      </form>}

      {tab === "Website" && <WebsiteSettingsPanel />}

      {tab === "Services" && <div className="crm-settings-form">
        <div className="crm-panel-heading"><div><h2>Service catalog</h2><p>Choose the services available when you create a lead or job.</p></div></div>
        <div className="crm-service-chips" aria-label="Active services">{settings.services.map((service) => <span className="crm-service-chip" key={service}>{service}<button type="button" onClick={() => removeService(service)} aria-label={`Remove ${service}`}>×</button></span>)}</div>
        <form className="crm-service-add" onSubmit={addService}>
          <label className="crm-field"><span>Add a service</span><input value={newService} onChange={(event) => setNewService(event.target.value)} maxLength={80} placeholder="e.g. Stump grinding" /></label>
          <button className="crm-button is-secondary" type="submit">Add service</button>
        </form>
        {serviceError && <p className="crm-error" role="alert">{serviceError}</p>}
        <p className="crm-settings-note">Removing a service hides it from new jobs; existing jobs keep their original service label.</p>
      </div>}

      {tab === "Work defaults" && <form className="crm-settings-form" onSubmit={saveWorkDefaults}>
        <div className="crm-panel-heading"><div><h2>Job and estimate defaults</h2><p>Use these starting values when you open a new lead or quote.</p></div></div>
        <h3 className="crm-settings-subheading">Job defaults</h3>
        <div className="crm-form-grid">
          <label className="crm-field"><span>Default priority</span><select name="priority" defaultValue={settings.jobDefaults.priority}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label>
          <label className="crm-field"><span>Default crew</span><input name="crew" maxLength={200} defaultValue={settings.jobDefaults.crew} placeholder="e.g. Crew A" /></label>
          <label className="crm-field"><span>Default arrival time</span><input name="arrivalTime" type="time" defaultValue={settings.jobDefaults.arrivalTime} /></label>
          <label className="crm-field"><span>Default duration (minutes)</span><input name="durationMinutes" type="number" required min="15" max="1440" step="15" defaultValue={settings.jobDefaults.durationMinutes} /></label>
        </div>
        <h3 className="crm-settings-subheading">Estimate defaults</h3>
        <div className="crm-form-grid">
          <label className="crm-field"><span>Estimate valid for (days)</span><input name="validForDays" type="number" required min="1" max="365" defaultValue={settings.estimateDefaults.validForDays} /></label>
          <label className="crm-field"><span>Suggested deposit (%)</span><input name="depositPercent" type="number" required min="0" max="100" step="0.01" defaultValue={settings.estimateDefaults.depositPercent} /></label>
          <label className="crm-field crm-field-wide"><span>Default estimate terms</span><textarea name="terms" rows={4} maxLength={2000} defaultValue={settings.estimateDefaults.terms} /></label>
        </div>
        <div className="crm-settings-actions"><button className="crm-button is-primary" type="submit">Save work defaults</button></div>
      </form>}

      {tab === "Notifications" && <div className="crm-settings-form">
        <div className="crm-panel-heading"><div><h2>Notifications</h2><p>Set the reminders you want enabled as the connected CRM features come online.</p></div></div>
        <div className="crm-toggle-list">
          <Toggle label="New lead emails" description="Keep email alerts enabled for quote requests from your website." checked={settings.notifications.newLeadEmail} onChange={(checked) => setNotification("newLeadEmail", checked, "New lead emails")} />
          <Toggle label="Follow-up reminders" description="Show reminders for uncompleted follow-up tasks." checked={settings.notifications.followUpReminders} onChange={(checked) => setNotification("followUpReminders", checked, "Follow-up reminders")} />
          <Toggle label="Job reminders" description="Use job reminder preferences when shared scheduling is connected." checked={settings.notifications.jobReminders} onChange={(checked) => setNotification("jobReminders", checked, "Job reminders")} />
          <Toggle label="Estimate reminders" description="Use estimate reminder preferences when customer delivery is connected." checked={settings.notifications.estimateReminders} onChange={(checked) => setNotification("estimateReminders", checked, "Estimate reminders")} />
        </div>
      </div>}

      {tab === "Billing" && <form className="crm-settings-form" onSubmit={saveBilling}>
        <div className="crm-panel-heading"><div><h2>Billing preferences</h2><p>Set your defaults now; card and bank-account collection remains off until Stripe is activated.</p></div></div>
        <div className="crm-form-grid">
          <label className="crm-field"><span>Currency</span><input value="USD" disabled aria-label="Currency" /></label>
          <label className="crm-field"><span>Invoice due in (days)</span><input name="invoiceDueDays" type="number" required min="0" max="365" defaultValue={settings.billing.invoiceDueDays} /></label>
          <label className="crm-field"><span>Late fee (%)</span><input name="lateFeePercent" type="number" required min="0" max="100" step="0.01" defaultValue={settings.billing.lateFeePercent} /></label>
        </div>
        <div className="crm-toggle-list">
          <Toggle label="Apply late-fee policy" description="Save this policy for future invoices." checked={settings.billing.lateFeeEnabled} onChange={(checked) => setBilling("lateFeeEnabled", checked, "Late-fee policy")} />
          <Toggle label="Offer card payments" description="Saved as your preferred method; requires Stripe activation before customers can pay." checked={settings.billing.acceptCard} onChange={(checked) => setBilling("acceptCard", checked, "Card payment preference")} />
          <Toggle label="Offer bank-account payments" description="Saved as your preferred method; requires Stripe activation before customers can pay." checked={settings.billing.acceptBankAccount} onChange={(checked) => setBilling("acceptBankAccount", checked, "Bank-account payment preference")} />
        </div>
        <div className="crm-settings-actions"><button className="crm-button is-primary" type="submit">Save billing preferences</button></div>
      </form>}

      {tab === "Data" && <div className="crm-settings-form">
        <div className="crm-panel-heading"><div><h2>Data and security</h2><p>Keep a private backup while shared CRM storage is being connected.</p></div></div>
        <div className="crm-data-actions">
          <article><h3>Export backup</h3><p>Download all local workspace data and settings as a private JSON file.</p><button className="crm-button is-secondary" type="button" onClick={onExport}>Export backup</button></article>
          <article><h3>Import backup</h3><p>Restore a validated CRM backup from this browser.</p><button className="crm-button is-secondary" type="button" onClick={onImport}>Import backup</button></article>
          <article className="is-danger"><h3>Clear local workspace</h3><p>Remove customers, jobs, tasks, and local settings from this browser after exporting a backup.</p><button className="crm-button is-danger" type="button" onClick={onClear}>Clear workspace</button></article>
        </div>
        <p className="crm-settings-note">Your owner sign-in remains protected on the server. This panel does not expose passwords, email links, or payment credentials.</p>
      </div>}
    </section>
  </div>;
}

