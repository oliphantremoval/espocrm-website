import type { Metadata } from "next";
import Dashboard from "./dashboard";
import "./crm.css";

export const metadata: Metadata = {
  title: "Workspace | Oliphant Removal",
  description: "Oliphant Removal customer, estimate, and job workspace.",
  robots: { index: false, follow: false },
};

export default function CrmPage() {
  return <Dashboard />;
}
