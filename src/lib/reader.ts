import type { Worker as OCRWorker, PSM } from "tesseract.js";
import type { Settings } from "./settings";
let worker: OCRWorker | null = null;
let workerKey = "";
let generation = 0;
let processor: Worker | null = null;
let rejectProcessing: ((error: Error) => void) | null = null;
let listener: (status: string, progress: number) => void = () => {};
let warming: Promise<void> | null = null;
export async function prepareReader(s: Settings, onProgress = listener) {
  listener = onProgress;
  const key = `${s.lang}|${s.oem}|${s.model}`;
  if (worker && key === workerKey) return;
  if (warming) {
    await warming.catch(() => {});
    if (worker && workerKey === key) return;
  }
  const epoch = generation;
  warming = (async () => {
    if (worker) await worker.terminate();
    worker = null;
    const { createWorker } = await import("tesseract.js");
    const next = await new Promise<OCRWorker>((resolve, reject) => {
      createWorker(s.lang, s.oem, {
      workerPath: "/vendor/tesseract-worker.min.js",
      // The relaxed-SIMD core in v7 lacks the float DotProductSSE function
      // used by tessdata_best. The portable LSTM core supports these models.
      corePath: s.model === "best" && s.oem === 1
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
  const p = processor,
    bitmap = await createImageBitmap(canvas);
  if (p !== processor) {
    bitmap.close();
    throw new Error("Cancelled");
  }
  return new Promise((resolve, reject) => {
    rejectProcessing = reject;
    p.onmessage = ({ data }) => {
      rejectProcessing = null;
      if (data.error) return reject(new Error(data.error));
      const out = document.createElement("canvas");
      out.width = data.bitmap.width;
      out.height = data.bitmap.height;
      out.getContext("2d")!.drawImage(data.bitmap, 0, 0);
      data.bitmap.close();
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
      { id: Date.now(), bitmap, steps: s.steps, preset: s.preset },
      [bitmap],
    );
  });
}
export async function recognize(
  canvas: HTMLCanvasElement,
  s: Settings,
  onProgress: (status: string, progress: number) => void,
) {
  await prepareReader(s, onProgress);
  await worker!.setParameters({
    tessedit_pageseg_mode: String(s.psm) as PSM,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
    tessedit_char_whitelist: s.numbersOnly ? "0123456789.,-/:" : "",
  });
  const { data } = await worker!.recognize(
    canvas,
    {},
    { text: true, blocks: true },
  ).catch((error: unknown) => {
    throw error instanceof Error ? error : new Error(String(error));
  });
  return {
    text: data.text,
    confidence: data.confidence,
    words: (data.blocks ?? [])
      .flatMap((b) =>
        b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
      )
      .map((w) => ({ text: w.text, confidence: w.confidence })),
  };
}
export function cancelReader() {
  generation++;
  void worker?.terminate();
  worker = null;
  workerKey = "";
  processor?.terminate();
  processor = null;
  rejectProcessing?.(new Error("Cancelled"));
  rejectProcessing = null;
}
