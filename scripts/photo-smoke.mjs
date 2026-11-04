import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { score } from "./accuracy-metrics.mjs";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".sites-runtime/browsers");
const { chromium, firefox, webkit, expect } = await import("@playwright/test");
const corpus = JSON.parse(await readFile("benchmarks/corpus.json", "utf8"));
const item = corpus.cases.find(x => x.id === "low-quality-05"), truth = await readFile(item.truth, "utf8");
const origin = process.env.LETTRA_URL || "http://127.0.0.1:3000", reports = [];
await mkdir("test-results/photo-smoke", { recursive: true });
const settled = page => page.waitForFunction(() => !document.querySelector(".working-state,.rerun-progress") && document.querySelector(".text-editor,.result-comparison,.error-banner"), {}, { timeout: 180000 });
for (const [name, engine] of [["chromium", chromium], ["firefox", firefox], ["webkit", webkit]]) {
 if(process.env.LETTRA_ENGINES && !process.env.LETTRA_ENGINES.split(',').includes(name))continue;
 const report = { engine: name, physicalPhone: false, checks: [], errors: [], external: [] };
 const browser = await engine.launch({ headless: true, ...(name === "chromium" ? {channel:"chrome"} : {}) });
 const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }), page = await context.newPage();
 page.on("pageerror", e => report.errors.push(e.message));
 context.on("request", r => { if(/^https?:/.test(r.url()) && new URL(r.url()).origin !== origin)report.external.push(r.url()); });
 try {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Choose an image", { exact:true }).setInputFiles(resolve(item.image));
  await page.waitForFunction(() => document.querySelector(".working-state"));
  await settled(page);
  assert.equal(await page.locator(".error-banner").count(), 0);
  const editor = page.getByRole("textbox", {name:"Editable extracted text",exact:true}), value = await editor.inputValue();
  assert.ok(value.length > 1000, "Oblique photograph should recover substantial text");
  report.metrics = score(truth, value); report.checks.push("Oblique photo orientation and local OCR");
  await page.locator(".review-summary").click();
  await expect(page.locator(".word-box")).toBeVisible();
  const image = await page.locator(".viewer-image img").evaluate(img => ({width:img.naturalWidth,height:img.naturalHeight}));
  assert.ok(image.width > 0 && image.height > 0);
  report.image = image; report.checks.push("Corrected image and word review overlay");
  await page.getByRole("button", {name:"Close word review",exact:true}).click();
  await editor.fill("My photo correction.");
  await page.getByRole("button", {name:"Undo edit"}).click();
  await expect(editor).toHaveValue(value); report.checks.push("Editing and undo after photo correction");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  report.checks.push("No mobile-width overflow");
  await page.screenshot({path:`test-results/photo-smoke/${name}.png`,fullPage:true});
  if(name === "chromium") {
   await context.setOffline(true);
   await page.getByRole("button", {name:"Run again",exact:true}).click();
   await page.waitForFunction(() => document.querySelector(".rerun-progress"));
   await settled(page);
   await expect(page.getByRole("textbox", {name:"New result",exact:true})).toHaveValue(value);
   await page.getByRole("button", {name:"Keep my text",exact:true}).click();
   await expect(editor).toHaveValue(value);report.checks.push("Offline photo reread and comparison preserve text");
  }
  assert.equal(report.errors.length, 0); assert.equal(report.external.length, 0);report.status="passed";
 } catch(error) {report.status="failed";report.errors.push(error.message);await page.screenshot({path:`test-results/photo-smoke/${name}-failure.png`,fullPage:true}).catch(()=>{});}
 finally {await browser.close();reports.push(report);console.log(JSON.stringify(report));await writeFile("test-results/photo-smoke/results.json",JSON.stringify(reports,null,2));}
}
if(reports.some(r=>r.status!=="passed"))process.exitCode=1;
