type Context = { params: Promise<{ path: string[] }> };

async function forward(request: Request, context: Context) {
  const { path } = await context.params;
  if (!path.length || !path.every((part) => /^[A-Za-z0-9_-]+$/.test(part)) || !['currencies', 'compensation', 'employees', 'me'].includes(path[0])) return Response.json({ message: 'Invalid path' }, { status: 400 });
  const target = `${process.env.AUTH_API_URL ?? 'http://localhost:4000'}/${path.join('/')}${new URL(request.url).search}`;
  try {
    const response = await fetch(target, { method: request.method, headers: { cookie: request.headers.get('cookie') ?? '', ...(request.method === 'GET' ? {} : { 'content-type': 'application/json' }) }, body: request.method === 'GET' ? undefined : await request.text(), cache: 'no-store' });
    return new Response(await response.text(), { status: response.status, headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' } });
  } catch {
    return Response.json({ message: 'Compensation service is temporarily unavailable' }, { status: 503 });
  }
}
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
