export type WebsiteService = {
  title: string;
  description: string;
};

export type WebsiteContent = {
  version: 1;
  businessName: string;
  tagline: string;
  heroTitle: string;
  heroHighlight: string;
  heroDescription: string;
  heroImageUrl: string;
  primaryCtaLabel: string;
  phoneCtaLabel: string;
  quoteHeading: string;
  quoteDescription: string;
  quoteSubmitLabel: string;
  contactHeading: string;
  phone: string;
  email: string;
  serviceArea: string;
  services: WebsiteService[];
  updatedAt: string;
};

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(message: string): never {
  throw new Error(message);
}

function text(value: unknown, label: string, maximum: number, minimum = 0): string {
  if (typeof value !== "string") fail(`${label} must be text.`);
  const result = value.trim();
  if (result.length < minimum) fail(`${label} must be at least ${minimum} characters.`);
  if (result.length > maximum) fail(`${label} is too long (maximum ${maximum} characters).`);
  return result;
}

function email(value: unknown, label: string): string {
  const result = text(value, label, 254, 3);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(`${label} must be a valid email address.`);
  return result;
}

function websiteUrl(value: unknown): string {
  const result = text(value, "Hero image URL", 2_048, 8);
  try {
    const url = new URL(result);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) fail("Hero image URL must use http or https.");
    return url.toString();
  } catch (error) {
    if (error instanceof Error && error.message === "Hero image URL must use http or https.") throw error;
    fail("Hero image URL must be a valid URL.");
  }
}

export function createDefaultWebsiteContent(): WebsiteContent {
  return {
    version: 1,
    businessName: "Oliphant Removal",
    tagline: "Tree Removal • Trimming • Storm Cleanup",
    heroTitle: "Fast & Reliable",
    heroHighlight: "Removal Services",
    heroDescription: "Professional tree removal, junk removal, snow removal, also providing emergency services for residential and commercial properties.",
    heroImageUrl: "https://files.catbox.moe/fy4rb5.png",
    primaryCtaLabel: "Get Free Quote",
    phoneCtaLabel: "Call Today",
    quoteHeading: "Request a Free Quote",
    quoteDescription: "Fill out the form below and we’ll contact you shortly.",
    quoteSubmitLabel: "Get My Free Quote",
    contactHeading: "Contact Us",
    phone: "(810) 542-5833",
    email: "oliphantremoval@gmail.com",
    serviceArea: "Lapeer county and surrounding areas",
    services: [
      { title: "Tree Removal", description: "Safe and professional removal of hazardous or unwanted trees." },
      { title: "Junk Removal", description: "Professional removal of scrap metal and other unwanted materials." },
      { title: "Snow Removal", description: "Snow removal services for residential and commercial properties." },
    ],
    updatedAt: "",
  };
}

/** Validates every public field before it can be stored or shown on the website. */
export function normalizeWebsiteContent(input: unknown, updatedAt = new Date().toISOString()): WebsiteContent {
  if (!isRecord(input)) fail("Website content must be an object.");
  const phone = text(input.phone, "Phone", 80, 7);
  if (phone.replace(/\D/g, "").length < 7) fail("Phone must contain at least seven digits.");
  if (!Array.isArray(input.services) || input.services.length < 1 || input.services.length > 9) {
    fail("Website services must contain between 1 and 9 cards.");
  }
  const services = input.services.map((item, index): WebsiteService => {
    if (!isRecord(item)) fail(`Service ${index + 1} must be an object.`);
    return {
      title: text(item.title, `Service ${index + 1} title`, 80, 2),
      description: text(item.description, `Service ${index + 1} description`, 500, 2),
    };
  });
  if (new Set(services.map((service) => service.title.toLocaleLowerCase())).size !== services.length) {
    fail("Website service titles must be unique.");
  }

  return {
    version: 1,
    businessName: text(input.businessName, "Business name", 100, 2),
    tagline: text(input.tagline, "Tagline", 160),
    heroTitle: text(input.heroTitle, "Hero title", 100, 2),
    heroHighlight: text(input.heroHighlight, "Hero highlight", 100, 2),
    heroDescription: text(input.heroDescription, "Hero description", 1_000, 20),
    heroImageUrl: websiteUrl(input.heroImageUrl),
    primaryCtaLabel: text(input.primaryCtaLabel, "Primary button label", 50, 2),
    phoneCtaLabel: text(input.phoneCtaLabel, "Phone button label", 50, 2),
    quoteHeading: text(input.quoteHeading, "Quote heading", 100, 2),
    quoteDescription: text(input.quoteDescription, "Quote description", 500, 2),
    quoteSubmitLabel: text(input.quoteSubmitLabel, "Quote submit label", 50, 2),
    contactHeading: text(input.contactHeading, "Contact heading", 100, 2),
    phone,
    email: email(input.email, "Contact email"),
    serviceArea: text(input.serviceArea, "Service area", 500, 2),
    services,
    updatedAt,
  };
}

export function isWebsiteContent(value: unknown): value is WebsiteContent {
  try {
    normalizeWebsiteContent(value);
    return true;
  } catch {
    return false;
  }
}

