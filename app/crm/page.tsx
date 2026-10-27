import type { Metadata } from "next";
import { requireOwner } from "@/lib/crm-auth";
import Dashboard from "./dashboard";
import "./crm.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workspace | Oliphant Removal",
  description: "Oliphant Removal customer, estimate, and job workspace.",
  robots: { index: false, follow: false },
};

export default async function CrmPage() {
  await requireOwner();
  return <Dashboard />;
}
