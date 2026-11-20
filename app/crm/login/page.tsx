import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ownerAuthConfig, ownerIsSignedIn } from "@/lib/crm-auth";
import OwnerLoginForm from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Owner sign-in | Oliphant Removal",
  robots: { index: false, follow: false },
};

export default async function OwnerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const config = ownerAuthConfig();
  if (!config) return <OwnerLoginForm configured={false} />;
  if (await ownerIsSignedIn(config)) redirect("/crm");
  const query = await searchParams;
  return (
    <OwnerLoginForm
      authMode={config.mode}
      invalid={query.error === "invalid"}
      limited={query.error === "limited"}
      linkInvalid={query.error === "link"}
      emailFailed={query.error === "email"}
      emailSent={query.sent === "1"}
    />
  );
}

