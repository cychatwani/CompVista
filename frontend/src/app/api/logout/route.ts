import { NextResponse } from "next/server";

// Ends the Better Auth session upstream and clears the session cookies in the browser.
export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const response = NextResponse.json({ ok: true });
  try {
    const upstream = await fetch(`${process.env.AUTH_API_URL ?? "http://localhost:4000"}/api/auth/sign-out`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", origin: process.env.FRONTEND_URL ?? "http://localhost:3000" },
      body: "{}", cache: "no-store",
    });
    for (const value of upstream.headers.getSetCookie()) response.headers.append("set-cookie", value);
  } catch { /* still clear local cookies below */ }
  // Expire every Better Auth cookie the browser sent, even if the upstream call failed.
  for (const name of cookie.split(";").map((part) => part.split("=", 1)[0].trim()).filter((name) => name.includes("better-auth"))) {
    response.headers.append("set-cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${name.startsWith("__Secure-") ? "; Secure" : ""}`);
  }
  return response;
}
