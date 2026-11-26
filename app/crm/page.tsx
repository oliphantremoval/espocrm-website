import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentCrmActor } from "@/lib/crm-team-auth";
import Dashboard from "./dashboard";
import "./crm.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Workspace | Oliphant Removal",
  description: "Oliphant Removal customer, estimate, and job workspace.",
  robots: { index: false, follow: false },
};

export default async function CrmPage() {
  const actor = await currentCrmActor();
  if (!actor) redirect("/crm/login");
  return <Dashboard actor={{ name: actor.name, role: actor.role }} />;
}
