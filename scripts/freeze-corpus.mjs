import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const screens = await read("benchmark-data/screens/manifest.json");
const cases = [
  ...screens.fixtures,
  ...(await read("benchmarks/receipt-sources.json")),
  ...(await read("benchmarks/photo-sources.json")),
];
if (cases.length !== 50 || new Set(cases.map((c) => c.id)).size !== 50)
  throw Error("Expected 50 unique images");
await mkdir("benchmarks/references", { recursive: true });
for (const c of cases) {
  const truth = await readFile(c.truth);
  const hash = createHash("sha256").update(truth).digest("hex");
  if (hash !== (c.truthSha256 || c.transcriptSha256))
    throw Error(`Reference changed: ${c.id}`);
  c.originalTruthPath = c.truth;
  c.truth = `benchmarks/references/${c.id}.txt`;
  c.truthSha256 = hash;
  await writeFile(c.truth, truth);
}
await writeFile(
  "benchmarks/corpus.json",
  JSON.stringify(
    {
      version: 1,
      selection:
        "All constituent selections and references finalized before OCR scoring; this manifest unifies their immutable hashes.",
      counts: Object.fromEntries(
        [...new Set(cases.map((c) => c.category))].map((k) => [
          k,
          cases.filter((c) => c.category === k).length,
        ]),
      ),
      limits: screens.limits,
      cases,
    },
    null,
    2,
  ),
);
console.log(`Frozen ${cases.length} references with unchanged SHA-256 hashes`);
