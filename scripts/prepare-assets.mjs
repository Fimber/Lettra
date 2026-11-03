import {
  mkdir,
  copyFile,
  readdir,
  writeFile,
  stat,
  readFile,
} from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const languages = [
  "eng",
  "fra",
  "spa",
  "por",
  "deu",
  "ara",
  "chi_sim",
  "hin",
  "yor",
];
await mkdir("public/vendor/core", { recursive: true });
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  "public/vendor/tesseract-worker.min.js",
);
for (const file of await readdir("node_modules/tesseract.js-core"))
  if (file.endsWith(".wasm.js"))
    await copyFile(
      `node_modules/tesseract.js-core/${file}`,
      `public/vendor/core/${file}`,
    );
await copyFile(
  "node_modules/@techstark/opencv-js/dist/opencv.js",
  "public/vendor/opencv.js",
);
const records = [];
for (const model of ["fast", "best", "classic"]) {
  await mkdir(`public/tessdata/${model}`, { recursive: true });
  for (const lang of model === "classic" ? ["eng"] : languages) {
    const dest = `public/tessdata/${model}/${lang}.traineddata.gz`;
    const repo = model === "classic" ? "tessdata" : `tessdata_${model}`;
    const url = `https://raw.githubusercontent.com/tesseract-ocr/${repo}/4.1.0/${lang}.traineddata`;
    try {
      if ((await stat(dest)).size > 1000) {
        records.push({
          file: dest,
          source: url,
          gzipSha256: createHash("sha256")
            .update(await readFile(dest))
            .digest("hex"),
        });
        console.log(`Cached ${model}/${lang}`);
        continue;
      }
    } catch {}
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    const data = Buffer.from(await response.arrayBuffer());
    await writeFile(dest, gzipSync(data));
    records.push({
      file: dest,
      source: url,
      gzipSha256: createHash("sha256").update(gzipSync(data)).digest("hex"),
    });
    console.log(`Downloaded ${model}/${lang}`);
  }
}
if (records.length)
  await writeFile(
    "public/tessdata/sources.json",
    JSON.stringify(records, null, 2),
  );
await mkdir("public/licenses", { recursive: true });
await copyFile(
  "node_modules/tesseract.js/LICENSE.md",
  "public/licenses/tesseract-js.txt",
);
await copyFile(
  "node_modules/tesseract.js-core/LICENSE",
  "public/licenses/tesseract-core.txt",
);
await copyFile(
  "node_modules/@techstark/opencv-js/LICENSE",
  "public/licenses/opencv.txt",
);
console.log("All reader assets are self-hosted.");
