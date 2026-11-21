import { NextResponse } from "next/server";

const backend = process.env.AUTH_API_URL ?? "http://localhost:4000";

async function forward(request: Request, action: string, method: "GET" | "POST") {
  if (!(["status", "send", "resend", "verify"].includes(action)) || (method === "GET") !== (action === "status")) {
    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  }
  try {
    const response = await fetch(`${backend}/api/email-otp/${action}`, {
      method, headers: { cookie: request.headers.get("cookie") ?? "", ...(method === "POST" ? { "content-type": "application/json" } : {}) },
      ...(method === "POST" ? { body: await request.text() || "{}" } : {}), cache: "no-store",
    });
    const result = await response.json();
    return NextResponse.json(response.ok ? result : { error: result.message ?? "Email verification failed" }, { status: response.status });
  } catch { return NextResponse.json({ error: "Email verification is temporarily unavailable" }, { status: 503 }); }
}

export async function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return forward(request, (await params).action, "GET");
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return forward(request, (await params).action, "POST");
}
