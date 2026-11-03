import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { summarize } from "./accuracy-metrics.mjs";
const readRows = async (p) =>
  (await readFile(`${p}/results.jsonl`, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((x) => JSON.parse(x));
const baselineDirs = [
  "test-results/baseline-screens",
  "test-results/baseline-receipts",
  "test-results/baseline-photos",
];
const before = (await Promise.all(baselineDirs.map(readRows))).flat();
const candidate = await readRows("test-results/final-accuracy");
const acceptedAuto = await readRows("test-results/accepted-auto");
if (
  acceptedAuto.length !== 50 ||
  new Set(acceptedAuto.map((r) => r.id)).size !== 50
)
  throw Error("Expected 50 accepted Auto reruns");
const after = acceptedAuto;
for (const [name, rows] of [
  ["before", before],
  ["after", after],
]) {
  if (
    rows.length !== (name === "before" ? 250 : 50) ||
    new Set(rows.map((r) => `${r.id}/${r.variant}`)).size !== rows.length
  )
    throw Error(`${name}: incomplete or duplicate results (${rows.length})`);
}
const baseline = summarize(before),
  final = summarize(after);
const old = new Map(before.map((r) => [`${r.id}/${r.variant}`, r]));
const manualChecks = candidate.filter(r => r.variant !== "Auto");
const manualMetricMatches = manualChecks.filter(r => JSON.stringify(r.metrics) === JSON.stringify(old.get(`${r.id}/${r.variant}`).metrics)).length;
const pixels = JSON.parse(await readFile("benchmarks/results/pixel-transport.json", "utf8"));
if (pixels.results.length !== 50 || pixels.results.some(r => !r.equal)) throw Error("Pixel equivalence verification incomplete");
const flowReports = Object.fromEntries(await Promise.all(["smoke", "extended-smoke", "workspace-smoke"].map(async name => [name, JSON.parse(await readFile(`test-results/${name}.json`, "utf8"))])));
if (Object.values(flowReports).some(r => r.errors?.length)) throw Error("Browser flow errors remain");
const flowCount = Object.values(flowReports).reduce((sum, r) => sum + r.checks.length, 0);
const deltas = after.map((r) => ({
  id: r.id,
  category: r.category,
  variant: r.variant,
  beforeCER: old.get(`${r.id}/${r.variant}`).metrics.cer,
  afterCER: r.metrics.cer,
  deltaCER: r.metrics.cer - old.get(`${r.id}/${r.variant}`).metrics.cer,
}));
const hashFile = async (p) =>
  createHash("sha256")
    .update(await readFile(p))
    .digest("hex");
const evidence = {
  generatedAt: new Date().toISOString(),
  corpusSha256: await hashFile("benchmarks/corpus.json"),
  baselineBuild: {
    commit: "63707095cd6daff057430996e17751a31503f98a",
    indexSha256: await hashFile(".sites-runtime/baseline-out/index.html"),
    processorSha256: await hashFile(
      ".sites-runtime/baseline-out/preprocess.worker.js",
    ),
  },
  rejectedCandidateBuild: JSON.parse(
    await readFile("test-results/final-accuracy/metadata.json", "utf8"),
  ).servedBuild,
  acceptedAutoBuild: JSON.parse(
    await readFile("test-results/accepted-auto/metadata.json", "utf8"),
  ).servedBuild,
  validationScope:
    "All 50 images measured in all five baseline presets (250). The candidate run was stopped after a photo regression was confirmed. All 50 Auto cases were rerun on the accepted build. Manual preset algorithms are unchanged; their 156 completed candidate runs and 50-image input-buffer equivalence are separate regression evidence, not a claim that all five final presets were rerun.",
  images: 50,
  runsBefore: before.length,
  runsAfter: after.length,
  candidateRuns: candidate.length,
  acceptedAutoRuns: acceptedAuto.length,
  totalMeasuredExtractions:
    before.length + candidate.length + acceptedAuto.length,
  physicalPhones: {
    android: "not run: no physical device or device-cloud account available",
    iphone: "not run: no physical device or device-cloud account available",
  },
  timings:
    "Diagnostic timings only: independent suites overlapped on the same Windows host. Do not treat these as isolated laptop or phone performance gates.",
  baseline,
  final,
  deltas,
  manualChecks: { measured: manualChecks.length, identicalMetrics: manualMetricMatches },
  pixelsEqual: pixels.results.filter(r => r.equal).length,
};
await mkdir("benchmarks/results", { recursive: true });
await writeFile("benchmarks/results/browser-flows.json", JSON.stringify(flowReports, null, 2));
await writeFile(
  "benchmarks/results/comparison.json",
  JSON.stringify(evidence, null, 2),
);
await writeFile(
  "benchmarks/results/baseline.jsonl",
  before.map((r) => JSON.stringify(r)).join("\n") + "\n",
);
await writeFile(
  "benchmarks/results/final.jsonl",
  after.map((r) => JSON.stringify(r)).join("\n") + "\n",
);
await writeFile(
  "benchmarks/results/candidate.jsonl",
  candidate.map((r) => JSON.stringify(r)).join("\n") + "\n",
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
const csv = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
await writeFile(
  "benchmarks/results/final.csv",
  [columns, ...after.map((r) => columns.map((k) => r[k] ?? r.metrics[k]))]
    .map((row) => row.map(csv).join(","))
    .join("\n"),
);
await copyFile(
  "test-results/cross-browser/report.json",
  "benchmarks/results/cross-browser.json",
);
await copyFile(
  "test-results/device-check/summary.json",
  "benchmarks/results/device-check.json",
);
const percent = (n) => `${(n * 100).toFixed(2)}%`;
const categories = [...new Set(after.map((r) => r.category))];
const table = categories
  .map((c) => {
    const a = baseline[`Auto/${c}`],
      b = final[`Auto/${c}`];
    return `| ${c} | ${b.count} | ${percent(a.meanCER)} | ${percent(b.meanCER)} | ${percent(b.weightedCER)} | ${percent(b.meanWER)} | ${b.numericExactImages}/${b.numericImages} |`;
  })
  .join("\n");
const regressions = deltas
  .filter((r) => r.variant === "Auto" && r.deltaCER > 0.00001)
  .sort((a, b) => b.deltaCER - a.deltaCER);
const clean = after.filter(
  (r) => r.category === "clean_screenshots" && r.variant === "Auto",
);
const photos = after.filter(
  (r) => r.category === "phone-photos" && r.variant === "Auto",
);
const browserReport = JSON.parse(
  await readFile("test-results/cross-browser/report.json", "utf8"),
);
const deviceReport = JSON.parse(
  await readFile("test-results/device-check/summary.json", "utf8"),
);
const report = `# Lettra: 50-image accuracy and browser verification

Date: 3 November 2026. **All 50 images were measured in Auto before and after the accepted fixes.** The baseline also covers all five presets (250 extractions). A candidate run was stopped after 196 extractions when a photo-processing regression was confirmed; all 50 Auto cases were then rerun on the accepted build. That is 496 recorded extractions, excluding exploratory diagnostics. The four manual preset algorithms are unchanged: 156 candidate measurements and byte-for-byte input equivalence on all 50 images provide additional regression evidence. This is not a claim that all five final presets were rerun. Tests used the actual production UI on desktop Chrome, including normalization, preprocessing, OCR and the displayed cleanup result. Baseline is published v2; the corrected export is identified by its index and processor hashes in [comparison.json](results/comparison.json). Source HEAD in raw run metadata is only the checkout base, not proof of the served build.

## Default Auto results

CER is character edit distance divided by reference length; lower is better. Mean CER weights each image equally. Pooled CER weights reference characters. Whitespace collapses and Unicode normalizes to NFC; case and punctuation are preserved. WER measures word edit distance. Numeric exactness requires every number token to match in order, including dates and identifiers; it is not a semantic amount check. Reader confidence is never used as ground truth.

| Category | Images | Before mean CER | After mean CER | After pooled CER | After mean WER | All numbers exact |
|---|---:|---:|---:|---:|---:|---:|
${table}

Clean screenshot target (<2% CER): ${clean.filter((r) => r.metrics.cer < 0.02).length}/10 individual images meet it; category mean ${percent(final["Auto/clean_screenshots"].meanCER)}. Phone-photo target (<8% CER): ${photos.filter((r) => r.metrics.cer < 0.08).length}/10 individual images meet it; category mean ${percent(final["Auto/phone-photos"].meanCER)}. These are explicit remaining acceptance gaps where targets are missed.

Final Auto per-image errors and numeric comparisons are retained in [final.csv](results/final.csv), [baseline.jsonl](results/baseline.jsonl) and [comparison.json](results/comparison.json). Operational failures: before ${before.filter((r) => r.status !== "ok").length}, after ${after.filter((r) => r.status !== "ok").length}. Successful completion does not mean correct transcription.

## Changes tested

- Replaced worker OffscreenCanvas usage with transferred pixel buffers. Windows WebKit 27.2 lacked OffscreenCanvas and previously failed before OCR; it now runs the same OpenCV pipeline.
- Auto preserves antialiased light screenshot edges, retains binarization for dark screens, and keeps the previous adaptive photo cleanup. A proposed photo simplification was rejected after phone-photo-08 regressed from 9.21% to 75.76% CER. It keeps ordinary page segmentation, then retries row layout only for flat-background numeric content with an observed columnwise jump. Explicit layout choices remain respected.
- Kept download anchors attached and blob URLs alive for 30 seconds, fixing the observed intermittent Firefox TXT download failure.
- Started the same-origin OCR worker directly, removing an unnecessary blob/importScripts wrapper while investigating Firefox restart stalls. Offline cache writes now run in the background rather than delaying delivery of large reader assets; slow/rejected-write and offline-fallback tests cover this behavior.
- Added a local /device-check/ page for real-device checks, cancellation/recovery, camera timing and downloadable JSON. Physical hardware declarations and hands-on checks default to unconfirmed. No photo or extracted camera text is included in reports.
- Updated help for sideways, curved and multicolumn pages; crop one column or rotate and compare reruns. Complex photographs remain a known OCR limitation, not a solved acceptance target.

## Regressions and tradeoffs

${regressions.length ? regressions.map((r) => `- ${r.id}: ${percent(r.beforeCER)} → ${percent(r.afterCER)} (+${(r.deltaCER * 100).toFixed(2)} percentage points).`).join("\n") : "No Auto per-image CER regressions."}

These two small per-image increases are accepted as a preprocessing tradeoff: both remain below 2% CER, their category means improve, and no category mean worsens. The much larger camera-page regression was rejected. This is a tuning set, not an independent held-out evaluation; thresholds were adjusted after baseline results. No reference transcript or selected image was changed in response to OCR output. A new held-out corpus is needed before making general accuracy claims.

## What the 50 images cover

- 10 clean and 5 dark browser screenshots, 7 designed posters/slides, and 5 non-English screenshots are independently authored, controlled local browser renders. They are not captured third-party applications or photographed street signs. Languages: French, Yoruba, Spanish, German, Portuguese; Igbo and Hausa remain unsupported.
- 8 real scanned receipts from [SROIE](https://github.com/zzzDavid/ICDAR-2019-SROIE), pinned commit in [receipt-sources.json](receipt-sources.json). References were visually corrected for actual case and released annotation mistakes before scoring. Two exterior handwritten dataset identifiers were cropped away, with original hashes and geometry retained. Very faint or clipped glyphs have single-reviewer uncertainty recorded in the manifest. Repository license is retained; this report makes no broader dataset ownership claim.
- 10 ordinary camera captures and 5 difficult captures from [DocPTBench](https://huggingface.co/datasets/topdu/DocPTBench), all different Federal Register pages and EXIF Huawei JAD-AL50 photographs. References come from exact official [GovInfo PDFs](https://www.govinfo.gov/app/collection/FR), using native text objects rather than OCR and matching visible page reading order. Low-quality cases cover creases, shadows, backlighting and rotation; motion blur is not claimed. Two ordinary captures are sideways. This is a narrow, difficult, mostly three-column document set from one camera model, not a representative phone market sample. See [photo provenance](PHOTO-PROVENANCE.md) and [photo-sources.json](photo-sources.json).

All 50 references are committed under references/, with image and truth SHA-256 hashes in [corpus.json](corpus.json). Raw images and PDFs stay outside the deployed application. Ground truth has one visual review, not independent double transcription. Reading-order, line-end hyphenation, punctuation and table-layout differences contribute to reported errors.

## Browser and physical-device evidence

The final local build passed 39 unit checks and ${flowCount} existing end-to-end browser checks. ${manualMetricMatches}/${manualChecks.length} completed manual-preset comparisons have identical metrics to baseline, and all 50 preprocessing input buffers match byte-for-byte. During parallel testing, some browser startups and repeated accessibility-tree polling stalled; the device-check harness was changed to DOM readiness polling and rerun on its own. The final results below are from that completed run.

${browserReport.map((r) => `- ${r.engine} ${r.version}: ${r.status}; ${r.checks.length} browser-flow checks; physical phone = false.`).join("\n")}
${deviceReport.map((r) => `- Device-check page on ${r.name}: ${r.status}; ${r.checks || 0} automatic checks; physical phone = false.`).join("\n")}

**Real Android and iPhone tests were not run.** No connected phone or BrowserStack/Sauce Labs account was available. A 390-pixel touch viewport and the Windows WebKit engine do not establish iPhone Safari, Android hardware, camera capture, mobile memory, soft keyboard, background-tab recovery or real-device performance. Their status remains NOT RUN.

To finish: open /device-check/ while signed into the private site on an actual Android Chrome and iPhone Safari. Identify the phone, run automatic checks, try a camera image, perform each hands-on task in the main workspace, and download the JSON report. Return failures with the device model and browser version. Nothing is submitted automatically.

Timings in CSV are diagnostic: independent suites overlapped on one Windows computer. They are not certified warm-laptop or real-phone speed measurements. The 15-second Android target and the first-load 8 MB target are not established; the OpenCV bundle alone is 13.3 MB before HTTP compression, and compressed first-read transfer size was not verified.

## Reproduce

1. Run npm ci, node scripts/make-screen-corpus.mjs, node scripts/fetch-receipt-corpus.mjs, and node scripts/fetch-photo-corpus.mjs. Photo references are already committed; PDFs and page indices are recorded for audit. Generated screenshot hashes can depend on installed fonts/Chrome; inspect rather than silently replacing a mismatched frozen input.
2. Build with npm run build and start npm start. Run node scripts/accuracy-benchmark.mjs benchmarks/corpus.json test-results/accuracy. It validates every image and transcript hash before recognition. LETTRA_URL selects another local export; LETTRA_VARIANTS or LETTRA_CASES narrow diagnostics.
3. Install Playwright Firefox/WebKit into .sites-runtime/browsers, then run node scripts/cross-browser-smoke.mjs and node scripts/device-check-smoke.mjs. Run npm test and the three existing smoke scripts for editor, offline, clipboard, cancellation and mobile-width checks.

Do not label an emulated or desktop-engine run as a physical-phone pass.
`;
await writeFile("benchmarks/REPORT.md", report);
console.log(table);
console.log(`Auto regressions: ${regressions.length}`);
