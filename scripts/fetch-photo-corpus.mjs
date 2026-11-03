import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
const corpus = JSON.parse(
  await readFile("benchmarks/photo-sources.json", "utf8"),
);
for (const item of corpus) {
  const response = await fetch(item.source.upstreamImageUrl);
  if (!response.ok) throw Error(`${item.id}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== item.imageSha256)
    throw Error(`${item.id}: source changed`);
  await mkdir(dirname(item.image), { recursive: true });
  await writeFile(item.image, bytes);
  console.log(item.id);
}
