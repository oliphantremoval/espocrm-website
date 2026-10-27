import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ownerAuthConfig, ownerIsSignedIn } from "@/lib/crm-auth";
import OwnerLoginForm from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Owner sign-in | Oliphant Removal",
  robots: { index: false, follow: false },
};

export default async function OwnerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const config = ownerAuthConfig();
  if (!config) notFound();
  if (await ownerIsSignedIn(config)) redirect("/crm");
  const query = await searchParams;
  return <OwnerLoginForm invalid={query.error === "invalid"} />;
}
