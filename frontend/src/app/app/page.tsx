import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function AppPage() {
  const cookie = (await headers()).get("cookie") ?? "";
  const response = await fetch(`${process.env.AUTH_API_URL ?? "http://localhost:4000"}/api/access`, { headers: { cookie }, cache: "no-store" }).catch(() => null);
  if (!response?.ok) redirect("/login");
  return <main className="p-8">CompVista workspace</main>;
}
