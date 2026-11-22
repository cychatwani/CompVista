import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/login/reset-password" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0), IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
const { render, screen, cleanup, waitFor } = await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: ResetPasswordPage } = await import("../src/app/login/reset-password/page");
const { rememberLoginPassword, forgetLoginPassword } = await import("../src/components/auth/login-password-memory");
const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} };
const page = () => createElement(AppRouterContext.Provider, { value: router as never }, createElement(ResetPasswordPage));
test("requirements react to typing and matching confirmation enables submit", async () => {
  const user = userEvent.setup();
  rememberLoginPassword("temporary");
  render(page());
  const button = screen.getByRole("button", { name: "Change password" }) as HTMLButtonElement;
  assert.equal(button.disabled, true);
  assert.equal(screen.queryByLabelText("Current password"), null);
  await user.type(screen.getByLabelText("New password"), "StrongPass123!");
  await user.click(screen.getByRole("button", { name: "Show new password" }));
  assert.equal((screen.getByLabelText("New password") as HTMLInputElement).type, "text");
  assert.match(screen.getByText(/At least 10 characters/).textContent ?? "", /\u2713/);
  assert.equal(button.disabled, true);
  await user.type(screen.getByLabelText("Confirm password"), "StrongPass123!");
  await user.click(screen.getByRole("button", { name: "Show confirm password" }));
  assert.equal((screen.getByLabelText("Confirm password") as HTMLInputElement).type, "text");
  assert.equal(button.disabled, false);
  cleanup();
  forgetLoginPassword();
});

test("submit shows a loader and blocks another request", async () => {
  const user = userEvent.setup();
  rememberLoginPassword("temporary");
  const originalFetch = globalThis.fetch;
  let finish!: (response: Response) => void;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Promise<Response>((resolve) => { finish = resolve; }); };
  try {
    render(page());
    await user.type(screen.getByLabelText("New password"), "StrongPass123!");
    await user.type(screen.getByLabelText("Confirm password"), "StrongPass123!");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    const pending = screen.getByRole("button", { name: "Changing password?" }) as HTMLButtonElement;
    assert.equal(pending.disabled, true);
    assert.equal(pending.getAttribute("aria-busy"), "true");
    assert.equal(calls, 1);
    finish(new Response(JSON.stringify({ message: "Retry" }), { status: 400 }));
    await waitFor(() => assert.ok(screen.getByRole("alert")));
  } finally { globalThis.fetch = originalFetch; cleanup(); forgetLoginPassword(); }
});
