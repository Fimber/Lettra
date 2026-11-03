# Lettra

A private, static image-to-text app. Next.js, React, TypeScript and Tailwind, with Tesseract.js OCR and OpenCV preprocessing in browser workers. No backend, accounts, analytics, LLM calls, or image uploads.

## Run

```sh
npm ci
npm run assets   # only when regenerating the committed reader assets
npm run build
npm start       # http://127.0.0.1:3000
```

The production preview is recommended for OCR and offline tests because it includes the production content security policy and service worker. `npm run dev` is available for UI development; the strict production CSP may restrict developer tooling. All dependencies are pinned in the lockfile.

## Included

- File picker, page-wide drop/paste, mobile camera input, JPG/PNG/WebP/BMP/GIF-first-frame/HEIC normalization, EXIF-aware decoding, 15 MB and 40 MP limits checked before decoding, 3000 px normalization (2000 px on low-memory devices).
- Local automatic recognition with progress, cancellation, persistent Tesseract worker, preview of the exact input, original/cleaned/split views, crop, rotate and zoom.
- Auto, Screenshot, Document, Dark mode and Receipt presets. Grayscale, adaptive/Otsu threshold, small-text enlargement, inversion, denoising, deskew, border and line removal.
- Nine languages: English, French, Spanish, Portuguese, German, Arabic, simplified Chinese, Hindi and Yoruba. Standard Fast/Best models; Classic English. Other legacy languages and Igbo/Hausa are not bundled. Choose one recognition language at a time.
- Six layout modes, numbers-only mode, and original-image bypass. Changing only OCR settings reuses the cleaned image.
- Spacious workspace after opening an image, resizable desktop panels, image zoom/pan, readable text and mobile settings sheet with sticky actions.
- Highlighted uncertain words link to the exact recognized image, bounding box and enlarged crop. Correct or confirm each occurrence, move with Alt + arrow keys, and check all numbers separately even when the reader score is high.
- Manual edits, corrections and accepted reruns support undo/redo. Reruns, cleanup, crop, rotation, replacement images and restored history show a comparison before replacing existing text. Accepting a new image can be undone together with its text. Session history is bounded to 40 checkpoints and four previous image versions.
- Preserve formatting, Clean paragraphs and Numbers only output modes, raw output, custom rule-based cleanup, copy/keyboard shortcuts, source-named TXT downloads and counts. Changes that merge words invalidate ambiguous review anchors instead of highlighting a different occurrence.
- Optional local history (off by default), bounded to ten text results; disabling clears history. Images are never persisted by the app.
- Local static assets and language packs, same-origin network CSP, service-worker asset caching for offline use after the first successful read. No content is sent in requests.
- `/device-check/`: local device diagnostics with downloadable JSON, automatic sample checks, cancellation/recovery and optional camera timing. Physical-device and hands-on confirmations are explicit; desktop runs remain labeled as desktop.

## Project map

- `src/app/page.tsx`: UI and extraction lifecycle.
- `src/lib/input.ts`: signature/dimension inspection, normalization and rotation.
- `src/lib/reader.ts`: worker reuse, cancellation and recognition.
- `public/preprocess.worker.js`: OpenCV pipeline with explicit matrix release.
- `src/lib/cleanup.ts`: reversible text cleanup rules.
- `src/lib/editor.ts`: bounded document undo history and stable word locations through edits and cleanup.
- `src/components/`: editable text, image viewer, word review and mobile settings sheet.
- `public/tessdata/`, `public/vendor/`: pinned, self-hosted reader assets.
- `public/sw.js`: same-origin offline cache. Change the cache version when updating static reader assets.

## Checks

```sh
npm run typecheck
npm test
# With a production preview running and Chrome installed:
node scripts/smoke.mjs
node scripts/extended-smoke.mjs
node scripts/workspace-smoke.mjs
npm run benchmark -- ./your-test-images
node scripts/accuracy-benchmark.mjs benchmarks/corpus.json test-results/accuracy
node scripts/cross-browser-smoke.mjs
node scripts/device-check-smoke.mjs
```

The smoke suites exercise real local OCR, paste, editable output, clipboard, TXT download, preprocessing reruns, file validation, offline extraction, mobile layout and an off-origin network assertion. Workspace checks exercise comparison, undo/redo, precise word correction, numeric review, resizing, zoom/pan, cancellation and mobile keyboard focus. Reports and screenshots go in `test-results/` (ignored by Git). The benchmark harness runs every image through every preset and writes CER, WER, number-token error rate, exact numeric match, reader score and elapsed time to CSV. Supply images with same-stem UTF-8 `.txt` ground truths. Whitespace is normalized for CER/WER; punctuation and case are preserved. Number tokens are compared in order, counting substitutions, omissions and insertions; this is a transcription metric, not a guarantee of semantic correctness.

## Validation boundaries

A frozen 50-image corpus and measured before/after results are documented in [benchmarks/REPORT.md](benchmarks/REPORT.md). It combines 27 controlled screenshot/poster/language renders, eight real scanned receipts and 15 real camera photographs. The photographs are a narrow, difficult Federal Register set from one Huawei model; this is a tuning corpus, not an independent held-out accuracy certification. References were authored or visually checked against independent native sources before OCR. Images and transcripts have fixed hashes. Raw source images/PDFs are ignored by Git and are not deployed; the report explains reproduction.

Desktop Chrome, Firefox and WebKit checks do not establish physical iPhone or Android support. No connected phone or device-cloud account was available; real-phone camera, memory, keyboard, repeated-load and timing checks remain not run. Open `/device-check/` on an actual phone to complete them. The three built-in samples are smoke fixtures, separate from the 50-image corpus. Complex warped or sideways camera pages still need rotation, cropping and careful review; the report records unmet accuracy targets.

HEIC support depends on the decoder supporting the source codec; unreadable files return an error without upload. The complete OpenCV build is intentionally lazy-loaded; OpenCV alone is 13.3 MB before HTTP compression. The compressed first-read transfer budget of 8 MB has not been verified. A custom OpenCV build remains the download-size optimization.

PDFs, batch extraction, translation, structured exports and accounts remain outside this MVP. Handwriting and highly decorative fonts are not reliable. User history and offline caches are subject to browser storage limits.

Observed accuracy limitation: the Fast reader can confuse digits even with high aggregate confidence, and every real receipt in the baseline contained at least one numeric-token mismatch. The review highlights and editable result are important; do not treat the reader score as proof that an amount is correct. Check all important names and numbers.

## Deployment

`npm run build` exports `out/` for a static host. `.openai/hosting.json` records the private Sites project. The production CSP is in the document head: `connect-src 'self'` prevents off-origin requests, and no external fonts, images or scripts are used. Use HTTPS for clipboard, workers and offline caching. Hosting-level access cookies, if present, control entry to the private site; they are separate from image processing.

## Open-source dependencies

Tesseract.js / Tesseract core and traineddata are Apache-2.0; OpenCV is Apache-2.0. Third-party packages retain their upstream licenses. Model downloads use the upstream `4.1.0` release refs, with source URLs and checksums recorded in `public/tessdata/sources.json`. Do not replace them with runtime CDN URLs.
