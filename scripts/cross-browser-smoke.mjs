import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".sites-runtime/browsers");
const { firefox, webkit, expect } = await import("@playwright/test");
const reports = [];
await mkdir("test-results/cross-browser", { recursive: true });
for (const [name, engine] of [
  ["firefox", firefox],
  ["webkit", webkit],
]) {
  const report = {
    engine: name,
    physicalPhone: false,
    description:
      "Desktop browser engine on Windows, 390px touch viewport; not Safari/iPhone hardware",
    checks: [],
    errors: [],
  };
  let browser, page;
  try {
    browser = await engine.launch({ headless: true });
    report.version = browser.version();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      acceptDownloads: true,
    });
    page = await context.newPage();
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.goto(process.env.LETTRA_URL || "http://127.0.0.1:3000");
    report.capabilities = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      offscreen: typeof OffscreenCanvas !== "undefined",
      imageBitmap: typeof createImageBitmap !== "undefined",
      serviceWorker: "serviceWorker" in navigator,
    }));
    for (const [sample, phrase] of [
      ["A printed page", "Good ideas rarely arrive fully formed"],
      ["A dark screenshot", "Make the useful things simple"],
    ]) {
      await page.getByRole("button", { name: sample, exact: false }).click();
      await page.waitForFunction(
        () =>
          !document.querySelector(".working-state,.rerun-progress") &&
          document.querySelector(".text-editor,.error-banner"),
        {},
        { timeout: 120000 },
      );
      if (await page.locator(".error-banner").count())
        throw new Error(await page.locator(".error-banner").innerText());
      const editor = page.getByRole("textbox", {
        name: "Editable extracted text",
        exact: true,
      });
      await expect(editor).toHaveValue(new RegExp(phrase));
      report.checks.push(`${sample}: local OCR`);
      if (sample === "A printed page") {
        const original = await editor.inputValue();
        await editor.fill("Edited on this browser.");
        await page.getByRole("button", { name: "Undo edit" }).click();
        await expect(editor).toHaveValue(original);
        report.checks.push("Edit and undo");
        await page
          .locator(".mobile-actions")
          .getByRole("button", { name: "Settings", exact: true })
          .click();
        await expect(
          page.getByRole("dialog", { name: "Reading settings" }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Close settings panel" })
          .click();
        report.checks.push("Touch-sized settings sheet");
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page
            .getByRole("button", { name: "Download text", exact: true })
            .click(),
        ]);
        await download.saveAs(
          `test-results/cross-browser/${name}-download.txt`,
        );
        report.checks.push("TXT download");
        if (
          !(await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ))
        )
          throw new Error("Horizontal overflow");
        report.checks.push("No mobile-width overflow");
      }
      await page
        .getByRole("button", { name: "Clear image and result" })
        .click();
    }
    await page.screenshot({
      path: `test-results/cross-browser/${name}.png`,
      fullPage: true,
    });
    report.status = report.errors.length ? "failed" : "passed";
  } catch (e) {
    report.status = "failed";
    report.errors.push(e.message);
    if (page)
      await page
        .screenshot({
          path: `test-results/cross-browser/${name}-failure.png`,
          fullPage: true,
        })
        .catch(() => {});
  } finally {
    if (browser) await browser.close();
    reports.push(report);
    console.log(JSON.stringify(report));
    await writeFile(
      "test-results/cross-browser/report.json",
      JSON.stringify(reports, null, 2),
    );
  }
}
if (reports.some((r) => r.status !== "passed")) process.exitCode = 1;
