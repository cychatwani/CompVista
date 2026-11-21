import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { createElement } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/login" });
Object.assign(globalThis, {
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
  IS_REACT_ACT_ENVIRONMENT: true,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

const { cleanup, render, screen, waitFor } = await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { LoginFormShell } = await import("../src/components/auth/login-form-shell");
const { loginSchema } = await import("../src/components/auth/login-schema");

test("schema requires credentials, normalizes email, and preserves password", () => {
  assert.equal(loginSchema.safeParse({ email: "", password: "" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "valid@example.com", password: "" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "bad-email", password: "secret" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "  ", password: "secret" }).success, false);
  assert.equal(loginSchema.safeParse({ email: "valid@example.com", password: "   " }).success, false);
  assert.equal(loginSchema.safeParse({ email: "", password: "secret" }).error?.issues[0].message, "Work email is required");
  assert.equal(loginSchema.safeParse({ email: "bad-email", password: "secret" }).error?.issues[0].message, "Enter a valid email address");
  assert.equal(loginSchema.safeParse({ email: "valid@example.com", password: "   " }).error?.issues[0].message, "Password is required");
  const result = loginSchema.parse({ email: "  user@any-domain.example  ", password: " secret " });
  assert.equal(result.email, "user@any-domain.example");
  assert.equal(result.password, " secret ");
});

test("button follows reactive validity and corrected errors clear", async () => {
  const user = userEvent.setup();
  render(createElement(LoginFormShell));
  const email = screen.getByRole("textbox", { name: "Work email" }) as HTMLInputElement;
  const password = screen.getByLabelText("Password") as HTMLInputElement;
  const submit = screen.getByRole("button", { name: /Continue securely/ });
  assert.equal((submit as HTMLButtonElement).disabled, true);
  assert.equal(screen.queryByText("Work email is required"), null);

  await user.type(email, "invalid");
  await waitFor(() => assert.ok(screen.getByText("Enter a valid email address")));
  assert.equal(email.getAttribute("aria-invalid"), "true");
  await user.type(password, "secret");
  assert.equal((submit as HTMLButtonElement).disabled, true);

  await user.clear(email);
  await user.type(email, "  user@domain.example  ");
  await user.tab();
  await waitFor(() => assert.equal((submit as HTMLButtonElement).disabled, false));
  assert.equal(email.value, "user@domain.example");
  assert.equal(screen.queryByText("Enter a valid email address"), null);
  await user.keyboard("{Enter}");
  assert.equal(window.location.pathname, "/login");
  cleanup();
});

test("required-field messages appear while editing and clear when corrected", async () => {
  const user = userEvent.setup();
  render(createElement(LoginFormShell));
  const email = screen.getByRole("textbox", { name: "Work email" }) as HTMLInputElement;
  const password = screen.getByLabelText("Password") as HTMLInputElement;
  await user.type(email, "x");
  await user.clear(email);
  await waitFor(() => assert.ok(screen.getByText("Work email is required")));
  await user.type(email, "person@example.com");
  await waitFor(() => assert.equal(screen.queryByText("Work email is required"), null));
  await user.type(password, " ");
  await waitFor(() => assert.ok(screen.getByText("Password is required")));
  await user.type(password, "valid");
  await waitFor(() => assert.equal(screen.queryByText("Password is required"), null));
  cleanup();
});

test("password visibility toggles without losing value or input focus", async () => {
  const user = userEvent.setup();
  render(createElement(LoginFormShell));
  const password = screen.getByLabelText("Password") as HTMLInputElement;
  await user.type(password, " secret ");
  assert.equal(password.type, "password");
  await user.click(screen.getByRole("button", { name: "Show password" }));
  await waitFor(() => assert.equal(document.activeElement, password));
  assert.equal(password.type, "text");
  assert.equal(password.value, " secret ");
  await user.click(screen.getByRole("button", { name: "Hide password" }));
  assert.equal(password.type, "password");
  assert.equal(password.value, " secret ");
  cleanup();
});
