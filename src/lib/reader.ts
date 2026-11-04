import type {
  Worker as OCRWorker,
  PSM,
  RecognizeResult,
  ImageLike,
} from "tesseract.js";
import type { Settings } from "./settings";
import { needsRowLayout, readingEvidence } from "./layout";
type Region = { left: number; top: number; width: number; height: number };
type PhotoCandidate = { canvas: HTMLCanvasElement; regions: Region[] };
const supportsPhotoLayout = (s: Settings) => s.preset === "auto" && s.psm === 3 &&
  !s.useOriginal && s.steps.deskew && /^(eng|fra|spa|por|deu|yor)$/.test(s.lang);
const analysis = new WeakMap<HTMLCanvasElement, { screenLike: boolean; photo: boolean; candidate?: PhotoCandidate }>();
let worker: OCRWorker | null = null;
let orientationWorker: OCRWorker | null = null;
let rejectOrientation: ((error: Error) => void) | null = null;
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
  const epoch = generation;
  const baseline = await processImage(canvas, s, false);
  const meta = analysis.get(baseline);
  if (meta?.photo && supportsPhotoLayout(s)) {
   try {
    const corrected = await processImage(canvas, s, true);
    if (epoch !== generation) throw new Error("Cancelled");
    const upright = await orientPhoto(corrected, epoch);
    if (epoch !== generation) throw new Error("Cancelled");
    const p = processor!, pixels = upright.getContext("2d")!.getImageData(0, 0, upright.width, upright.height);
    const regions = await new Promise<Region[]>((resolve, reject) => {
      rejectProcessing = reject;
      p.onmessage = ({ data }) => { rejectProcessing = null; data.error ? reject(new Error(data.error)) : resolve(data.regions); };
      p.onerror = () => { rejectProcessing = null; reject(new Error("Could not examine this photo.")); };
      p.postMessage({ action: "regions", pixels }, [pixels.data.buffer]);
    });
    if (epoch !== generation) throw new Error("Cancelled");
    meta.candidate = { canvas: upright, regions };
   } catch (error) {
    if (epoch !== generation || (error instanceof Error && error.message === "Cancelled")) throw error;
    // The optional photo pass may be unavailable on a device or on the first
    // offline read. The existing full-page reading remains usable.
   }
  }
  return baseline;
}
async function processImage(
  canvas: HTMLCanvasElement,
  s: Settings,
  enhancePhotos: boolean,
): Promise<HTMLCanvasElement> {
  const epoch = generation;
  if (s.useOriginal) return canvas;
  processor ||= new Worker("/preprocess.worker.js");
  const p = processor;
  const pixels = canvas
    .getContext("2d")!
    .getImageData(0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    rejectProcessing = reject;
    p.onmessage = async ({ data }) => {
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
      try {
        if (epoch !== generation) throw new Error("Cancelled");
        analysis.set(out, data.analysis);
        rejectProcessing = null;
        resolve(out);
      } catch (error) {
        if (epoch === generation) rejectProcessing = null;
        reject(error);
      }
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
      { id: Date.now(), pixels, steps: s.steps, preset: s.preset, enhancePhotos },
      [pixels.data.buffer],
    );
  });
}
async function encode(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    value => value ? resolve(value) : reject(new Error("Could not prepare this image.")), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}
async function orientPhoto(canvas: HTMLCanvasElement, epoch: number) {
  const { createWorker } = await import("tesseract.js");
  if (epoch !== generation) throw new Error("Cancelled");
  // OSD requires the classic engine. Reuse our bundled local English data;
  // this worker never receives a network endpoint or sends image data out.
  const detector = await new Promise<OCRWorker>((resolve, reject) => {
    createWorker("eng", 0, {
      workerPath: "/vendor/tesseract-worker.min.js", workerBlobURL: false,
      corePath: "/vendor/core", langPath: "/tessdata/classic", gzip: true,
      legacyCore: true, legacyLang: true, cachePath: "lettra-orientation-classic",
      errorHandler: error => reject(new Error(String(error))),
    }).then(resolve, reject);
  });
  if (epoch !== generation) { await detector.terminate(); throw new Error("Cancelled"); }
  orientationWorker = detector;
  try {
    const probe = document.createElement("canvas"), scale = Math.min(1, 2200 / Math.max(canvas.width, canvas.height));
    probe.width = Math.round(canvas.width * scale); probe.height = Math.round(canvas.height * scale);
    probe.getContext("2d")!.drawImage(canvas, 0, 0, probe.width, probe.height);
    const bytes = await encode(probe);
    if (epoch !== generation) throw new Error("Cancelled");
    const detected = await new Promise<Awaited<ReturnType<OCRWorker["detect"]>>>((resolve, reject) => {
      rejectOrientation = reject;
      detector.detect(bytes as unknown as ImageLike).then(resolve, reject);
    });
    if (epoch !== generation) throw new Error("Cancelled");
    const { orientation_degrees: degrees, orientation_confidence: confidence } = detected.data;
    if (!degrees || (confidence ?? 0) < 2.5 || ![90, 180, 270].includes(degrees)) return canvas;
    const out = document.createElement("canvas"), sideways = degrees !== 180;
    out.width = sideways ? canvas.height : canvas.width;
    out.height = sideways ? canvas.width : canvas.height;
    const ctx = out.getContext("2d")!;
    ctx.translate(out.width / 2, out.height / 2); ctx.rotate(degrees * Math.PI / 180);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  } finally {
    if (orientationWorker === detector) { orientationWorker = null; rejectOrientation = null; }
    await detector.terminate();
  }
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
  const read = (input = bytes) => {
    if (epoch !== generation || active !== worker) throw new Error("Cancelled");
    return (
    new Promise<RecognizeResult>((resolve, reject) => {
      rejectReading = reject;
      active
        // v7's browser loadImage accepts Uint8Array; its ImageLike declaration
        // only lists Node's Buffer for bytes. No Node Buffer is needed at runtime.
        .recognize(
          input as unknown as ImageLike,
          {},
          { text: true, blocks: true },
        )
        .then(resolve, reject);
    }).finally(() => {
      if (epoch === generation) rejectReading = null;
    }));
  };
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
  const result = {
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
  const candidate = analysis.get(canvas)?.candidate;
  if (candidate && supportsPhotoLayout(s)) {
    const { canvas: corrected, regions } = candidate;
    const candidateWords: typeof result.words = [], texts: string[] = [];
    const crops: (Region | null)[] = regions.length ? regions : [null];
    await active.setParameters({ tessedit_pageseg_mode: (regions.length ? "6" : "3") as PSM });
    for (let index = 0; index < crops.length; index++) {
      if (epoch !== generation || active !== worker) throw new Error("Cancelled");
      onProgress("checking photo layout", index / crops.length);
      const region = crops[index], padding = region ? 20 : 0;
      let input = corrected;
      if (region) {
        input = document.createElement("canvas");
        input.width = region.width + padding * 2; input.height = region.height + padding * 2;
        const ctx = input.getContext("2d")!;
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, input.width, input.height);
        ctx.drawImage(corrected, region.left, region.top, region.width, region.height, padding, padding, region.width, region.height);
      }
      const prepared = await encode(input);
      const next = (await read(prepared)).data;
      texts.push(next.text);
      for (const block of next.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) for (const word of line.words) {
        const dx = (region?.left ?? 0) - padding, dy = (region?.top ?? 0) - padding;
        candidateWords.push({ id: candidateWords.length, text: word.text, confidence: word.confidence, bbox: {
          x0: Math.max(0, word.bbox.x0 + dx), y0: Math.max(0, word.bbox.y0 + dy),
          x1: Math.min(corrected.width, word.bbox.x1 + dx), y1: Math.min(corrected.height, word.bbox.y1 + dy),
        } });
      }
    }
    if (epoch !== generation || active !== worker) throw new Error("Cancelled");
    if (readingEvidence(candidateWords) > readingEvidence(result.words) * 1.04) {
      const count = candidateWords.reduce((sum, w) => sum + w.text.length, 0);
      return { canvas: corrected, text: texts.join("\n"), words: candidateWords,
        confidence: candidateWords.reduce((sum, w) => sum + w.confidence * w.text.length, 0) / Math.max(1, count) };
    }
  }
  return { ...result, canvas };
}
export function cancelReader() {
  generation++;
  rejectOrientation?.(new Error("Cancelled"));
  rejectOrientation = null;
  void orientationWorker?.terminate();
  orientationWorker = null;
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
