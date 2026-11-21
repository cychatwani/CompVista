import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/login/verify-email" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, InputEvent: dom.window.InputEvent, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0), IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(dom.window.document, "elementFromPoint", { value: () => dom.window.document.body });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const { render, screen, waitFor, cleanup } = await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: VerifyEmailPage } = await import("../src/app/login/verify-email/page");

test("automatically checks delivery, shows email and cooldown, and reports an invalid code", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    if (String(input).endsWith("/status")) return new Response(JSON.stringify({ email: "person@example.com", retryAfterSeconds: 0, hasIssuedCode: false, hasActiveCode: false }), { status: 200 });
    if (String(input).endsWith("/send")) return new Response(JSON.stringify({ email: "person@example.com", retryAfterSeconds: 60, sent: true }), { status: 200 });
    return new Response(JSON.stringify({ error: "Code is invalid or expired" }), { status: 400 });
  };
  try {
    const user = userEvent.setup();
    render(createElement(VerifyEmailPage));
    await waitFor(() => assert.ok(screen.getByText("person@example.com")));
    assert.equal(calls.filter((url) => url.endsWith("/send")).length, 1);
    assert.equal((screen.getByRole("button", { name: /Resend in/ }) as HTMLButtonElement).disabled, true);
    await user.type(screen.getByLabelText("Verification code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify & continue" }));
    await waitFor(() => assert.ok(screen.getByRole("alert")));
    assert.equal(calls.filter((url) => url.endsWith("/verify")).length, 1);
  } finally { globalThis.fetch = originalFetch; cleanup(); }
});

test("an existing active code does not trigger another send on mount", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ email: "person@example.com", hasIssuedCode: true, hasActiveCode: true, retryAfterSeconds: 44 }), { status: 200 });
  };
  try {
    render(createElement(VerifyEmailPage));
    await waitFor(() => assert.ok(screen.getByText("person@example.com")));
    assert.equal(calls.filter((url) => url.endsWith("/send")).length, 0);
    assert.equal((screen.getByRole("button", { name: /Resend in/ }) as HTMLButtonElement).disabled, true);
  } finally { globalThis.fetch = originalFetch; cleanup(); }
});

test("an exhausted code never auto-resends on refresh", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ email: "person@example.com", hasIssuedCode: true, hasActiveCode: false, retryAfterSeconds: 0 }), { status: 200 });
  };
  try {
    render(createElement(VerifyEmailPage));
    await waitFor(() => assert.ok(screen.getByText(/code is unavailable/i)));
    assert.equal(calls.filter((url) => url.endsWith("/send")).length, 0);
    assert.equal((screen.getByRole("button", { name: "Resend code" }) as HTMLButtonElement).disabled, false);
  } finally { globalThis.fetch = originalFetch; cleanup(); }
});
