import { readFile, writeFile, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { summarize } from "./accuracy-metrics.mjs";
const dir = process.argv[2] || "test-results/photo-fix-final";
const rows = async path => (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
const before = await rows("test-results/accepted-auto/results.jsonl"), after = await rows(`${dir}/results.jsonl`);
const corpus = JSON.parse(await readFile("benchmarks/corpus.json", "utf8"));
assert.equal(after.length, 50); assert.deepEqual(after.map(x=>x.id).sort(), corpus.cases.map(x=>x.id).sort());
assert.ok(after.every(x=>x.status === "ok" && x.variant === "Auto"));
const run = JSON.parse(await readFile(`${dir}/summary.json`, "utf8"));
assert.equal(run.errors.length, 0); assert.equal(run.external.length, 0);
for (const item of corpus.cases) for (const key of ["image", "truth"]) {
 const actual=createHash("sha256").update(await readFile(item[key])).digest("hex");
 assert.equal(actual,item[`${key}Sha256`] ?? (key === "truth" ? item.transcriptSha256 : undefined));
}
const old = new Map(before.map(x=>[x.id,x])), comparison = after.map(x=>({id:x.id,category:x.category,before:old.get(x.id).metrics,after:x.metrics,deltaCER:x.metrics.cer-old.get(x.id).metrics.cer}));
const prior = summarize(before), next = summarize(after), photos = comparison.filter(x=>["phone-photos","low-quality"].includes(x.category));
const percent = x => `${(x*100).toFixed(2)}%`, mean = (list,key) => list.reduce((sum,x)=>sum+x[key].cer,0)/list.length;
const regression = comparison.filter(x=>x.deltaCER>1e-10), improved=photos.filter(x=>x.deltaCER < -1e-10);
const unchangedOther = comparison.filter(x=>!["phone-photos","low-quality"].includes(x.category)&&JSON.stringify(x.before)===JSON.stringify(x.after)).length;
const report = {
 date: new Date().toISOString(), baselineCommit:"2ea3aca32f7e8836d456a940b8d8dce0206ecdb9", execution:run.metadata,
 frozenCorpusSha256:createHash("sha256").update(await readFile("benchmarks/corpus.json")).digest("hex"),
 before:prior,after:next,photoMeanCER:{before:mean(photos,"before"),after:mean(photos,"after")},
 photoImproved:improved.length, unchangedOther,regressions:regression,comparison,externalRequests:run.external,browserErrors:run.errors,
 physicalPhone:false,
};
await copyFile("test-results/accepted-auto/results.jsonl","benchmarks/results/v3-auto.jsonl");
await copyFile("test-results/accepted-auto/results.csv","benchmarks/results/v3-auto.csv");
await copyFile(`${dir}/results.jsonl`,"benchmarks/results/final.jsonl");
await copyFile(`${dir}/results.csv`,"benchmarks/results/final.csv");
await writeFile("benchmarks/results/photo-comparison.json",JSON.stringify(report,null,2));
try {await readFile("benchmarks/REPORT-v3.md");} catch {await copyFile("benchmarks/REPORT.md","benchmarks/REPORT-v3.md");}
const md=`# Lettra: difficult-photo fix and frozen 50-image rerun

${report.date.slice(0,10)}. All 50 original images were rerun through the production UI on desktop Chrome, in Auto/Fast English or each case's original language. Images, references, normalization and scoring are unchanged; every SHA-256 was rechecked. All 50 extractions completed, with zero browser errors and zero external network requests. This is not a physical-phone test.

## Results

The 15 difficult photos improved from **${percent(report.photoMeanCER.before)} to ${percent(report.photoMeanCER.after)} mean character error**. ${improved.length}/15 improved. ${unchangedOther}/35 non-photo results match every previous metric exactly. Regressions: ${regression.length}.

| Category | Images | Before mean CER | After mean CER | After pooled CER | After mean WER | All numbers exact |
|---|---:|---:|---:|---:|---:|---:|
${Object.entries(next).map(([key,g])=>`| ${key.replace("Auto/","")} | ${g.count} | ${percent(prior[key].meanCER)} | ${percent(g.meanCER)} | ${percent(g.weightedCER)} | ${percent(g.meanWER)} | ${g.numericExactImages}/${g.numericImages} |`).join("\n")}

CER is edit distance divided by reference characters; smaller is better. Means weight images equally. Whitespace collapses and Unicode normalizes to NFC, with case and punctuation retained. Numeric exactness requires all number tokens in the reference to match in order. OCR confidence is a selection heuristic, never the accuracy ground truth.

## Each difficult photo

| Image | Before CER | After CER |
|---|---:|---:|
${photos.map(x=>`| ${x.id} | ${percent(x.before.cer)} | ${percent(x.after.cer)} |`).join("\n")}

Phone-photo target below 8% CER: ${after.filter(x=>x.category==="phone-photos"&&x.metrics.cer<.08).length}/10 meet it. The target remains unmet overall. Severe curvature, perspective, weak print, reading order and small headings still need manual review. This patch aligns text; it does not flatten curved paper. Important names and numbers remain error-prone.

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
`;
await writeFile("benchmarks/REPORT.md",md);
console.log(JSON.stringify({images:after.length,photoMeanCER:report.photoMeanCER,photoImproved:improved.length,unchangedOther,regressions:regression.map(x=>x.id)},null,2));
