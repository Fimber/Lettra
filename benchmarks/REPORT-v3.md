# Lettra: 50-image accuracy and browser verification

Date: 3 November 2026. **All 50 images were measured in Auto before and after the accepted fixes.** The baseline also covers all five presets (250 extractions). A candidate run was stopped after 196 extractions when a photo-processing regression was confirmed; all 50 Auto cases were then rerun on the accepted build. That is 496 recorded extractions, excluding exploratory diagnostics. The four manual preset algorithms are unchanged: 156 candidate measurements and byte-for-byte input equivalence on all 50 images provide additional regression evidence. This is not a claim that all five final presets were rerun. Tests used the actual production UI on desktop Chrome, including normalization, preprocessing, OCR and the displayed cleanup result. Baseline is published v2; the corrected export is identified by its index and processor hashes in [comparison.json](results/comparison.json). Source HEAD in raw run metadata is only the checkout base, not proof of the served build.

## Default Auto results

CER is character edit distance divided by reference length; lower is better. Mean CER weights each image equally. Pooled CER weights reference characters. Whitespace collapses and Unicode normalizes to NFC; case and punctuation are preserved. WER measures word edit distance. Numeric exactness requires every number token to match in order, including dates and identifiers; it is not a semantic amount check. Reader confidence is never used as ground truth.

| Category | Images | Before mean CER | After mean CER | After pooled CER | After mean WER | All numbers exact |
|---|---:|---:|---:|---:|---:|---:|
| clean_screenshots | 10 | 12.39% | 0.99% | 0.93% | 6.65% | 6/10 |
| dark_screenshots | 5 | 0.77% | 0.66% | 0.70% | 4.82% | 4/5 |
| signs_posters_slides | 7 | 0.07% | 0.07% | 0.07% | 0.40% | 6/6 |
| non_english | 5 | 1.69% | 1.57% | 1.22% | 4.49% | 4/4 |
| receipts | 8 | 13.21% | 12.74% | 13.23% | 37.58% | 0/8 |
| phone-photos | 10 | 59.65% | 59.65% | 59.29% | 77.85% | 0/10 |
| low-quality | 5 | 77.23% | 77.23% | 76.39% | 91.41% | 0/5 |

Clean screenshot target (<2% CER): 8/10 individual images meet it; category mean 0.99%. Phone-photo target (<8% CER): 0/10 individual images meet it; category mean 59.65%. These are explicit remaining acceptance gaps where targets are missed.

Final Auto per-image errors and numeric comparisons are retained in [final.csv](results/final.csv), [baseline.jsonl](results/baseline.jsonl) and [comparison.json](results/comparison.json). Operational failures: before 0, after 0. Successful completion does not mean correct transcription.

## Changes tested

- Replaced worker OffscreenCanvas usage with transferred pixel buffers. Windows WebKit 27.2 lacked OffscreenCanvas and previously failed before OCR; it now runs the same OpenCV pipeline.
- Auto preserves antialiased light screenshot edges, retains binarization for dark screens, and keeps the previous adaptive photo cleanup. A proposed photo simplification was rejected after phone-photo-08 regressed from 9.21% to 75.76% CER. It keeps ordinary page segmentation, then retries row layout only for flat-background numeric content with an observed columnwise jump. Explicit layout choices remain respected.
- Kept download anchors attached and blob URLs alive for 30 seconds, fixing the observed intermittent Firefox TXT download failure.
- Started the same-origin OCR worker directly, removing an unnecessary blob/importScripts wrapper while investigating Firefox restart stalls. Offline cache writes now run in the background rather than delaying delivery of large reader assets; slow/rejected-write and offline-fallback tests cover this behavior.
- Added a local /device-check/ page for real-device checks, cancellation/recovery, camera timing and downloadable JSON. Physical hardware declarations and hands-on checks default to unconfirmed. No photo or extracted camera text is included in reports.
- Updated help for sideways, curved and multicolumn pages; crop one column or rotate and compare reruns. Complex photographs remain a known OCR limitation, not a solved acceptance target.

## Regressions and tradeoffs

- dark-04-terminal: 1.45% → 1.81% (+0.36 percentage points).
- sroie-438: 1.42% → 1.57% (+0.16 percentage points).

These two small per-image increases are accepted as a preprocessing tradeoff: both remain below 2% CER, their category means improve, and no category mean worsens. The much larger camera-page regression was rejected. This is a tuning set, not an independent held-out evaluation; thresholds were adjusted after baseline results. No reference transcript or selected image was changed in response to OCR output. A new held-out corpus is needed before making general accuracy claims.

