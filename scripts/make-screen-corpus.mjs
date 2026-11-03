import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourcePath = resolve(root, "benchmarks/screens-source.json");
const output = resolve(root, "benchmark-data/screens");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const sha256 = data => createHash("sha256").update(data).digest("hex");
const escape = text => String(text).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const normalize = text => text.normalize("NFC").trim().replace(/\s+/g, " ");
const expectedCounts = { clean_screenshots: 10, dark_screenshots: 5, signs_posters_slides: 7, non_english: 5 };
const counts = Object.fromEntries(Object.keys(expectedCounts).map(category => [category, source.fixtures.filter(item => item.category === category).length]));
if (JSON.stringify(counts) !== JSON.stringify(expectedCounts) || source.fixtures.length !== 27) throw new Error("Expected exactly 27 fixtures with the declared category counts.");

function documentHTML(item) {
  const dark = item.category === "dark_screenshots";
  const slide = item.template === "slide" || item.template === "poster";
  const code = item.template === "code" || item.template === "table";
  const body = code ? `<pre class="content">${escape(item.text)}</pre>` : `<div class="content">${item.text.split("\n\n").map(text => `<p>${escape(text).replaceAll("\n", "<br>")}</p>`).join("")}</div>`;
  return `<!doctype html><html lang="${item.lang}"><meta charset="utf-8"><title>${escape(item.id)}</title><style>
    *{box-sizing:border-box}html,body{margin:0;width:100%;min-height:100%;}body{background:${dark ? "#101820" : slide ? "#dce6dd" : "#e9edf0"};padding:${slide ? "42px" : "46px 72px"};color:${dark ? "#eff3f7" : "#15242b"};font-family:${escape(item.font)},sans-serif;}
    article{max-width:${item.template === "document" ? "1050" : "1300"}px;margin:auto;background:${dark ? "#17232e" : slide ? "#fcfdf9" : "#fff"};border:1px solid ${dark ? "#334351" : "#d7dfe2"};border-radius:${slide ? "0" : "9"}px;padding:${slide ? "42px 56px" : "34px 44px"};box-shadow:0 3px 12px #00152612;}
    h1{font-family:${escape(item.font)},sans-serif;font-weight:${item.font === "Georgia" ? "normal" : "600"};font-size:${slide ? "48" : "30"}px;line-height:1.16;margin:0 0 14px;color:${dark ? "#f7fbff" : "#193f39"};}
    .subtitle{font-family:Arial,sans-serif;font-size:${slide ? "22" : "16"}px;line-height:1.4;color:${dark ? "#b2c7d8" : "#45606b"};margin:0 0 24px;padding-bottom:18px;border-bottom:1px solid ${dark ? "#384957" : "#dce5e5"};}
    .content{font-family:${escape(item.font)},sans-serif;font-size:${item.size}px;line-height:${code ? "1.45" : slide ? "1.38" : "1.55"};margin:0;white-space:${code ? "pre-wrap" : "normal"};word-break:normal;overflow-wrap:normal;}
    .content p{margin:0 0 ${slide ? "18" : "23"}px;}.content p:last-child{margin-bottom:0;}
    ${item.template === "chat" ? `.content p{padding:15px 18px;background:${dark ? "#223949" : "#edf4f4"};border-radius:8px;}.content p:nth-child(even){background:${dark ? "#293248" : "#f3f0fa"};margin-left:60px;}` : ""}
    ${item.template === "poster" ? "article{text-align:center;}h1{letter-spacing:.2px;}" : ""}
  </style><article><h1>${escape(item.title)}</h1><div class="subtitle">${escape(item.subtitle)}</div>${body}</article></html>`;
}

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const manifest = [];
try {
  for (const item of source.fixtures) {
    const page = await browser.newPage({ viewport: { width: item.width, height: item.height }, deviceScaleFactor: 1 });
    const requests = [];
    page.on("request", request => requests.push(request.url()));
    await page.setContent(documentHTML(item));
    await page.evaluate(() => document.fonts.ready);
    const text = [item.title, item.subtitle, item.text].join("\n\n").normalize("NFC") + "\n";
    const visible = await page.locator("article").innerText();
    if (normalize(visible) !== normalize(text)) throw new Error(`${item.id}: rendered text differs from independent source transcript`);
    const bounds = await page.locator("article").boundingBox();
    if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > item.width || bounds.y + bounds.height > item.height) throw new Error(`${item.id}: text exceeds the screenshot bounds (${JSON.stringify(bounds)})`);
    if (requests.length) throw new Error(`${item.id}: an external resource was requested`);
    const png = await page.screenshot({ path: resolve(output, item.id + ".png"), fullPage: false });
    await writeFile(resolve(output, item.id + ".txt"), text);
    await writeFile(resolve(output, item.id + ".html"), documentHTML(item));
    manifest.push({ id: item.id, category: item.category, lang: item.lang, image: relative(root, resolve(output, item.id + ".png")).replaceAll("\\", "/"), truth: relative(root, resolve(output, item.id + ".txt")).replaceAll("\\", "/"), source: "benchmarks/screens-source.json", sourceKind: item.category === "signs_posters_slides" ? "controlled_browser_slide_or_poster" : "controlled_browser_screenshot", template: item.template, width: item.width, height: item.height, font: item.font, fontSize: item.size, imageSha256: sha256(png), transcriptSha256: sha256(text), referenceMethod: "Independently authored source text, NFC encoded; checked against the DOM and screenshot bounds. No OCR-derived ground truth." });
    console.log(`Created ${item.id}`);
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(resolve(output, "manifest.json"), JSON.stringify({ version: source.version, generatedAt: new Date().toISOString(), browser: "Installed Chrome / Playwright", counts, sourceSha256: sha256(await readFile(sourcePath)), provenance: source.provenance, limits: source.limits, fixtures: manifest }, null, 2));
console.log(JSON.stringify({ total: manifest.length, counts, manifest: resolve(output, "manifest.json") }));
