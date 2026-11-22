import { NextResponse } from "next/server";

const actions = new Set(["status", "begin", "verify", "skip", "challenge"]);

async function forward(request: Request, action: string, method: "GET" | "POST") {
  if (!actions.has(action) || (method === "GET") !== (action === "status")) return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  try {
    const upstream = await fetch(`${process.env.AUTH_API_URL ?? "http://localhost:4000"}/api/totp/${action}`, {
      method,
      headers: { cookie: request.headers.get("cookie") ?? "", ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      ...(method === "POST" ? { body: await request.text() || "{}" } : {}),
      cache: "no-store",
    });
    const result = await upstream.json();
    const response = NextResponse.json(upstream.ok ? result : { error: result.message ?? "Authenticator request failed" }, { status: upstream.status });
    response.headers.set("Cache-Control", "no-store");
    for (const cookie of upstream.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  } catch { return NextResponse.json({ error: "Authenticator service is temporarily unavailable" }, { status: 503 }); }
}

export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return forward(request, (await params).action, "GET");
}
export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return forward(request, (await params).action, "POST");
}
