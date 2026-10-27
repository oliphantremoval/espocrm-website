import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Workspace | Oliphant Removal",
  description: "Oliphant Removal customer, estimate, and job workspace.",
  robots: { index: false, follow: false },
};

export default function CrmPage() {
  // Keep the workspace unavailable until server-side authentication is configured.
  notFound();
}
