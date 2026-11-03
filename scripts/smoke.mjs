import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  permissions: ["clipboard-read", "clipboard-write"],
  acceptDownloads: true,
});
const page = await context.newPage(),
  errors = [],
  external = [],
  checks = [];
context.on("request", (req) => {
  const u = new URL(req.url());
  if (
    ["http:", "https:"].includes(u.protocol) &&
    u.origin !== "http://127.0.0.1:3000"
  )
    external.push(req.url());
});
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.error("BROWSER:", msg.text());
});
const check = (label) => {
  checks.push(label);
  console.log("PASS", label);
};
const waitResult = async () => {
  await page.waitForFunction(
    () =>
      document.querySelector("textarea") ||
      document.querySelector(".error-banner"),
    {},
    { timeout: 120000 },
  );
  const error = (await page.locator(".error-banner").count())
    ? await page.locator(".error-banner").textContent()
    : null;
  if (error) throw new Error(error);
  await page
    .getByRole("textbox", { name: "Editable extracted text" })
    .waitFor();
};
await mkdir("test-results", { recursive: true });
try {
  await page.goto("http://127.0.0.1:3000");
  await page.getByRole("heading", { name: "Your images, in words." }).waitFor();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  check("Desktop empty state");
  await page.getByRole("button", { name: "A printed page" }).click();
  await waitResult();
  const text = await page
    .getByRole("textbox", { name: "Editable extracted text" })
    .inputValue();
  assert.match(text, /Good ideas rarely arrive fully formed/);
  assert.match(text, /Make something of them/);
  check("Real OCR on printed-page sample");
  await page.screenshot({ path: "test-results/result.png", fullPage: true });
  await page
    .getByRole("textbox", { name: "Editable extracted text" })
    .fill("Edited locally.\nNames & numbers: 42.");
  await page.getByRole("button", { name: "Copy", exact: true }).click();
  assert.equal(
    (await page.evaluate(() => navigator.clipboard.readText())).replace(
      /\r\n/g,
      "\n",
    ),
    "Edited locally.\nNames & numbers: 42.",
  );
  check("Editable result and clipboard copy");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download text", exact: true })
    .click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "lettra-note.txt");
  check("Source-named text download");
  await page.getByRole("button", { name: "Side by side", exact: true }).click();
  assert.equal(await page.locator(".image-canvas img").count(), 2);
  check("Original and exact cleaned image comparison");
  await page.getByRole("button", { name: /Improve your result/ }).click();
  await page.getByRole("button", { name: "Screenshot", exact: true }).click();
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await waitResult();
  check("Preset rerun on retained image");
  await page.getByRole("button", { name: "Show raw", exact: true }).click();
  assert.match(
    await page
      .getByRole("textbox", { name: "Raw extracted text" })
      .inputValue(),
    /Good ideas/,
  );
  await page.getByRole("button", { name: "Show cleaned", exact: true }).click();
  check("Raw text remains available");
  await page.getByRole("button", { name: "Clear image and result" }).click();
  await page
    .getByLabel("Choose an image", { exact: true })
    .setInputFiles({
      name: "fake.png",
      mimeType: "image/png",
      buffer: Buffer.from('<svg onload="alert(1)"/>'),
    });
  await expect(page.locator(".error-banner")).toContainText("isn't supported");
  check("Magic-byte file validation");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page
    .getByLabel("Choose an image", { exact: true })
    .setInputFiles({
      name: "large.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(16 * 1024 * 1024),
    });
  await expect(page.locator(".error-banner")).toContainText("under 15 MB");
  check("15 MB size limit");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  const huge = Buffer.alloc(24);
  huge.set([137, 80, 78, 71, 13, 10, 26, 10]);
  huge.writeUInt32BE(10000, 16);
  huge.writeUInt32BE(5000, 20);
  await page
    .getByLabel("Choose an image", { exact: true })
    .setInputFiles({
      name: "oversized.png",
      mimeType: "image/png",
      buffer: huge,
    });
  await expect(page.locator(".error-banner")).toContainText("40 megapixels");
  check("Pixel limit checked before decoding");
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await page.getByRole("button", { name: "A dark screenshot" }).click();
  await waitResult();
  assert.match(
    await page
      .getByRole("textbox", { name: "Editable extracted text" })
      .inputValue(),
    /Make the useful things simple/,
  );
  check("Dark image inversion and OCR");
  await page.getByRole("button", { name: "Clear image and result" }).click();
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 350;
    const c = canvas.getContext("2d");
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 1200, 350);
    c.fillStyle = "#111";
    c.font = "48px Arial";
    c.fillText("PASTED IMAGE 12345", 75, 170);
    const blob = await new Promise((r) => canvas.toBlob(r));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "clipboard.png", { type: "image/png" }));
    document.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true }),
    );
  });
  await waitResult();
  assert.match(
    await page
      .getByRole("textbox", { name: "Editable extracted text" })
      .inputValue(),
    /PASTED IMAGE 12345/,
  );
  check("Paste image extraction");
  await page.getByRole("button", { name: "Clear image and result" }).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole("button", { name: "A printed page" }).waitFor();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "A printed page" }).click();
  await waitResult();
  assert.match(
    await page
      .getByRole("textbox", { name: "Editable extracted text" })
      .inputValue(),
    /Good ideas/,
  );
  check("Offline reload and local extraction");
  await context.setOffline(false);
  await page.getByRole("button", { name: "Clear image and result" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  check("Mobile layout has no horizontal overflow");
  assert.deepEqual(external, []);
  check("No off-origin network requests during all extractions");
  assert.deepEqual(errors, []);
  check("No browser runtime errors");
  await writeFile(
    "test-results/smoke.json",
    JSON.stringify({ checks, external, errors }, null, 2),
  );
  console.log("ALL CHECKS PASSED");
} catch (error) {
  await page.screenshot({ path: "test-results/failure.png", fullPage: true });
  console.error("FAILED", error);
  console.error(
    "Page text:",
    (await page.locator("body").innerText()).slice(0, 6000),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
