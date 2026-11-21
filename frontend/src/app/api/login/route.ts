import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let credentials: unknown;
  try { credentials = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  try {
    const upstream = await fetch(`${process.env.AUTH_API_URL ?? "http://localhost:4000"}/api/auth/sign-in/email`, {
      method: "POST", headers: { "content-type": "application/json", origin: process.env.FRONTEND_URL ?? "http://localhost:3000" },
      body: JSON.stringify(credentials), cache: "no-store",
    });
    const result = await upstream.json();
    if (!upstream.ok) return NextResponse.json({ error: upstream.status === 401 ? "Invalid email or password" : "Sign in failed" }, { status: upstream.status === 401 ? 401 : 400 });
    const nextStep = result.twoFactorRedirect ? "VERIFY_TOTP" : !result.user?.emailVerified ? "VERIFY_EMAIL" : !result.user?.twoFactorEnabled ? "SETUP_TOTP" : "AUTHENTICATED";
    const response = NextResponse.json({ nextStep });
    for (const cookie of upstream.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  } catch { return NextResponse.json({ error: "Sign in is temporarily unavailable" }, { status: 503 }); }
}
