import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const response = await fetch(`${process.env.AUTH_API_URL ?? "http://localhost:4000"}/api/auth-state`, {
      headers: { cookie: request.headers.get("cookie") ?? "" }, cache: "no-store",
    });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch { return NextResponse.json({ error: "Authentication state unavailable" }, { status: 503 }); }
}
