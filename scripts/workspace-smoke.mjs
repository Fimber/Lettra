import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
});
const page = await context.newPage(),
  errors = [],
  checks = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (label) => {
  checks.push(label);
  console.log("PASS", label);
};
const editor = () =>
  page.getByRole("textbox", { name: "Editable extracted text", exact: true });
const settled = async () => {
  await page.waitForFunction(
    () =>
      !document.querySelector(".working-state,.rerun-progress") &&
      document.querySelector(".text-editor,.no-text,.error-banner"),
    {},
    { timeout: 120000 },
  );
  if (await page.locator(".error-banner").count())
    throw new Error(await page.locator(".error-banner").innerText());
};
const run = async () => {
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await settled();
  await page
    .getByRole("textbox", { name: "New result", exact: true })
    .waitFor();
};
await mkdir("test-results", { recursive: true });
try {
  await page.goto("http://127.0.0.1:3000");
  await page.getByRole("button", { name: "A printed page" }).click();
  await settled();
  const original = await editor().inputValue();
  await expect(page.locator(".intro")).toHaveCount(0);
  const split = page.getByRole("separator", {
    name: "Resize image and text panels",
  });
  await split.focus();
  await page.keyboard.press("ArrowRight");
  await expect(split).toHaveAttribute("aria-valuenow", "51");
  const bounds = await page.locator(".workspace").boundingBox();
  const handle = await split.boundingBox();
  await page.mouse.move(handle.x + 5, handle.y + 50);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.42, handle.y + 50);
  await page.mouse.up();
  assert.ok(Number(await split.getAttribute("aria-valuenow")) < 45);
  check("Compact workspace and keyboard/pointer resizing");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".zoom-value")).toHaveText("150%");
  const view = page.locator(".viewer-viewport"),
    viewBox = await view.boundingBox();
  await page.mouse.move(
    viewBox.x + viewBox.width / 2,
    viewBox.y + viewBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    viewBox.x + viewBox.width / 2 - 70,
    viewBox.y + viewBox.height / 2 - 50,
  );
  await page.mouse.up();
  assert.ok(await view.evaluate((el) => el.scrollLeft > 0 || el.scrollTop > 0));
  await page.getByRole("button", { name: "Fit image", exact: true }).click();
  check("Image zoom, drag-to-pan and fit");
  await editor().fill("My corrected words. Total 27.30.");
  await page.getByRole("button", { name: "Undo edit" }).click();
  await expect(editor()).toHaveValue(original);
  await page.getByRole("button", { name: "Redo edit" }).click();
  await expect(editor()).toHaveValue("My corrected words. Total 27.30.");
  await editor().focus();
  await page.keyboard.press("Control+z");
  await expect(editor()).toHaveValue(original);
  await page.keyboard.press("Control+Shift+z");
  await expect(editor()).toHaveValue("My corrected words. Total 27.30.");
  check("Button and keyboard undo/redo");
  await editor().fill("");
  await expect(editor()).toBeVisible();
  await editor().fill("My corrected words. Total 27.30.");
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await expect(editor()).toHaveValue("My corrected words. Total 27.30.");
  await settled();
  await expect(
    page.getByRole("textbox", { name: "Current text", exact: true }),
  ).toHaveValue("My corrected words. Total 27.30.");
  await expect(
    page.getByRole("textbox", { name: "New result", exact: true }),
  ).toHaveValue(original);
  await page.screenshot({
    path: "test-results/comparison-v2.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Keep my text", exact: true }).click();
  await expect(editor()).toHaveValue("My corrected words. Total 27.30.");
  check("Reruns preserve edits and rejected results leave them intact");
  await run();
  await page
    .getByRole("button", { name: "Use new result", exact: true })
    .click();
  await expect(editor()).toHaveValue(original);
  await page.getByRole("button", { name: "Undo edit" }).click();
  await expect(editor()).toHaveValue("My corrected words. Total 27.30.");
  await page.getByRole("button", { name: "Redo edit" }).click();
  check("Accepted reruns are undoable");
  await page.getByLabel("Output format").selectOption("paragraphs");
  await expect(
    page.getByRole("textbox", { name: "Current text", exact: true }),
  ).toHaveValue(original);
  const paragraphs = await page
    .getByRole("textbox", { name: "New result", exact: true })
    .inputValue();
  assert.ok(paragraphs.split("\n").length < original.split("\n").length);
  await page
    .getByRole("button", { name: "Use new result", exact: true })
    .click();
  await expect(editor()).toHaveValue(paragraphs);
  await page.getByRole("button", { name: "Undo edit" }).click();
  await expect(editor()).toHaveValue(original);
  await expect(page.getByLabel("Output format")).toHaveValue("preserve");
  check("Output cleanup previews changes and undo restores formatting");
  await page.getByLabel("Output format").selectOption("numbers");
  await settled();
  await page.getByRole("button", { name: "Keep my text", exact: true }).click();
  await expect(page.getByLabel("Output format")).toHaveValue("preserve");
  await run();
  await expect(
    page.getByRole("textbox", { name: "New result", exact: true }),
  ).toHaveValue(/Good ideas/);
  await page
    .getByRole("button", { name: "Use new result", exact: true })
    .click();
  check("Declining numbers-only restores the original recognition mode");
  await page.getByRole("button", { name: "Clear image and result" }).click();
  await page
    .getByRole("button", { name: "Use Receipt preset", exact: true })
    .click();
  await page.getByRole("button", { name: "A receipt", exact: false }).click();
  await settled();
  const receipt = await editor().inputValue();
  await mkdir("test-results/benchmark-fixtures", { recursive: true });
  const receiptImage = await page
    .locator(".viewer-image img")
    .getAttribute("src");
  await writeFile(
    "test-results/benchmark-fixtures/receipt.png",
    Buffer.from(receiptImage.split(",")[1], "base64"),
  );
  await writeFile(
    "test-results/benchmark-fixtures/receipt.txt",
    "THE CORNER STORE\n12 Garden Street\n03 NOV 2026 10:42\n--------------------------------\nOat milk 4.50\nSourdough bread 6.00\nCoffee beans 12.00\nApples 3.50\n--------------------------------\nSUBTOTAL 26.00\nTAX 1.30\nTOTAL 27.30\nThank you for shopping local!",
  );
  const flags = await page.locator(".text-mirror mark").count();
  assert.ok(flags > 0, "Receipt should exercise flagged words");
  await page.locator(".review-summary").click();
  await expect(
    page.getByRole("region", { name: "Review selected word" }),
  ).toBeVisible();
  await expect(page.locator(".word-box")).toBeVisible();
  await expect
    .poll(() => page.locator(".word-crop canvas").evaluate((el) => el.width))
    .toBeGreaterThan(0);
  const first = await page.getByLabel("Correct this word").inputValue();
  const firstSelected = await page
    .locator(".review-chips .selected")
    .getAttribute("aria-label");
  await page.getByRole("button", { name: "Next uncertain word" }).click();
  assert.notEqual(
    await page.locator(".review-chips .selected").getAttribute("aria-label"),
    firstSelected,
  );
  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page.getByLabel("Correct this word")).toHaveValue(first);
  await page.getByLabel("Correct this word").fill("CORRECTED");
  await page.getByRole("button", { name: "Apply correction" }).click();
  await expect(editor()).toHaveValue(/CORRECTED/);
  await page.getByRole("button", { name: "Undo edit" }).click();
  await expect(editor()).toHaveValue(receipt);
  check(
    "Word review shows source crop and bounding box, navigates and undoes corrections",
  );
  await page.getByRole("button", { name: /^Check numbers/ }).click();
  const numericCount = await page.locator(".review-chips button").count();
  assert.ok(numericCount > flags, "Numbers includes high-confidence amounts");
  await page.getByRole("button", { name: "Looks right" }).click();
  await expect(page.locator(".review-chips button")).toHaveCount(
    numericCount - 1,
  );
  await page.screenshot({ path: "test-results/review-v2.png", fullPage: true });
  check("Separate numeric review includes high-confidence amounts");
  await page.getByRole("button", { name: "Original", exact: true }).click();
  const oldImage = await page.locator(".viewer-image img").getAttribute("src");
  await page.getByRole("button", { name: "Rotate image clockwise" }).click();
  await settled();
  await page
    .getByRole("button", { name: "Use new result", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await page.locator(".viewer-image img").getAttribute("src")) !==
        oldImage,
    )
    .toBe(true);
  await page.getByRole("button", { name: "Undo edit" }).click();
  await expect(editor()).toHaveValue(receipt);
  await expect(page.locator(".viewer-image img")).toHaveAttribute(
    "src",
    oldImage,
  );
  check("Undo restores the matching image and text after rotation");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".mobile-actions")).toBeVisible();
  await page
    .locator(".mobile-actions")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Reading settings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close settings panel" }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  assert.ok(
    await page.evaluate(
      () => !!document.activeElement?.closest(".settings-sheet"),
    ),
  );
  await page.screenshot({
    path: "test-results/mobile-settings-v2.png",
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-sheet")).toHaveCount(0);
  await page
    .locator(".mobile-actions")
    .getByRole("button", { name: "Copy text" })
    .click();
  assert.equal(
    (await page.evaluate(() => navigator.clipboard.readText())).replace(
      /\r\n/g,
      "\n",
    ),
    receipt,
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/mobile-workspace-v2.png",
    fullPage: true,
  });
  check(
    "Mobile settings sheet traps focus, closes with Escape, and sticky copy works without overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Force cancellation in the asynchronous image-encoding window, not merely
  // before processing starts, to guard against a terminated-worker race.
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    window.__pendingEncodes = 0;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      window.__pendingEncodes++;
      return original.call(
        this,
        (blob) =>
          setTimeout(() => {
            window.__pendingEncodes--;
            callback(blob);
          }, 400),
        ...args,
      );
    };
  });
  await page.getByRole("button", { name: "Run again", exact: true }).click();
  await page.waitForFunction(() => window.__pendingEncodes > 0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor()).toHaveValue(receipt);
  await run();
  await page.getByRole("button", { name: "Keep my text", exact: true }).click();
  check(
    "Cancel during image encoding preserves edits and the reader can rerun afterwards",
  );
  assert.deepEqual(errors, []);
  check("No browser runtime errors");
  await writeFile(
    "test-results/workspace-smoke.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/workspace-failure.png",
    fullPage: true,
  });
  console.error(error);
  console.error((await page.locator("body").innerText()).slice(-6000));
  process.exitCode = 1;
} finally {
  await browser.close();
}
