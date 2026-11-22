import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SidebarDemo from "@/components/sidebar-demo";

export default async function AppPage() {
  const cookie = (await headers()).get("cookie") ?? "";
  const response = await fetch(`${process.env.AUTH_API_URL ?? "http://localhost:4000"}/api/access`, { headers: { cookie }, cache: "no-store" }).catch(() => null);
  if (!response?.ok) redirect("/login");
  return <main><SidebarDemo /></main>;
}
