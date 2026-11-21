import HomePage from "./home-page";
import { getWebsiteContent } from "@/lib/website-content-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  return <HomePage content={await getWebsiteContent()} />;
}

