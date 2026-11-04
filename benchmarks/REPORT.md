# Lettra: difficult-photo fix and frozen 50-image rerun

2026-11-04. All 50 original images were rerun through the production UI on desktop Chrome, in Auto/Fast English or each case's original language. Images, references, normalization and scoring are unchanged; every SHA-256 was rechecked. All 50 extractions completed, with zero browser errors and zero external network requests. This is not a physical-phone test.

## Results

The 15 difficult photos improved from **65.51% to 37.25% mean character error**. 12/15 improved. 35/35 non-photo results match every previous metric exactly. Regressions: 0.

| Category | Images | Before mean CER | After mean CER | After pooled CER | After mean WER | All numbers exact |
|---|---:|---:|---:|---:|---:|---:|
| clean_screenshots | 10 | 0.99% | 0.99% | 0.93% | 6.65% | 6/10 |
| dark_screenshots | 5 | 0.66% | 0.66% | 0.70% | 4.82% | 4/5 |
| signs_posters_slides | 7 | 0.07% | 0.07% | 0.07% | 0.40% | 6/6 |
| non_english | 5 | 1.57% | 1.57% | 1.22% | 4.49% | 4/4 |
| receipts | 8 | 12.74% | 12.74% | 13.23% | 37.58% | 0/8 |
| phone-photos | 10 | 59.65% | 35.87% | 34.81% | 59.87% | 0/10 |
| low-quality | 5 | 77.23% | 40.01% | 38.95% | 62.95% | 0/5 |

CER is edit distance divided by reference characters; smaller is better. Means weight images equally. Whitespace collapses and Unicode normalizes to NFC, with case and punctuation retained. Numeric exactness requires all number tokens in the reference to match in order. OCR confidence is a selection heuristic, never the accuracy ground truth.

## Each difficult photo

| Image | Before CER | After CER |
|---|---:|---:|
| phone-photo-01 | 69.25% | 25.79% |
| phone-photo-02 | 53.74% | 18.62% |
| phone-photo-03 | 53.31% | 12.86% |
| phone-photo-04 | 78.22% | 59.67% |
| phone-photo-05 | 78.90% | 78.90% |
| phone-photo-06 | 68.31% | 38.50% |
| phone-photo-07 | 27.79% | 27.79% |
| phone-photo-08 | 9.21% | 9.21% |
| phone-photo-09 | 100.00% | 64.31% |
| phone-photo-10 | 57.78% | 23.09% |
| low-quality-01 | 99.01% | 53.35% |
| low-quality-02 | 50.51% | 11.67% |
| low-quality-03 | 75.63% | 33.20% |
| low-quality-04 | 61.01% | 35.33% |
| low-quality-05 | 100.00% | 66.53% |

Phone-photo target below 8% CER: 0/10 meet it. The target remains unmet overall. Severe curvature, perspective, weak print, reading order and small headings still need manual review. This patch aligns text; it does not flatten curved paper. Important names and numbers remain error-prone.

## Changes verified

- Auto detects text direction from glyph-sized components and projection profiles, rather than desk edges. Rotation expands the canvas, preserving all image corners.
- Local classic-engine orientation detection resolves upside-down and sideways Latin-script pages using already bundled data. The detector is released after use.
- Pixel-derived text regions separate columns and rejoin vertically separated paragraphs before reading them. No reference transcript, document template or filename influences recognition.
- The corrected reading competes with the existing full-page reading using confident character evidence. Stronger existing results can be retained. The chosen image and word boxes share coordinates, and user edits still require comparison before replacement.
- Screenshot, receipt, manual preset and original-image processing retain their existing behavior. The service-worker cache version changes so clients receive the new helper.

Automatic paper cropping and an alternative Hough detector were rejected after visual checks found clipped text or column-direction mistakes. The same-session interrupted run stopped after an overnight environment pause; it is excluded from these final figures.

## Evidence and limits

- [Per-image final CSV](results/final.csv), [raw final metrics](results/final.jsonl), [v3 baseline](results/v3-auto.jsonl), [comparison and tested export hashes](results/photo-comparison.json).
- The browser run includes image normalization, preprocessing, recognition and displayed cleanup. Source HEAD in run metadata is the checkout base; exported index, processor and photo-helper hashes identify the tested build.
- Photo correction adds an orientation worker and a second OCR path. Desktop timings are in the CSV. Phone memory, latency and physical-device camera behavior have not been verified.
- The corpus is a development regression set used while designing this correction, not an independent held-out accuracy study. Its 15 photographs are difficult printed pages; see [photo provenance](PHOTO-PROVENANCE.md). No claim covers handwriting or all camera conditions.
- [Previous verification report](REPORT-v3.md) retains the earlier 50-image/preset history and physical-device limitations.

## Workflow verification

43 unit tests, 13 workspace checks, and three orientation cancellation/fallback checks passed. Chrome, Firefox and Windows WebKit passed the oblique-photo workflow, selected-word overlay, editing/undo, and 390px viewport overflow checks. Chrome also passed offline rereading and comparison. These are desktop browser engines, not physical phones. [Recorded checks](results/photo-ui.json).

The single cross-browser photo was low-quality-05: CER was 66.53% in Chrome, 56.34% in Firefox, and 80.42% in WebKit. Functional passes do not certify transcription accuracy. Only Chrome ran the full 50-image accuracy set.
