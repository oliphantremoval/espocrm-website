import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ownerAuthConfig } from "@/lib/crm-auth";
import { currentCrmActor, teamMailConfig } from "@/lib/crm-team-auth";
import CrmLoginForm from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CRM sign-in | Oliphant Removal",
  robots: { index: false, follow: false },
};

export default async function CrmLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const config = ownerAuthConfig();
  if (!config) return <CrmLoginForm configured={false} />;
  if (await currentCrmActor().catch(() => null)) redirect("/crm");
  const query = await searchParams;
  return (
    <CrmLoginForm
      authMode={config.mode}
      emailEnabled={config.mode === "email" || Boolean(teamMailConfig())}
      invalid={query.error === "invalid"}
      limited={query.error === "limited"}
      linkInvalid={query.error === "link"}
      emailFailed={query.error === "email"}
      emailSent={query.sent === "1"}
    />
  );
}
