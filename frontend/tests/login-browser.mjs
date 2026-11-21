import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const [host, width] of [["localhost", 1440], ["localhost", 375], ["127.0.0.1", 1440], ["127.0.0.1", 375]]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://${host}:3000/login`, { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Work email" }).fill("dfdf");
    await page.locator("#password").fill("test");
    await page.waitForTimeout(600);
    const emailError = await page.locator("#work-email-error").textContent();
    const errorVisible = await page.locator("#work-email-error").isVisible();
    const errorStyle = await page.locator("#work-email-error").evaluate((element) => {
      const style = getComputedStyle(element);
      return { fontSize: style.fontSize, fontWeight: style.fontWeight, color: style.color };
    });
    const ariaInvalid = await page.locator("#work-email").getAttribute("aria-invalid");
    const disabled = await page.getByRole("button", { name: /Continue securely/ }).isDisabled();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    console.log(JSON.stringify({ host, width, emailError, errorVisible, errorStyle, ariaInvalid, disabled, overflow, pageErrors: errors }));
    assert.equal(emailError, "Enter a valid email address");
    assert.equal(errorVisible, true);
    assert.equal(errorStyle.fontSize, "16px");
    assert.equal(errorStyle.fontWeight, "600");
    assert.equal(ariaInvalid, "true");
    assert.equal(disabled, true);
    assert.equal(overflow, false);
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally {
  await browser.close();
}
