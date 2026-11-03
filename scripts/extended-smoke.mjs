import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    console.error("BROWSER", m.text());
});
await page.addInitScript(() => {
  const OriginalWorker = window.Worker;
  window.Worker = class extends OriginalWorker {
    constructor(...args) {
      super(...args);
      this.addEventListener("message", ({ data }) => {
        if (data.status === "reject")
          console.warn("Worker error:", data.action, data.data);
      });
    }
  };
});
const check = (x) => {
  checks.push(x);
  console.log("PASS", x);
};
const result = async () => {
  await page.waitForFunction(
    () =>
      !document.querySelector(".working-state,.rerun-progress") &&
      (document.querySelector("textarea") ||
        document.querySelector(".no-text") ||
        document.querySelector(".error-banner")),
    {},
    { timeout: 120000 },
  );
  if (await page.locator(".error-banner").count())
    throw new Error(await page.locator(".error-banner").innerText());
  if (await page.locator(".result-comparison").count())
    await page
      .getByRole("button", { name: "Use new result", exact: true })
      .click();
  if (!(await page.locator(".settings-sheet").count()))
    await page.locator(".settings-shortcut").click();
};
const run = async () => {
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await result();
};
try {
  await page.goto(process.env.LETTRA_URL || "http://127.0.0.1:3000");
  await page.getByRole("button", { name: "Recent history" }).click();
  await page.getByLabel("Keep recent history").check();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "A receipt", exact: false }).click();
  await result();
  await page.getByRole("button", { name: "Receipt", exact: true }).click();
  await run();
  await expect(page.locator("textarea")).toHaveValue(/THE CORNER STORE/);
  console.log(
    "Receipt fast OCR (accuracy observation):",
    await page.locator("textarea").inputValue(),
  );
  check("Receipt adaptive threshold and line removal");
  await page.getByRole("checkbox", { name: /^Numbers only/ }).click();
  await result();
  assert.doesNotMatch(await page.locator("textarea").inputValue(), /[a-z]/i);
  check("Numbers-only recognition");
  await page.getByRole("checkbox", { name: /^Numbers only/ }).click();
  await result();
  await page.getByRole("button", { name: "Document", exact: true }).click();
  await run();
  check("Document preset with adaptive threshold and denoise");
  await page.getByLabel("Accuracy", { exact: true }).selectOption("best");
  await run();
  check("Best model runs locally");
  await page.getByLabel("Reader", { exact: true }).selectOption("0");
  await run();
  check("Classic engine runs locally");
  await page.getByLabel("Reader", { exact: true }).selectOption("1");
  await page.getByLabel("Accuracy", { exact: true }).selectOption("fast");
  await page.getByRole("checkbox", { name: /^Use original image/ }).check();
  await run();
  check("Original-image bypass");
  await page.getByRole("checkbox", { name: /^Use original image/ }).uncheck();
  await page.getByRole("button", { name: "Crop image", exact: true }).click();
  const box = await page.locator(".crop-container img").boundingBox();
  await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.05);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.9, {
    steps: 10,
  });
  await page.mouse.up();
  await page.getByRole("button", { name: "Crop & read" }).click();
  await result();
  check("Crop selection and extraction");
  await page.getByRole("button", { name: "Rotate image clockwise" }).click();
  await result();
  check("Rotation and extraction");
  await page.getByRole("button", { name: "Recent history" }).click();
  assert.ok((await page.locator(".history-list button").count()) > 0);
  await page.getByLabel("Keep recent history").uncheck();
  assert.equal(
    await page.evaluate(() => localStorage.getItem("lettra-history")),
    null,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  check("Optional local history and deletion");
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel", exact: true })
    .click({ force: true });
  await expect(page.locator(".working-state")).toHaveCount(0);
  await run();
  check("Cancellation followed by a successful rerun");
  await page.getByRole("button", { name: "Clear image and result" }).click();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 400;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 800, 400);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Choose an image", { exact: true }).setInputFiles({
    name: "blank.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await result();
  await expect(
    page.getByRole("heading", { name: "No text detected" }),
  ).toBeVisible();
  check("Blank image empty-result message");
  await page.getByLabel("Recognition language").selectOption("fra");
  const french = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1000;
    c.height = 400;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1000, 400);
    ctx.fillStyle = "black";
    ctx.font = "42px Arial";
    ctx.fillText("Bonjour, voici un texte en français.", 40, 180);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Choose an image", { exact: true }).setInputFiles({
    name: "french.png",
    mimeType: "image/png",
    buffer: Buffer.from(french, "base64"),
  });
  await result();
  assert.match(await page.locator("textarea").inputValue(), /Bonjour/);
  check("French language model");
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/extended-smoke.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log("ALL EXTENDED CHECKS PASSED");
} catch (e) {
  console.error(e);
  console.error((await page.locator("body").innerText()).slice(-5000));
  await page.screenshot({
    path: "test-results/extended-failure.png",
    fullPage: true,
  });
  process.exitCode = 1;
} finally {
  await browser.close();
}