## What the 50 images cover

- 10 clean and 5 dark browser screenshots, 7 designed posters/slides, and 5 non-English screenshots are independently authored, controlled local browser renders. They are not captured third-party applications or photographed street signs. Languages: French, Yoruba, Spanish, German, Portuguese; Igbo and Hausa remain unsupported.
- 8 real scanned receipts from [SROIE](https://github.com/zzzDavid/ICDAR-2019-SROIE), pinned commit in [receipt-sources.json](receipt-sources.json). References were visually corrected for actual case and released annotation mistakes before scoring. Two exterior handwritten dataset identifiers were cropped away, with original hashes and geometry retained. Very faint or clipped glyphs have single-reviewer uncertainty recorded in the manifest. Repository license is retained; this report makes no broader dataset ownership claim.
- 10 ordinary camera captures and 5 difficult captures from [DocPTBench](https://huggingface.co/datasets/topdu/DocPTBench), all different Federal Register pages and EXIF Huawei JAD-AL50 photographs. References come from exact official [GovInfo PDFs](https://www.govinfo.gov/app/collection/FR), using native text objects rather than OCR and matching visible page reading order. Low-quality cases cover creases, shadows, backlighting and rotation; motion blur is not claimed. Two ordinary captures are sideways. This is a narrow, difficult, mostly three-column document set from one camera model, not a representative phone market sample. See [photo provenance](PHOTO-PROVENANCE.md) and [photo-sources.json](photo-sources.json).

All 50 references are committed under references/, with image and truth SHA-256 hashes in [corpus.json](corpus.json). Raw images and PDFs stay outside the deployed application. Ground truth has one visual review, not independent double transcription. Reading-order, line-end hyphenation, punctuation and table-layout differences contribute to reported errors.

## Browser and physical-device evidence

The final local build passed 39 unit checks and 41 existing end-to-end browser checks. 156/156 completed manual-preset comparisons have identical metrics to baseline, and all 50 preprocessing input buffers match byte-for-byte. During parallel testing, some browser startups and repeated accessibility-tree polling stalled; the device-check harness was changed to DOM readiness polling and rerun on its own. The final results below are from that completed run.

- firefox 157.0: passed; 6 browser-flow checks; physical phone = false.
- webkit 27.2: passed; 6 browser-flow checks; physical phone = false.
- Device-check page on chrome: passed; 7 automatic checks; physical phone = false.
- Device-check page on firefox: passed; 7 automatic checks; physical phone = false.
- Device-check page on webkit: passed; 7 automatic checks; physical phone = false.

**Real Android and iPhone tests were not run.** No connected phone or BrowserStack/Sauce Labs account was available. A 390-pixel touch viewport and the Windows WebKit engine do not establish iPhone Safari, Android hardware, camera capture, mobile memory, soft keyboard, background-tab recovery or real-device performance. Their status remains NOT RUN.

To finish: open /device-check/ while signed into the private site on an actual Android Chrome and iPhone Safari. Identify the phone, run automatic checks, try a camera image, perform each hands-on task in the main workspace, and download the JSON report. Return failures with the device model and browser version. Nothing is submitted automatically.

Timings in CSV are diagnostic: independent suites overlapped on one Windows computer. They are not certified warm-laptop or real-phone speed measurements. The 15-second Android target and the first-load 8 MB target are not established; the OpenCV bundle alone is 13.3 MB before HTTP compression, and compressed first-read transfer size was not verified.

## Reproduce

1. Run npm ci, node scripts/make-screen-corpus.mjs, node scripts/fetch-receipt-corpus.mjs, and node scripts/fetch-photo-corpus.mjs. Photo references are already committed; PDFs and page indices are recorded for audit. Generated screenshot hashes can depend on installed fonts/Chrome; inspect rather than silently replacing a mismatched frozen input.
2. Build with npm run build and start npm start. Run node scripts/accuracy-benchmark.mjs benchmarks/corpus.json test-results/accuracy. It validates every image and transcript hash before recognition. LETTRA_URL selects another local export; LETTRA_VARIANTS or LETTRA_CASES narrow diagnostics.
3. Install Playwright Firefox/WebKit into .sites-runtime/browsers, then run node scripts/cross-browser-smoke.mjs and node scripts/device-check-smoke.mjs. Run npm test and the three existing smoke scripts for editor, offline, clipboard, cancellation and mobile-width checks.

Do not label an emulated or desktop-engine run as a physical-phone pass.
