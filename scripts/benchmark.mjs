import { chromium } from "@playwright/test";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, basename } from "node:path";
const folder = process.argv[2];
if (!folder) {
  console.error(
    "Usage: npm run benchmark -- <folder-with-images-and-matching-txt> [output.csv]",
  );
  process.exit(1);
}
export function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length];
}
const csv = (value) => '"' + String(value).replaceAll('"', '""') + '"';
const files = (await readdir(folder)).filter((f) =>
  /\.(png|jpe?g|webp|bmp|gif)$/i.test(f),
);
if (!files.length)
  throw new Error(
    "No benchmark images found. Each image requires a matching .txt ground truth.",
  );
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const rows = [
  ["image", "preset", "CER", "WER", "seconds", "confidence", "status"],
];
const normalize = (text) => text.trim().replace(/\s+/g, " ");
try {
  await page.goto(process.env.LETTRA_URL || "http://127.0.0.1:3000");
  await page.getByRole("button", { name: /Improve your result/ }).click();
  for (const filename of files) {
    const truth = normalize(
      await readFile(
        resolve(folder, basename(filename, extname(filename)) + ".txt"),
        "utf8",
      ),
    );
    for (const preset of [
      "Auto",
      "Screenshot",
      "Document",
      "Dark mode",
      "Receipt",
    ]) {
      await page.getByRole("button", { name: preset, exact: true }).click();
      const start = performance.now();
      await page
        .getByLabel("Choose an image", { exact: true })
        .setInputFiles(resolve(folder, filename));
      await page.waitForFunction(
        () =>
          document.querySelector("textarea") ||
          document.querySelector(".no-text") ||
          document.querySelector(".error-banner"),
        {},
        { timeout: 180000 },
      );
      const error = (await page.locator(".error-banner").count())
        ? await page.locator(".error-banner").textContent()
        : null;
      const text = normalize(
        (await page.locator("textarea").count())
          ? await page.locator("textarea").inputValue()
          : "",
      );
      const words = truth.split(/\s+/),
        actual = text ? text.split(/\s+/) : [];
      rows.push([
        filename,
        preset,
        distance([...truth], [...text]) / Math.max(1, [...truth].length),
        distance(words, actual) / Math.max(1, words.length),
        ((performance.now() - start) / 1000).toFixed(3),
        await page
          .locator(".confidence")
          .textContent()
          .catch(() => ""),
        error || "ok",
      ]);
      console.log(filename, preset, rows.at(-1).slice(2, 5).join(", "));
      await page
        .getByRole("button", { name: "Clear image and result" })
        .click();
    }
  }
} finally {
  await browser.close();
  await mkdir("test-results", { recursive: true });
  await writeFile(
    process.argv[3] || "test-results/benchmark.csv",
    rows.map((row) => row.map(csv).join(",")).join("\n"),
  );
}
