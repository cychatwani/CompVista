import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../src/app/api/login/route";
const request = () => new Request("http://localhost:3000/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "test@example.com", password: "example" }) });
test("retries transient server failure and returns required reset step", async () => {
  const original = globalThis.fetch;
  let signIns = 0;
  globalThis.fetch = async (input) => {
    if (String(input).includes("sign-in/email")) {
      signIns++;
      if (signIns === 1) return new Response("", { status: 500 });
      return new Response(JSON.stringify({ user: { emailVerified: false } }), { status: 200, headers: { "set-cookie": "better-auth.session_token=test; Path=/; HttpOnly" } });
    }
    return new Response(JSON.stringify({ nextStep: "RESET_PASSWORD" }), { status: 200 });
  };
  try { const response = await POST(request()); assert.equal(signIns, 2); assert.deepEqual(await response.json(), { nextStep: "RESET_PASSWORD" }); }
  finally { globalThis.fetch = original; }
});
test("invalid credentials are not retried", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ code: "INVALID_EMAIL_OR_PASSWORD" }), { status: 401 }); };
  try { const response = await POST(request()); assert.equal(calls, 1); assert.equal(response.status, 401); }
  finally { globalThis.fetch = original; }
});
