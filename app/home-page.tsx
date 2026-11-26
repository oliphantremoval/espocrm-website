"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import type { WebsiteContent } from "@/lib/website-content";

type HomePageProps = {
  content: WebsiteContent;
};

export default function HomePage({ content }: HomePageProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    message: "",
  });
  const phoneHref = `tel:${content.phone.replace(/\D/g, "")}`;

  function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSuccess(false);
    setError("");

    try {
      const response = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
          ? body.error
          : "We could not send your request. Please call us instead.";
        throw new Error(message);
      }
      setSuccess(true);
      setFormData({ firstName: "", lastName: "", email: "", phone: "", company: "", message: "" });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We could not send your request. Please call us instead.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="min-h-screen bg-[#f5f7fa] text-[#111827]">
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- the logo is a local static asset. */}
          <img src="/logo.png" alt={content.businessName} className="h-12 w-12 object-contain" />
          <div>
            <h1 className="text-3xl font-bold leading-none text-[#111827]">{content.businessName}</h1>
            {content.tagline && <p className="mt-1 text-sm text-gray-500">{content.tagline}</p>}
          </div>
        </div>
        <nav className="hidden items-center gap-10 text-[15px] font-medium text-gray-700 md:flex" aria-label="Primary navigation">
          <a href="#services" className="transition hover:text-black">Services</a>
          <a href="#quote" className="transition hover:text-black">Quotes</a>
          <a href="#contact" className="transition hover:text-black">Contact</a>
          <a href="/portal/login" className="transition hover:text-black">Customer portal</a>
          <a href={phoneHref} className="rounded-xl bg-green-700 px-6 py-3 font-semibold text-white transition hover:bg-green-800">Call Now</a>
        </nav>
        <a href="/portal/login" className="ml-3 shrink-0 text-sm font-semibold text-green-700 md:hidden">Customer portal</a>
      </div>
    </header>

    <section className="border-b border-gray-200 bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 py-24 md:grid-cols-2">
        <div>
          <h2 className="text-5xl font-black leading-tight text-[#111827] md:text-6xl">
            {content.heroTitle}
            <span className="mt-2 block text-green-700">{content.heroHighlight}</span>
          </h2>
          <p className="mt-8 max-w-xl text-xl leading-relaxed text-gray-600">{content.heroDescription}</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <a href="#quote" className="rounded-xl bg-red-600 px-8 py-4 text-lg font-bold text-white transition hover:bg-red-700">{content.primaryCtaLabel}</a>
            <a href={phoneHref} className="rounded-xl border border-gray-300 px-8 py-4 text-lg font-semibold transition hover:border-gray-400">{content.phoneCtaLabel}</a>
          </div>
        </div>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- the owner can set a validated remote image URL in the CRM. */}
          <img src={content.heroImageUrl} alt={content.heroHighlight} className="h-[500px] w-full rounded-3xl object-cover shadow-2xl" />
        </div>
      </div>
    </section>

    <section id="services" className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 text-center">
          <h3 className="text-5xl font-black text-[#111827]">Our Services</h3>
          <p className="mx-auto mt-5 max-w-3xl text-xl text-gray-600">Complete tree care and removal solutions for homes and businesses.</p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {content.services.map((service) => <article key={service.title} className="rounded-3xl border border-gray-200 bg-white p-10 shadow-sm transition hover:shadow-xl">
            <h4 className="mb-5 text-3xl font-bold text-[#111827]">{service.title}</h4>
            <p className="text-lg leading-relaxed text-gray-600">{service.description}</p>
          </article>)}
        </div>
      </div>
    </section>

    <section id="quote" className="pb-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm md:p-12">
          <h3 className="mb-4 text-4xl font-black text-[#111827] md:text-5xl">{content.quoteHeading}</h3>
          <p className="mb-10 text-lg text-gray-500">{content.quoteDescription}</p>
          {success && <div className="mb-8 rounded-2xl bg-green-100 p-5 text-center font-medium text-green-800" role="status">Your request was submitted successfully.</div>}
          {error && <div className="mb-8 rounded-2xl bg-red-100 p-5 text-center font-medium text-red-800" role="alert">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-5 md:grid-cols-2">
              <input type="text" name="firstName" placeholder="First Name" value={formData.firstName} onChange={handleChange} required maxLength={80} className="rounded-2xl border border-gray-300 p-5 text-lg outline-none focus:border-black" />
              <input type="text" name="lastName" placeholder="Last Name" value={formData.lastName} onChange={handleChange} required maxLength={80} className="rounded-2xl border border-gray-300 p-5 text-lg outline-none focus:border-black" />
            </div>
            <input type="email" name="email" placeholder="Email Address" value={formData.email} onChange={handleChange} required maxLength={254} className="w-full rounded-2xl border border-gray-300 p-5 text-lg outline-none focus:border-black" />
            <input type="tel" name="phone" placeholder="Phone Number" value={formData.phone} onChange={handleChange} required maxLength={40} className="w-full rounded-2xl border border-gray-300 p-5 text-lg outline-none focus:border-black" />
            <input type="text" name="company" placeholder="Address or Company" value={formData.company} onChange={handleChange} maxLength={160} className="w-full rounded-2xl border border-gray-300 p-5 text-lg outline-none focus:border-black" />
            <textarea name="message" placeholder="Tell us what needs removed" value={formData.message} onChange={handleChange} required rows={7} maxLength={4_000} className="w-full resize-none rounded-2xl border border-gray-300 p-5 text-lg outline-none focus:border-black" />
            <button type="submit" disabled={loading} className="w-full rounded-2xl bg-red-600 py-5 text-xl font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Submitting..." : content.quoteSubmitLabel}</button>
          </form>
        </div>
      </div>
    </section>

    <section id="contact" className="pb-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="rounded-[32px] border border-gray-200 bg-white p-8 shadow-sm md:p-12">
          <h3 className="mb-8 text-4xl font-black text-[#111827] md:text-5xl">{content.contactHeading}</h3>
          <div className="space-y-4 text-lg text-gray-700">
            <p><strong>Phone:</strong> <a className="underline-offset-2 hover:underline" href={phoneHref}>{content.phone}</a></p>
            <p><strong>Email:</strong> <a className="underline-offset-2 hover:underline" href={`mailto:${content.email}`}>{content.email}</a></p>
            <p><strong>Service Area:</strong> {content.serviceArea}</p>
          </div>
        </div>
      </div>
    </section>
  </main>;
}

