import type {
  Worker as OCRWorker,
  PSM,
  RecognizeResult,
  ImageLike,
} from "tesseract.js";
import type { Settings } from "./settings";
import { needsRowLayout } from "./layout";
const analysis = new WeakMap<HTMLCanvasElement, { screenLike: boolean }>();
let worker: OCRWorker | null = null;
let workerKey = "";
let generation = 0;
let processor: Worker | null = null;
let rejectProcessing: ((error: Error) => void) | null = null;
let rejectReading: ((error: Error) => void) | null = null;
let listener: (status: string, progress: number) => void = () => {};
let warming: Promise<void> | null = null;
export async function prepareReader(s: Settings, onProgress = listener) {
  const epoch = generation;
  listener = onProgress;
  const key = `${s.lang}|${s.oem}|${s.model}`;
  if (worker && key === workerKey) return;
  if (warming) {
    await warming.catch(() => {});
    if (epoch !== generation) throw new Error("Cancelled");
    if (worker && workerKey === key) return;
  }
  warming = (async () => {
    if (worker) await worker.terminate();
    worker = null;
    const { createWorker } = await import("tesseract.js");
    const next = await new Promise<OCRWorker>((resolve, reject) => {
      createWorker(s.lang, s.oem, {
        workerPath: "/vendor/tesseract-worker.min.js",
        // Our worker is same-origin. Avoid the unnecessary blob/importScripts
        // wrapper, which stalled Firefox when restarting from the offline cache.
        workerBlobURL: false,
        // The relaxed-SIMD core in v7 lacks the float DotProductSSE function
        // used by tessdata_best. The portable LSTM core supports these models.
        corePath:
          s.model === "best" && s.oem === 1
            ? "/vendor/core/tesseract-core-lstm.wasm.js"
            : "/vendor/core",
        langPath: `/tessdata/${s.oem === 0 ? "classic" : s.model}`,
        gzip: true,
        legacyCore: s.oem === 0,
        legacyLang: s.oem === 0,
        cachePath: `lettra-${s.oem === 0 ? "classic" : s.model}`,
        logger: (m) => listener(m.status, m.progress || 0),
        errorHandler: (error) => reject(new Error(String(error))),
      }).then(resolve, reject);
    });
    if (epoch !== generation) {
      await next.terminate();
      throw new Error("Cancelled");
    }
    worker = next;
    workerKey = key;
  })();
  try {
    await warming;
  } finally {
    warming = null;
  }
}
export async function preprocess(
  canvas: HTMLCanvasElement,
  s: Settings,
): Promise<HTMLCanvasElement> {
  if (s.useOriginal) return canvas;
  processor ||= new Worker("/preprocess.worker.js");
  const p = processor;
  const pixels = canvas
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    rejectProcessing = reject;
    p.onmessage = ({ data }) => {
      rejectProcessing = null;
      if (data.error) return reject(new Error(data.error));
      const out = document.createElement("canvas");
      out.width = data.width;
      out.height = data.height;
      out
        .getContext("2d")!
        .putImageData(
          new ImageData(data.pixels, data.width, data.height),
          0,
          0,
        );
      analysis.set(out, data.analysis);
      resolve(out);
    };
    p.onerror = () => {
      rejectProcessing = null;
      reject(
        new Error(
          "The image processor could not load. Try refreshing or use the original image.",
        ),
      );
    };
    p.postMessage(
      { id: Date.now(), pixels, steps: s.steps, preset: s.preset },
      [pixels.data.buffer],
    );
  });
}
export async function recognize(
  canvas: HTMLCanvasElement,
  s: Settings,
  onProgress: (status: string, progress: number) => void,
) {
  const epoch = generation;
  await prepareReader(s, onProgress);
  const active = worker;
  if (!active || epoch !== generation) throw new Error("Cancelled");
  // Tesseract encodes canvas images asynchronously before posting its job.
  // Prepare bytes ourselves so a cancelled encode never reaches a dead worker.
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(new Error("Could not prepare this image.")),
      "image/png",
    ),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (epoch !== generation || active !== worker) throw new Error("Cancelled");
  await active.setParameters({
    tessedit_pageseg_mode: String(s.psm) as PSM,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
    tessedit_char_whitelist: s.numbersOnly ? "0123456789.,-/:" : "",
  });
  if (epoch !== generation || active !== worker) throw new Error("Cancelled");
  const read = () =>
    new Promise<RecognizeResult>((resolve, reject) => {
      rejectReading = reject;
      active
        // v7's browser loadImage accepts Uint8Array; its ImageLike declaration
        // only lists Node's Buffer for bytes. No Node Buffer is needed at runtime.
        .recognize(
          bytes as unknown as ImageLike,
          {},
          { text: true, blocks: true },
        )
        .then(resolve, reject);
    }).finally(() => {
      if (epoch === generation) rejectReading = null;
    });
  let { data } = await read();
  if (epoch !== generation || active !== worker) throw new Error("Cancelled");
  const initialWords = (data.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
  );
  if (
    s.preset === "auto" &&
    s.psm === 3 &&
    !s.useOriginal &&
    analysis.get(canvas)?.screenLike &&
    needsRowLayout(initialWords, canvas.height)
  ) {
    onProgress("checking row order", 0);
    await active.setParameters({ tessedit_pageseg_mode: "6" as PSM });
    if (epoch !== generation || active !== worker) throw new Error("Cancelled");
    data = (await read()).data;
  }
  return {
    text: data.text,
    confidence: data.confidence,
    words: (data.blocks ?? [])
      .flatMap((b) =>
        b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
      )
      .map((w, id) => ({
        id,
        text: w.text,
        confidence: w.confidence,
        bbox: w.bbox,
      })),
  };
}
export function cancelReader() {
  generation++;
  rejectReading?.(new Error("Cancelled"));
  rejectReading = null;
  void worker?.terminate();
  worker = null;
  workerKey = "";
  processor?.terminate();
  processor = null;
  rejectProcessing?.(new Error("Cancelled"));
  rejectProcessing = null;
}
