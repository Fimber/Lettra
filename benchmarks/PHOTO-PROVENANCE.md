# Lettra real-phone-photo corpus

`benchmarks/photo-sources.json` is the canonical 15-entry manifest. It contains
10 `phone-photos` entries and 5 `low-quality` entries, all different source pages.
Image and truth paths are relative to the Lettra project root. Each pair has SHA-256
hashes, exact upstream IDs, source URLs, license and native PDF page indices.

Images are original JPEG files from the **real-camera** directory of
[DocPTBench](https://huggingface.co/datasets/topdu/DocPTBench), not its simulated
or dewarped directories. All 15 JPEG hashes match the upstream Hugging Face LFS
hashes. Their EXIF identifies **HUAWEI JAD-AL50**. No crop, rotation, resize,
perspective correction or other image transform was applied to benchmark images.
The preview PNGs are review aids only and must not be used as benchmark input.

The authors describe physical photographs of 100 documents under four conditions
in [paper section 3.1](https://arxiv.org/html/2511.18434v1#S3.SS1).
Citation: Yongkun Du, Pinxuan Chen, Xuye Ying, Zhineng Chen. *DocPTBench:
Benchmarking End-to-End Photographed Document Parsing and Translation.*
arXiv:2511.18434, 2025. The dataset card declares Apache-2.0 and links the
repository license, saved here as `LICENSE`.

## Ground truth

The released DocPTBench labels have visible transcription errors, including
`WPOCRDA` for `WPCCRDA` and `tha` for `that` on page 57163. Although the paper
describes human-verified source annotations, those labels were **not** used as
exact ground truth. The selected upstream records are preserved as
`*.upstream-annotations.json` for audit.

Instead, `source-<printed-page>.txt` contains text extracted from the matching
official born-digital Federal Register PDFs downloaded from govinfo.gov. These
are native PDF text objects, not OCR output. `phone-photo-*.txt` and
`low-quality-*.txt` contain the final references. They retain the visible headers,
page numbers, columns, billing text, footnotes and table text. Changes are limited
to removing the print-production `VerDate` footer that is absent from these
photographed pages; putting the header/page number in visible reading order;
Unicode compatibility and paired-quote normalization; and removing decorative
table dot leaders. Each manifest entry records these transformations.

## Selection and limits

Selection was completed before running Lettra or Tesseract OCR: lexicographic
first 10 English table-free base pages, capture 1; the remaining four table-free
base pages, capture 4; then the first unused English base page with a table,
capture 4. The 15 base page IDs are unique. Ground truth covers complete pages,
not isolated paragraph crops. Two `phone-photos` images are sideways and are
intentionally unchanged.

The low-quality reasons are respectively oblique perspective/creasing, strong
shadow, backlighting/low contrast, approximately 90-degree rotation with
perspective, and approximately 45-degree rotation with perspective. Motion blur
is not claimed. All pages are Federal Register publications, mostly three-column
layouts, from one Huawei device model. This is a narrow document stress set,
not a representative target-market or device sample. Existing real phone photos
also do not constitute testing Lettra on a physical phone.

## Reproduction

The local scripts `inspect.cjs`, `select.cjs`, `prepare-selection.cjs`,
`download.cjs`, `download-sources.cjs`, `extract-all.py`, and `finalize.cjs`
record the download, selection, native-text extraction and manifest procedure.
`extract-all.py` uses pypdf. `finalize.cjs` uses Node and sharp for image metadata,
without changing the images. Final references were verified before OCR.

SmartDoc-QA was considered first but its official Zenodo download returned a
traffic-restriction 403. That restriction was not bypassed. DocUNet's
Tesseract-derived reference text was not used as independent ground truth.
