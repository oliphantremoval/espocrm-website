import type { Metadata } from "next";
import PortalDashboard from "./portal-dashboard";
import "./portal.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Customer portal | Oliphant Removal",
  robots: { index: false, follow: false },
};

export default function CustomerPortal() {
  return <PortalDashboard />;
}

