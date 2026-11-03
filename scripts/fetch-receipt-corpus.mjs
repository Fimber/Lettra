import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

const commit = "27be4271b251c256f695acbade9a801bffe85994";
const root = `https://raw.githubusercontent.com/zzzDavid/ICDAR-2019-SROIE/${commit}`;
const overridesPath = "benchmarks/receipt-reference-overrides.json";
const overrides = JSON.parse(await readFile(overridesPath, "utf8"));
if (overrides.receipts.length !== 8 || new Set(overrides.receipts.map(r => r.id)).size !== 8) {
  throw new Error("Expected exactly eight distinct visually reviewed receipts");
}
await mkdir("benchmark-data/receipts", { recursive: true });
const sha = buffer => createHash("sha256").update(buffer).digest("hex");
const refresh = process.argv.includes("--refresh");
async function sourceFile(path, url) {
  if (!refresh) {
    try { return await readFile(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  await writeFile(path, data);
  return data;
}
const manifest = [];
for (const receipt of overrides.receipts) {
  const { id, crop, sourceDimensions, lines, notes } = receipt;
  if (!/^\d{3}$/.test(id) || !Array.isArray(lines) || !lines.length || lines.some(line => /\*\*\*/.test(line))) {
    throw new Error(`Invalid reviewed reference: ${id}`);
  }
  const stem = `sroie-${id}`;
  const originalPath = `benchmark-data/receipts/${stem}.jpg`;
  const annotationPath = `benchmark-data/receipts/${stem}.csv`;
  const imageUrl = `${root}/data/img/${id}.jpg`;
  const annotationUrl = `${root}/data/box/${id}.csv`;
  const [original, annotations] = await Promise.all([
    sourceFile(originalPath, imageUrl), sourceFile(annotationPath, annotationUrl),
  ]);
  const metadata = await sharp(original).metadata();
  const dimensions = { width: metadata.width, height: metadata.height };
  if (sourceDimensions && (dimensions.width !== sourceDimensions.width || dimensions.height !== sourceDimensions.height)) {
    throw new Error(`${id}: source dimensions changed; do not apply the reviewed crop`);
  }
  const imagePath = crop ? `benchmark-data/receipts/${stem}-printed-crop.png` : originalPath;
  // Pure rectangular extraction: no rotation, enhancement, scaling, or pixel replacement.
  const input = crop ? await sharp(original).extract(crop).png().toBuffer() : original;
  const truth = lines.join("\n") + "\n";
  const truthPath = `benchmark-data/receipts/${stem}.txt`;
  await writeFile(truthPath, truth);
  if (crop) await writeFile(imagePath, input);
  manifest.push({
    id: stem, category: "receipts", lang: "eng", image: imagePath, truth: truthPath,
    imageSha256: sha(input), truthSha256: sha(truth),
    source: {
      type: crop ? "cropped-real-scanned-receipt" : "real-scanned-receipt",
      imageUrl, annotationUrl, commit, originalPath, originalSha256: sha(original),
      annotationSha256: sha(annotations), sourceDimensions: dimensions,
      ...(crop ? { crop, outputDimensions: { width: crop.width, height: crop.height }, cropLibrary: `sharp ${sharp.versions.sharp}` } : {}),
      transcript: "Visually reviewed actual-case reference; row order is left-to-right then top-to-bottom",
      referenceOverrides: overridesPath, reviewDate: overrides.reviewDate,
      referenceMethod: overrides.method, referenceConventions: overrides.conventions, notes,
    },
  });
  console.log(stem, input.length, "bytes", lines.length, "reviewed lines", crop ? "cropped" : "original");
}
await writeFile("benchmarks/receipt-sources.json", JSON.stringify(manifest, null, 2) + "\n");
await sourceFile("benchmarks/SROIE-LICENSE.txt", `${root}/LICENSE`);
