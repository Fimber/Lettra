import { chromium } from "@playwright/test";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { score, summarize } from "./accuracy-metrics.mjs";
const manifestPath = process.argv[2] || "benchmarks/corpus.json";
const output = process.argv[3] || "test-results/accuracy";
const variants = (
  process.env.LETTRA_VARIANTS || "Auto,Screenshot,Document,Dark mode,Receipt"
).split(",");
const corpus = JSON.parse(await readFile(manifestPath, "utf8"));
const cases = Array.isArray(corpus)
  ? corpus
  : (corpus.cases ?? corpus.fixtures);
if (!Array.isArray(cases))
  throw new Error("Manifest must contain cases or fixtures");
const selected = process.env.LETTRA_CASES
  ? cases.filter((c) => process.env.LETTRA_CASES.split(",").includes(c.id))
  : cases;
await mkdir(output, { recursive: true });
for (const item of selected)
  for (const key of ["image", "truth"]) {
    const hash = createHash("sha256")
      .update(await readFile(item[key]))
      .digest("hex");
    const expected =
      item[`${key}Sha256`] ?? (key === "truth" ? item.transcriptSha256 : null);
    if (expected && hash !== expected)
      throw new Error(`Corpus changed: ${item.id}/${key}`);
  }
const origin = process.env.LETTRA_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const errors = [],
  external = [],
  rows = [];
page.on("pageerror", (e) => errors.push(e.message));
context.on("request", (r) => {
  const u = new URL(r.url());
  if (/^https?:$/.test(u.protocol) && u.origin !== new URL(origin).origin)
    external.push(r.url());
});
let commit = "unknown";
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {}
const metadata = {
  startedAt: new Date().toISOString(),
  commit,
  commitNote:
    "Checkout HEAD at run time; servedBuild hashes identify the tested export, including uncommitted builds.",
  browser: browser.version(),
  platform: process.platform,
  origin,
  servedBuild: {
    photoAnalysisSha256: createHash("sha256")
      .update(Buffer.from(await (await fetch(`${origin}/photo-analysis.js`)).arrayBuffer()))
      .digest("hex"),
    indexSha256: createHash("sha256")
      .update(Buffer.from(await (await fetch(origin)).arrayBuffer()))
      .digest("hex"),
    processorSha256: createHash("sha256")
      .update(
        Buffer.from(
          await (await fetch(`${origin}/preprocess.worker.js`)).arrayBuffer(),
        ),
      )
      .digest("hex"),
  },
  manifestPath,
  manifestSha256: createHash("sha256")
    .update(await readFile(manifestPath))
    .digest("hex"),
  variants,
  images: selected.length,
  execution: "serial, real app UI on desktop Chrome; not a physical-phone test",
  normalization:
    "Unicode NFC and whitespace collapse; case and punctuation preserved; case-folded CER additionally reported",
};
await writeFile(`${output}/metadata.json`, JSON.stringify(metadata, null, 2));
await writeFile(`${output}/results.jsonl`, "");
try {
  await page.goto(origin);
  for (const item of selected)
    for (const variant of variants) {
      const preset =
        variant === "Best" || variant === "Original" ? "Auto" : variant;
      if (!(await page.locator(".settings-sheet").count()))
        await page.locator(".settings-shortcut").click();
      await page.getByLabel("Recognition language").selectOption(item.lang);
      await page
        .locator(".settings-sheet")
        .getByRole("button", { name: preset, exact: true })
        .click();
      await page
        .getByLabel("Accuracy", { exact: true })
        .selectOption(variant === "Best" ? "best" : "fast");
      await page
        .getByRole("checkbox", { name: "Use original image", exact: true })
        .setChecked(variant === "Original");
      const started = performance.now();
      let raw = "",
        status = "ok",
        readerScore = null;
      try {
        await page
          .getByLabel("Choose an image", { exact: true })
          .setInputFiles(resolve(item.image));
        await page.waitForFunction(
          () =>
            document.querySelector(
              ".working-state,.rerun-progress,.result-comparison,.error-banner",
            ),
          {},
          { timeout: 30000 },
        );
        await page.waitForFunction(
          () =>
            !document.querySelector(".working-state,.rerun-progress") &&
            document.querySelector(
              ".text-editor,.no-text,.error-banner,.result-comparison",
            ),
          {},
          { timeout: 180000 },
        );
        if (await page.locator(".error-banner").count())
          throw new Error(await page.locator(".error-banner").innerText());
        if (await page.locator(".result-comparison").count()) {
          raw = await page
            .getByRole("textbox", { name: "New result", exact: true })
            .inputValue();
          await page
            .getByRole("button", { name: "Use new result", exact: true })
            .click();
        } else if (
          await page
            .getByRole("textbox", {
              name: "Editable extracted text",
              exact: true,
            })
            .count()
        )
          raw = await page
            .getByRole("textbox", {
              name: "Editable extracted text",
              exact: true,
            })
            .inputValue();
        const label = await page.locator(".review-summary span").innerText();
        readerScore = Number(label.match(/([\d.]+)%/)?.[1] ?? NaN);
      } catch (e) {
        status = e.message;
        await page.screenshot({
          path: `${output}/${item.id}-${variant.replaceAll(" ", "-")}-failure.png`,
          fullPage: true,
        });
      }
      const seconds = (performance.now() - started) / 1000;
      const truth = await readFile(item.truth, "utf8"),
        metrics = score(truth, raw);
      const row = {
        id: item.id,
        category: item.category,
        lang: item.lang,
        variant,
        seconds,
        readerScore,
        status,
        metrics,
      };
      rows.push(row);
      await writeFile(
        `${output}/${item.id}-${variant.replaceAll(" ", "-")}.txt`,
        raw,
      );
      await appendFile(`${output}/results.jsonl`, JSON.stringify(row) + "\n");
      console.log(
        `${rows.length}/${selected.length * variants.length} ${item.id} ${variant} CER ${(metrics.cer * 100).toFixed(2)}% WER ${(metrics.wer * 100).toFixed(2)}% ${seconds.toFixed(2)}s ${status}`,
      );
      if (status !== "ok") {
        const clear = page.getByRole("button", {
          name: "Clear image and result",
        });
        if (await clear.isEnabled()) await clear.click();
        else if (
          await page.getByRole("button", { name: "Dismiss error" }).count()
        )
          await page.getByRole("button", { name: "Dismiss error" }).click();
      }
    }
} finally {
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify(
      {
        metadata: { ...metadata, finishedAt: new Date().toISOString() },
        groups: summarize(rows),
        errors,
        external,
      },
      null,
      2,
    ),
  );
  const columns = [
    "id",
    "category",
    "lang",
    "variant",
    "status",
    "seconds",
    "readerScore",
    "cer",
    "wer",
    "casefoldCER",
    "numberErrorRate",
    "numbersExact",
  ];
  const csv = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
  await writeFile(
    `${output}/results.csv`,
    [columns, ...rows.map((r) => columns.map((k) => r[k] ?? r.metrics[k]))]
      .map((r) => r.map(csv).join(","))
      .join("\n"),
  );
  await browser.close();
}
if (errors.length || external.length || rows.some((r) => r.status !== "ok"))
  process.exitCode = 1;
