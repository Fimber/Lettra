import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(".sites-runtime/browsers");
const { chromium, firefox, webkit, expect } = await import("@playwright/test");
const reports = [];
await mkdir("test-results/device-check", { recursive: true });
for (const [name, engine] of [
  ["chrome", chromium],
  ["firefox", firefox],
  ["webkit", webkit],
]) {
  if (
    process.env.LETTRA_ENGINES &&
    !process.env.LETTRA_ENGINES.split(",").includes(name)
  )
    continue;
  const browser = await engine.launch({
    headless: true,
    ...(name === "chrome" ? { channel: "chrome" } : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.text().startsWith("DEVICE")) console.log(name, m.text());
  });
  try {
    await page.goto(
      `${process.env.LETTRA_URL || "http://127.0.0.1:3000"}/device-check/`,
      { waitUntil: "domcontentloaded", timeout: 60000 },
    );
    await page.waitForFunction(
      () => document.querySelector("select")?.value !== "unknown",
    );
    await expect(
      page.getByLabel("I am running this on a physical phone."),
    ).not.toBeChecked();
    await page.evaluate(() => {
      let last = "";
      const status = document.querySelector('[role="status"]');
      new MutationObserver(() => {
        const label = status.textContent.replace(/\d+%/, "%");
        if (label !== last) {
          last = label;
          console.log("DEVICE", label);
        }
      }).observe(status, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
    await page
      .getByRole("button", { name: "Run device checks", exact: true })
      .click();
    // Poll the DOM while status/results update, rather than repeatedly asking
    // the browser accessibility tree to resolve the same live region.
    await page.waitForFunction(
      () => {
        const button = [...document.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === "Download device report",
        );
        return button && !button.disabled;
      },
      {},
      { timeout: 180000 },
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download device report" }).click(),
    ]);
    const path = `test-results/device-check/${name}.json`;
    await download.saveAs(path);
    const report = JSON.parse(await readFile(path, "utf8"));
    if (
      report.hardware.physicalPhoneSelfReported ||
      Object.keys(report.handsOn).length
    )
      throw Error("Unperformed phone checks were marked complete");
    if (report.checks.some((c) => c.status === "fail"))
      throw Error(
        JSON.stringify(report.checks.filter((c) => c.status === "fail")),
      );
    if (
      !(await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ))
    )
      throw Error("Mobile-width overflow");
    await page.screenshot({
      path: `test-results/device-check/${name}.png`,
      fullPage: true,
    });
    reports.push({
      name,
      status: errors.length ? "failed" : "passed",
      version: browser.version(),
      physicalPhone: false,
      checks: report.checks.length,
      errors,
    });
  } catch (e) {
    await writeFile(
      `test-results/device-check/${name}-failure.txt`,
      await page
        .locator("body")
        .innerText({ timeout: 10000 })
        .catch(() => "Browser page unresponsive"),
    );
    await page
      .screenshot({
        path: `test-results/device-check/${name}-failure.png`,
        fullPage: true,
        timeout: 10000,
      })
      .catch(() => {});
    reports.push({
      name,
      status: "failed",
      physicalPhone: false,
      errors: [...errors, e.message],
    });
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(reports.at(-1)));
  await writeFile(
    "test-results/device-check/summary.json",
    JSON.stringify(reports, null, 2),
  );
}
if (reports.some((r) => r.status !== "passed")) process.exitCode = 1;
