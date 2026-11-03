import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const { cases } = JSON.parse(await readFile("benchmarks/corpus.json", "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const results = [];
try {
  // This checks browser pixel transport, not the app shell or offline cache.
  // A blank document isolates decoding and canvas behavior.
  for (const item of cases) {
    const encoded = (await readFile(item.image)).toString("base64");
    const result = await page.evaluate(async (encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const image = await createImageBitmap(new Blob([bytes]), {
        imageOrientation: "from-image",
      });
      const scale = Math.min(1, 3000 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.close();
      const originalBitmap = await createImageBitmap(canvas);
      const originalSurface = new OffscreenCanvas(canvas.width, canvas.height);
      const originalContext = originalSurface.getContext("2d");
      originalContext.drawImage(originalBitmap, 0, 0);
      originalBitmap.close();
      const oldPixels = originalContext.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const newPixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let differingChannels = 0;
      for (let i = 0; i < newPixels.length; i++)
        if (oldPixels[i] !== newPixels[i]) differingChannels++;
      return {
        width: canvas.width,
        height: canvas.height,
        bytesCompared: newPixels.length,
        differingChannels,
        equal: differingChannels === 0,
      };
    }, encoded);
    results.push({ id: item.id, ...result });
  }
} finally {
  await browser.close();
}
await mkdir("benchmarks/results", { recursive: true });
await writeFile(
  "benchmarks/results/pixel-transport.json",
  JSON.stringify(
    {
      browser: "Desktop Chrome",
      scope:
        "Old ImageBitmap/OffscreenCanvas ingress versus new ImageData ingress after the same opaque, EXIF-aware normalization. The four manual preset algorithms are unchanged.",
      results,
    },
    null,
    2,
  ),
);
console.log(
  `${results.filter((r) => r.equal).length}/${cases.length} input buffers exactly equal`,
);
if (results.some((r) => !r.equal)) process.exitCode = 1;
