import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/login/setup-totp" });
Object.assign(globalThis, { window: dom.window, self: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, InputEvent: dom.window.InputEvent, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle, requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0), IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });
const { render, screen, waitFor, cleanup } = await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: SetupTotpPage } = await import("../src/app/login/setup-totp/page");
const { rememberLoginPassword, forgetLoginPassword } = await import("../src/components/auth/login-password-memory");
const router = { push() {}, replace() {}, refresh() {}, prefetch() {}, back() {}, forward() {} };
const page = () => createElement(AppRouterContext.Provider, { value: router as never }, createElement(SetupTotpPage));

test("setup uses the password retained from login without asking again", async () => {
  rememberLoginPassword("StrongPass123!");
  const original = globalThis.fetch;
  let sentPassword = "";
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith("/status")) return Response.json({ decision: "PENDING", canSkip: true, nextStep: "SETUP_TOTP" });
    sentPassword = JSON.parse(String(init?.body)).password;
    return Response.json({ totpURI: "otpauth://totp/CompVista:test?secret=ABCDEF", backupCodes: ["backup-one"] });
  };
  try {
    render(page());
    await waitFor(() => assert.ok(screen.getByRole("button", { name: "Continue to setup" })));
    assert.equal(screen.queryByLabelText("Current password"), null);
    await userEvent.setup().click(screen.getByRole("button", { name: "Continue to setup" }));
    await waitFor(() => assert.ok(screen.getByText("ABCDEF")));
    assert.equal(sentPassword, "StrongPass123!");
  } finally { globalThis.fetch = original; cleanup(); forgetLoginPassword(); }
});

test("refresh without password memory keeps setup available after sign-in", async () => {
  forgetLoginPassword();
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ decision: "PENDING", canSkip: false, nextStep: "SETUP_TOTP" });
  try {
    render(page());
    await waitFor(() => assert.ok(screen.getByRole("button", { name: "Sign in again" })));
    assert.equal(screen.queryByLabelText("Current password"), null);
    assert.equal(screen.queryByRole("button", { name: "Skip for Now" }), null);
  } finally { globalThis.fetch = original; cleanup(); }
});
