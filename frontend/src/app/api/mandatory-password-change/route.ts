import { NextResponse } from "next/server";
export async function POST(request: Request) {
  try {
    const upstream = await fetch(`${process.env.AUTH_API_URL ?? "http://localhost:4000"}/api/mandatory-password-change`, {
      method: "POST", headers: { "content-type": "application/json", cookie: request.headers.get("cookie") ?? "" }, body: await request.text(), cache: "no-store",
    });
    const result = await upstream.json();
    if (!upstream.ok) return NextResponse.json({ error: result.message ?? "Password change failed" }, { status: upstream.status });
    const response = NextResponse.json(result);
    for (const cookie of upstream.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  } catch { return NextResponse.json({ error: "Password change is temporarily unavailable" }, { status: 503 }); }
}
