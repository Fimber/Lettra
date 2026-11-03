"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useReducer,
} from "react";
import {
  Undo2,
  Redo2,
  Upload,
  ArrowUpRight,
  ArrowRight,
  ScanText,
  ShieldCheck,
  Globe2,
  ChevronDown,
  Copy,
  Download,
  Check,
  X,
  RotateCw,
  Crop,
  ZoomIn,
  Image as ImageIcon,
  FileText,
  Sparkles,
  SlidersHorizontal,
  Lock,
  Monitor,
  Receipt,
  Sun,
  Moon,
  Camera,
  History,
  Plus,
  LoaderCircle,
  RefreshCw,
  ChevronRight,
  Maximize2,
  Info,
  CheckCheck,
  WifiOff,
  Trash2,
} from "lucide-react";
import ReactCrop, { type Crop as CropArea } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
  defaults,
  applyPreset,
  presets,
  languages,
  type Settings,
  type Preset,
  type Steps,
} from "@/lib/settings";
import {
  editorReducer,
  initialHistory,
  emptyDocument,
  editDocument,
  anchorsForOutput,
  outputText,
  type EditorDocument,
  type OutputMode,
} from "@/lib/editor";
import { ImageViewer } from "@/components/ImageViewer";
import { WordReview } from "@/components/WordReview";
import { SettingsSheet } from "@/components/SettingsSheet";
import { normalizeFile, rotateCanvas } from "@/lib/input";
import {
  preprocess,
  recognize,
  cancelReader,
  prepareReader,
} from "@/lib/reader";
import { sampleFile, type Sample } from "@/lib/samples";
import { EditableText } from "@/components/EditableText";

type Recent = {
  name: string;
  text: string;
  date: string;
  confidence: number;
  elapsed: number;
};
function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`toggle-row ${disabled ? "disabled" : ""}`}>
      <span>
        <strong>{label}</strong>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        aria-label={label}
        aria-description={description}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}
function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-top">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
const presetIcons = {
  auto: Sparkles,
  screenshot: Monitor,
  document: FileText,
  dark: Moon,
  receipt: Receipt,
};

export default function Home() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [cleanUrl, setCleanUrl] = useState("");
  const [name, setName] = useState("");
  const [size, setSize] = useState(0);
  const [editor, dispatch] = useReducer(editorReducer, initialHistory);
  const doc = editor.present,
    result = doc.result,
    text = doc.text,
    elapsed = doc.elapsed;
  const [candidate, setCandidate] = useState<EditorDocument | null>(null);
  const [outputMode, setOutputMode] = useState<OutputMode>("preserve");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [reviewFilter, setReviewFilter] = useState<"uncertain" | "numbers">(
    "uncertain",
  );
  const [split, setSplit] = useState(48);
  const workspace = useRef<HTMLElement>(null);
  const closeSettings = useCallback(() => setImprove(false), []);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [tab, setTab] = useState<"original" | "cleaned" | "compare">(
    "original",
  );
  const [dragging, setDragging] = useState(false);
  const [improve, setImprove] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [review, setReview] = useState(false);
  const [modal, setModal] = useState<
    "help" | "privacy" | "history" | "crop" | "zoom" | "compare" | null
  >(null);
  const [crop, setCrop] = useState<CropArea>();
  const cropImage = useRef<HTMLImageElement>(null);
  const [historyOn, setHistoryOn] = useState(false);
  const [history, setHistory] = useState<Recent[]>([]);
  const [offline, setOffline] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const draggingDepth = useRef(0);
  const cache = useRef<{
    source: HTMLCanvasElement;
    key: string;
    canvas: HTMLCanvasElement;
  } | null>(null);
  const state = useRef({ settings, historyOn, doc, outputMode });
  state.current = { settings, historyOn, doc, outputMode };
  const shown = showRaw ? (result?.text ?? "") : text;
  const words = shown.trim() ? shown.trim().split(/\s+/).length : 0;
  const uncertain = useMemo(
    () => result?.words.filter((w) => w.confidence < 60) ?? [],
    [result],
  );
  const numericWords = useMemo(
    () => result?.words.filter((w) => /\d/.test(w.text)) ?? [],
    [result],
  );
  const reviewWords = (
    reviewFilter === "numbers" ? numericWords : uncertain
  ).filter((w) => !doc.reviewed.includes(w.id));
  const activeWord = reviewWords.find((w) => w.id === activeId) ?? null;
  const activeAnchor = doc.anchors.find((a) => a.id === activeId);
  const activeIndex = reviewWords.findIndex((w) => w.id === activeId);
  const remaining = uncertain.filter((w) => !doc.reviewed.includes(w.id));
  useEffect(() => {
    if (!doc.result) return;
    setSource(doc.source);
    setSourceUrl(doc.sourceUrl);
    setCleanUrl(doc.imageUrl);
    setName(doc.name);
    setSize(doc.size);
    setActiveId(null);
    setReview(false);
    setOutputMode(doc.outputMode);
    setSettings((s) => ({ ...s, numbersOnly: doc.outputMode === "numbers" }));
  }, [
    doc.result,
    doc.source,
    doc.sourceUrl,
    doc.imageUrl,
    doc.name,
    doc.size,
    doc.outputMode,
  ]);
  useEffect(() => {
    if (!review) return;
    const key = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        moveReview(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [review, activeId, reviewWords]);
  useEffect(() => {
    try {
      const enabled = localStorage.getItem("lettra-history-enabled") === "true";
      setHistoryOn(enabled);
      if (enabled)
        setHistory(JSON.parse(localStorage.getItem("lettra-history") || "[]"));
    } catch {}
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      cancelReader();
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(timer);
  }, [toast]);
  function saveRecent(
    filename: string,
    value: string,
    confidence: number,
    elapsed: number,
  ) {
    if (!state.current.historyOn || !value) return;
    setHistory((old) => {
      const next = [
        {
          name: filename,
          text: value,
          date: new Date().toISOString(),
          confidence,
          elapsed,
        },
        ...old,
      ].slice(0, 10);
      try {
        localStorage.setItem("lettra-history", JSON.stringify(next));
      } catch {
        setToast("Browser storage is full. This result was not saved.");
      }
      return next;
    });
  }
  const extract = useCallback(
    async (
      canvas: HTMLCanvasElement,
      filename: string,
      s: Settings,
      id = ++runId.current,
      fileSize = state.current.doc.size,
      mode = state.current.outputMode,
    ) => {
      s = { ...s, numbersOnly: mode === "numbers" };
      setBusy(true);
      setError("");
      setProgress(0);
      setStage("Preparing your image");
      const previous = state.current.doc;
      setCandidate(null);
      setShowRaw(false);
      setReview(false);
      const start = performance.now();
      try {
        const key = JSON.stringify({
          steps: s.steps,
          preset: s.preset,
          useOriginal: s.useOriginal,
        });
        let cleaned: HTMLCanvasElement;
        const warming = prepareReader(s, (status, p) => {
          if (id !== runId.current) return;
          if (status === "loading language traineddata") {
            setStage("Preparing the reader · first download");
            setProgress(Math.round(p * 22));
          }
        }).then(
          () => null,
          (e) => e as Error,
        );
        if (cache.current?.source === canvas && cache.current.key === key)
          cleaned = cache.current.canvas;
        else {
          cleaned = await preprocess(canvas, s);
          cache.current = { source: canvas, key, canvas: cleaned };
        }
        if (id !== runId.current) return;
        const imageUrl = cleaned.toDataURL("image/png");
        if (!previous.result) setCleanUrl(imageUrl);
        const warmError = await warming;
        if (warmError) throw warmError;
        setStage("Reading your image");
        setProgress(25);
        const data = await recognize(cleaned, s, (status, p) => {
          if (id === runId.current && status === "recognizing text") {
            setStage("Reading your image");
            setProgress(25 + Math.round(p * 75));
          }
        });
        if (id !== runId.current) return;
        const value = outputText(data.text, s, mode);
        const next: EditorDocument = {
          text: value,
          result: data,
          anchors: anchorsForOutput(data.words, data.text, value),
          reviewed: [],
          imageUrl,
          width: cleaned.width,
          height: cleaned.height,
          source: canvas,
          sourceUrl: canvas.toDataURL("image/png"),
          name: filename,
          size: fileSize,
          elapsed: (performance.now() - start) / 1000,
          outputMode: mode,
        };
        if (previous.result) {
          setCandidate(next);
          setModal("compare");
          setStage(
            "New result ready to compare. Your current text is unchanged.",
          );
        } else {
          dispatch({ type: "reset", document: next });
          setStage(value ? "Your text is ready" : "No text detected");
          saveRecent(filename, value, data.confidence, next.elapsed);
        }
        setProgress(100);
      } catch (e) {
        if (id !== runId.current) return;
        const message =
          e instanceof Error ? e.message : "Could not read this image.";
        setOutputMode(state.current.doc.outputMode);
        setSettings((s) => ({
          ...s,
          numbersOnly: state.current.doc.outputMode === "numbers",
        }));
        setError(
          /memory|allocation/i.test(message)
            ? "This image is too large for this device. Crop it or use a smaller version."
            : message === "Cancelled"
              ? "Extraction cancelled."
              : `Could not finish reading. ${message}`,
        );
      } finally {
        if (id === runId.current) setBusy(false);
      }
    },
    [],
  );
  const loadFile = useCallback(
    async (file: File) => {
      if (busy) return;
      const id = ++runId.current;
      setError("");
      setBusy(true);
      setStage("Opening your image");
      try {
        const canvas = await normalizeFile(file);
        if (id !== runId.current) return;
        if (!state.current.doc.result) {
          setSource(canvas);
          setSourceUrl(canvas.toDataURL("image/png"));
          setCleanUrl("");
          setName(file.name);
          setSize(file.size);
        }
        setTab("original");
        cache.current = null;
        await extract(canvas, file.name, state.current.settings, id, file.size);
      } catch (e) {
        if (id === runId.current) {
          setError(
            e instanceof Error
              ? e.message
              : "This image could not be opened. Try a PNG or JPG.",
          );
          setBusy(false);
        }
      }
    },
    [busy, extract],
  );
  const copy = useCallback(async () => {
    if (!shown) return;
    try {
      await navigator.clipboard.writeText(shown);
      setToast("Copied. Your words are ready to go.");
    } catch {
      setError(
        "Clipboard access was blocked. Select the text and use Ctrl+C or Cmd+C.",
      );
    }
  }, [shown]);
  useEffect(() => {
    const paste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((x) =>
        x.type.startsWith("image/"),
      );
      if (item) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) void loadFile(file);
      }
    };
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "KeyC") {
        e.preventDefault();
        void copy();
      }
    };
    const enter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        draggingDepth.current++;
        setDragging(true);
      }
    };
    const leave = () => {
      draggingDepth.current--;
      if (draggingDepth.current <= 0) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      draggingDepth.current = 0;
      setDragging(false);
      const files = e.dataTransfer?.files;
      if (files?.[0]) {
        void loadFile(files[0]);
        if (files.length > 1)
          setToast("Reading the first image. Add another when you’re ready.");
      }
    };
    document.addEventListener("paste", paste);
    document.addEventListener("keydown", key);
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragleave", leave);
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("paste", paste);
      document.removeEventListener("keydown", key);
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
    };
  }, [loadFile, copy]);
  function clear() {
    ++runId.current;
    cancelReader();
    setSource(null);
    setSourceUrl("");
    setCleanUrl("");
    dispatch({ type: "reset", document: emptyDocument });
    setCandidate(null);
    setActiveId(null);
    setReview(false);
    setModal(null);
    setError("");
    setBusy(false);
    cache.current = null;
    setStage("");
    setShowRaw(false);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([shown], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(doc.name || name).replace(/\.[^.]+$/, "") || "lettra"}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Text downloaded.");
  }
  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }
  function setStep<K extends keyof Steps>(key: K, value: Steps[K]) {
    setSettings((s) => ({
      ...s,
      preset: "custom",
      steps: { ...s.steps, [key]: value },
    }));
  }
  function propose(next: EditorDocument) {
    if (next.text === doc.text) {
      dispatch({ type: "commit", document: next });
      setToast("The text is already in this format.");
      return;
    }
    setImprove(false);
    setCandidate(next);
    setModal("compare");
  }
  function changeCleanup(key: keyof Settings["cleanup"], value: boolean) {
    const nextSettings = {
      ...settings,
      cleanup: { ...settings.cleanup, [key]: value },
    };
    setSettings(nextSettings);
    setOutputMode("custom");
    if (result) {
      const value = outputText(result.text, nextSettings, "custom");
      propose({
        ...doc,
        text: value,
        anchors: anchorsForOutput(result.words, result.text, value),
        reviewed: [],
        outputMode: "custom",
      });
    }
  }
  function changeOutput(mode: OutputMode) {
    const nextSettings = { ...settings, numbersOnly: mode === "numbers" };
    setSettings(nextSettings);
    setOutputMode(mode);
    if (!result) return;
    if (mode === "numbers" || settings.numbersOnly) {
      setImprove(false);
      if (source)
        void extract(source, name, nextSettings, undefined, doc.size, mode);
      else {
        setOutputMode(doc.outputMode);
        setSettings((s) => ({
          ...s,
          numbersOnly: doc.outputMode === "numbers",
        }));
        setToast("Add the original image to change recognition mode.");
      }
      return;
    }
    const value = outputText(result.text, nextSettings, mode);
    propose({
      ...doc,
      text: value,
      anchors: anchorsForOutput(result.words, result.text, value),
      reviewed: [],
      outputMode: mode,
    });
  }
  function acceptCandidate() {
    if (!candidate) return;
    dispatch({ type: "commit", document: candidate });
    saveRecent(
      candidate.name,
      candidate.text,
      candidate.result?.confidence ?? 0,
      candidate.elapsed,
    );
    setCandidate(null);
    setModal(null);
    setShowRaw(false);
    setToast("New result applied. Undo will restore your previous version.");
  }
  function dismissCandidate() {
    setCandidate(null);
    setModal(null);
    setOutputMode(doc.outputMode);
    setSettings((s) => ({ ...s, numbersOnly: doc.outputMode === "numbers" }));
    setToast("Your text and corrections are unchanged.");
  }
  function editText(value: string) {
    dispatch({ type: "edit", text: value, at: Date.now() });
  }
  function undo() {
    dispatch({ type: "undo" });
    setShowRaw(false);
  }
  function cancelExtraction() {
    ++runId.current;
    cancelReader();
    setBusy(false);
    if (result) {
      setOutputMode(doc.outputMode);
      setSettings((s) => ({ ...s, numbersOnly: doc.outputMode === "numbers" }));
    }
    setStage("Extraction cancelled. Your current work is unchanged.");
    setToast("Extraction cancelled. Your current work is unchanged.");
  }
  function redo() {
    dispatch({ type: "redo" });
    setShowRaw(false);
  }
  function startReview(
    id?: number,
    filter: "uncertain" | "numbers" = reviewFilter,
  ) {
    const list = (filter === "numbers" ? numericWords : uncertain).filter(
      (w) => !doc.reviewed.includes(w.id),
    );
    setReviewFilter(filter);
    setReview(true);
    setActiveId(id ?? list[0]?.id ?? null);
    setShowRaw(false);
    setTab("cleaned");
  }
  function moveReview(direction: number) {
    if (!reviewWords.length) return;
    setActiveId(
      reviewWords[
        (Math.max(0, activeIndex) + direction + reviewWords.length) %
          reviewWords.length
      ].id,
    );
  }
  function finishWord(replacement?: string) {
    if (!activeWord) return;
    let next = doc;
    if (replacement !== undefined && activeAnchor)
      next = editDocument(
        doc,
        doc.text.slice(0, activeAnchor.start) +
          replacement +
          doc.text.slice(activeAnchor.end),
      );
    next = { ...next, reviewed: [...next.reviewed, activeWord.id] };
    dispatch({ type: "commit", document: next });
    const remaining = reviewWords.filter((w) => w.id !== activeWord.id);
    setActiveId(
      remaining[Math.min(activeIndex, remaining.length - 1)]?.id ?? null,
    );
    if (!remaining.length)
      setToast("Review complete. You can still edit any word.");
  }
  function resizeWorkspace(clientX: number) {
    const bounds = workspace.current?.getBoundingClientRect();
    if (bounds)
      setSplit(
        Math.max(
          32,
          Math.min(68, ((clientX - bounds.left) / bounds.width) * 100),
        ),
      );
  }
  async function demo(kind: Sample) {
    const file = await sampleFile(kind);
    await loadFile(file);
  }
  function rotate() {
    if (!source) return;
    const canvas = rotateCanvas(source);
    setActiveId(null);
    void extract(canvas, name, settings);
  }
  function applyCrop() {
    if (!source || !crop || !crop.width || !crop.height || !cropImage.current)
      return;
    const img = cropImage.current;
    const sx = source.width / img.width,
      sy = source.height / img.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.width * sx);
    canvas.height = Math.round(crop.height * sy);
    canvas
      .getContext("2d")!
      .drawImage(
        source,
        crop.x * sx,
        crop.y * sy,
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    setActiveId(null);
    setModal(null);
    void extract(canvas, name, settings);
  }
  function toggleHistory(v: boolean) {
    setHistoryOn(v);
    try {
      localStorage.setItem("lettra-history-enabled", String(v));
      if (!v) {
        localStorage.removeItem("lettra-history");
        setHistory([]);
      }
    } catch {
      setToast("Local storage is unavailable in this browser.");
    }
  }
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="Lettra home">
            <span className="brand-icon">
              <ScanText size={23} />
            </span>
            lettra<span className="brand-dot">.</span>
          </a>
          <div className="nav">
            <span className="local-badge">
              <span />
              Runs on your device
            </span>
            <div className="nav-divider" />
            <button onClick={() => setModal("help")}>
              How it works <ArrowUpRight size={14} />
            </button>
            <button onClick={() => setModal("privacy")}>
              Privacy <ShieldCheck size={15} />
            </button>
          </div>
        </div>
      </header>
      <main className={source || result ? "has-document" : ""}>
        {!source && !result ? (
          <section className="intro">
            <div className="eyebrow">
              <span /> A LITTLE TOOL FOR YOUR EVERYDAY
            </div>
            <h1>
              Your images, <em>in words.</em>
            </h1>
            <p>
              Get the text you need from the images you have.
              <br className="mobile-break" /> Fast, free, and entirely on your
              device.
            </p>
          </section>
        ) : (
          <section className="session-heading">
            <div>
              <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
              <h1>
                A clearer view of <em>your words.</em>
              </h1>
            </div>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Plus size={17} />
              New image
            </button>
          </section>
        )}
        <div className="workspace-top">
          <div className="workspace-label">
            <ScanText size={17} /> IMAGE TO TEXT{" "}
            <span className="version">LOCAL OCR</span>
          </div>
          <div className="workspace-controls">
            {offline && (
              <span className="offline">
                <WifiOff size={14} />
                Offline
              </span>
            )}
            <button
              className="history-button"
              aria-label="Recent history"
              title="Recent history"
              onClick={() => setModal("history")}
            >
              <History size={16} />
            </button>
            <label className="language">
              <Globe2 size={16} />
              <select
                aria-label="Recognition language"
                value={settings.lang}
                disabled={busy}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    lang: e.target.value,
                    oem: e.target.value === "eng" ? s.oem : 1,
                  }))
                }
              >
                {languages.map(([code, label]) => (
                  <option value={code} key={code}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
          </div>
        </div>
        <div className="quick-settings">
          <div className="quick-presets">
            <span>Image type</span>
            {(["auto", "screenshot", "document", "receipt"] as const).map(
              (key) => {
                const Icon = presetIcons[key];
                return (
                  <button
                    key={key}
                    aria-label={"Use " + presets[key].label + " preset"}
                    aria-pressed={settings.preset === key}
                    disabled={busy}
                    onClick={() => setSettings((s) => applyPreset(s, key))}
                  >
                    <Icon size={16} />
                    {presets[key].label}
                  </button>
                );
              },
            )}
          </div>
          <button
            className="settings-shortcut secondary"
            onClick={() => setImprove(true)}
          >
            <SlidersHorizontal size={16} />
            Settings
          </button>
          {source && (
            <button
              className="primary quick-run"
              disabled={busy}
              onClick={() => extract(source, name, settings)}
            >
              <RefreshCw size={16} />
              Run again
            </button>
          )}
        </div>
        {!source && (
          <button
            className="mobile-camera-primary secondary"
            disabled={busy}
            onClick={() => camera.current?.click()}
          >
            <Camera size={19} />
            Take a photo
          </button>
        )}
        <section
          ref={workspace}
          className="workspace"
          style={{
            gridTemplateColumns: split + "fr 10px " + (100 - split) + "fr",
          }}
          aria-label="Image to text workspace"
        >
          <div className="image-panel">
            <div className="panel-heading">
              <div className="panel-title">
                <span className="step">01</span>
                <h2>Your image</h2>
              </div>
              {source ? (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  <Plus size={15} />
                  Replace
                </button>
              ) : (
                <span className="panel-hint">Start here</span>
              )}
            </div>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/bmp,image/gif,image/heic,image/heif,.heic,.heif"
              className="visually-hidden"
              aria-label="Choose an image"
              onChange={(e) => {
                if (e.target.files?.[0]) void loadFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="visually-hidden"
              aria-label="Take a photo"
              onChange={(e) => {
                if (e.target.files?.[0]) void loadFile(e.target.files[0]);
                e.target.value = "";
              }}
            />
            {!source ? (
              <div
                className="upload-zone"
                onClick={() => !busy && input.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    input.current?.click();
                  }
                }}
                role="button"
                tabIndex={busy ? -1 : 0}
                aria-label="Drop, paste or choose an image"
                aria-disabled={busy}
                onMouseEnter={() => {
                  void prepareReader(settings).catch(() => {});
                }}
                onFocus={() => {
                  void prepareReader(settings).catch(() => {});
                }}
              >
                <div className="upload-illustration">
                  <div className="paper paper-back">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="paper paper-front">
                    <ImageIcon size={31} strokeWidth={1.35} />
                    <div className="paper-lines">
                      <span />
                      <span />
                    </div>
                    <span className="paper-plus">
                      <Plus size={14} />
                    </span>
                  </div>
                  <span className="mini-spark">✦</span>
                </div>
                <h3>Drop your image here</h3>
                <p>
                  or paste it with <kbd>Ctrl</kbd> + <kbd>V</kbd>
                </p>
                <span className="primary choose-button">
                  <Upload size={16} />
                  Choose an image
                </span>
                <span className="file-types">
                  JPG, PNG, WebP, HEIC & more <span>·</span> Up to 15 MB
                </span>
              </div>
            ) : (
              <div className="image-workspace">
                <div className="image-toolbar">
                  <div className="segmented">
                    {(["original", "cleaned", "compare"] as const).map((t) => (
                      <button
                        key={t}
                        className={tab === t ? "active" : ""}
                        onClick={() => {
                          setTab(t);
                          setActiveId(null);
                        }}
                        disabled={t !== "original" && !cleanUrl}
                      >
                        {t === "compare"
                          ? "Side by side"
                          : t === "original"
                            ? "Original"
                            : "Cleaned"}
                      </button>
                    ))}
                  </div>
                  <div className="image-tools">
                    <button
                      aria-label="Crop image"
                      title="Crop image"
                      disabled={busy}
                      onClick={() => {
                        setCrop(undefined);
                        setModal("crop");
                      }}
                    >
                      <Crop size={16} />
                    </button>
                    <button
                      aria-label="Rotate image clockwise"
                      title="Rotate 90°"
                      disabled={busy}
                      onClick={rotate}
                    >
                      <RotateCw size={16} />
                    </button>
                    <button
                      aria-label="Zoom image"
                      title="Enlarge"
                      onClick={() => setModal("zoom")}
                    >
                      <Maximize2 size={16} />
                    </button>
                  </div>
                </div>
                <div
                  className={
                    "image-canvas " + (tab === "compare" ? "compare" : "")
                  }
                >
                  {tab === "compare" ? (
                    <>
                      <ImageViewer
                        url={sourceUrl}
                        alt="Original uploaded image"
                      />
                      <ImageViewer
                        url={cleanUrl}
                        alt="Cleaned image used for recognition"
                      />
                    </>
                  ) : (
                    <ImageViewer
                      url={
                        activeWord
                          ? doc.imageUrl
                          : tab === "cleaned"
                            ? cleanUrl
                            : sourceUrl
                      }
                      alt={
                        tab === "cleaned"
                          ? "Cleaned image used for recognition"
                          : "Original uploaded image"
                      }
                      word={activeWord}
                    />
                  )}
                  {busy && <div className="scanning-line" />}
                </div>
                <div className="file-meta">
                  <ImageIcon size={13} />
                  <span>{name}</span>
                  <small>
                    {(size / 1024 / 1024).toFixed(1)} MB · {source.width} ×{" "}
                    {source.height}
                  </small>
                </div>
              </div>
            )}
            <div className="image-foot">
              <span>
                <Lock size={13} />
                Your image never leaves your device
              </span>
              <button
                className="camera-button"
                onClick={() => camera.current?.click()}
                disabled={busy}
              >
                <Camera size={15} />
                <span>Take a photo</span>
              </button>
            </div>
          </div>
          <div
            className="workspace-divider"
            role="separator"
            aria-label="Resize image and text panels"
            aria-orientation="vertical"
            aria-valuemin={32}
            aria-valuemax={68}
            aria-valuenow={Math.round(split)}
            tabIndex={0}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              resizeWorkspace(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId))
                resizeWorkspace(e.clientX);
            }}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                setSplit(
                  e.key === "Home"
                    ? 32
                    : e.key === "End"
                      ? 68
                      : Math.max(
                          32,
                          Math.min(
                            68,
                            split + (e.key === "ArrowRight" ? 3 : -3),
                          ),
                        ),
                );
              }
            }}
          >
            <span />
          </div>
          <div className="text-panel">
            <div className="panel-heading">
              <div className="panel-title">
                <span className="step">02</span>
                <h2>Extracted text</h2>
              </div>
              <div className="output-actions">
                <button
                  disabled={!shown}
                  onClick={copy}
                  className="copy-button"
                >
                  <Copy size={14} />
                  Copy
                </button>
                <button
                  disabled={!shown}
                  onClick={download}
                  className="icon-button"
                  title="Download text"
                  aria-label="Download text"
                >
                  <Download size={16} />
                </button>
                <button
                  disabled={(!source && !result) || busy}
                  onClick={clear}
                  className="icon-button"
                  title="Clear image and result"
                  aria-label="Clear image and result"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <div className="editor-toolbar">
              <label>
                Output
                <select
                  aria-label="Output format"
                  value={outputMode}
                  disabled={busy}
                  onChange={(e) => changeOutput(e.target.value as OutputMode)}
                >
                  <option value="preserve">Preserve formatting</option>
                  <option value="paragraphs">Clean paragraphs</option>
                  <option value="numbers" disabled={!source && !!result}>
                    Numbers only
                  </option>
                  {outputMode === "custom" && (
                    <option value="custom">Custom cleanup</option>
                  )}
                </select>
              </label>
              <div className="undo-controls">
                <button
                  aria-label="Undo edit"
                  title="Undo (Ctrl / ⌘ Z)"
                  disabled={!editor.past.length || busy}
                  onClick={undo}
                >
                  <Undo2 size={18} />
                </button>
                <button
                  aria-label="Redo edit"
                  title="Redo (Ctrl / ⌘ Shift Z)"
                  disabled={!editor.future.length || busy}
                  onClick={redo}
                >
                  <Redo2 size={18} />
                </button>
              </div>
            </div>
            {busy && result && (
              <div className="rerun-progress" role="status">
                <LoaderCircle size={16} />
                <span>
                  {stage} · {progress}%<small>Your current text is safe.</small>
                </span>
                <button onClick={cancelExtraction}>Cancel</button>
              </div>
            )}
            {busy && !result ? (
              <div className="working-state" role="status">
                <div className="reader-spinner">
                  <ScanText size={32} />
                </div>
                <h3>{stage}</h3>
                <p>Finding the words, right here on your device.</p>
                <div className="progress-track">
                  <span style={{ width: `${Math.max(3, progress)}%` }} />
                </div>
                <div className="progress-meta">
                  <span>{progress}% complete</span>
                  <button onClick={cancelExtraction}>Cancel</button>
                </div>
              </div>
            ) : result ? (
              <div className="result-content">
                <div className="result-status">
                  <button
                    className="review-summary"
                    onClick={() => startReview(undefined, "uncertain")}
                    disabled={!remaining.length}
                  >
                    <Info size={16} />
                    {remaining.length
                      ? remaining.length +
                        " " +
                        (remaining.length === 1 ? "word" : "words") +
                        " to check"
                      : "No words flagged"}
                    <span title="A recognition score, not a guarantee of correctness.">
                      Reader score {Math.round(result.confidence)}%
                    </span>
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setShowRaw(!showRaw)}
                  >
                    {showRaw ? "Show cleaned" : "Show raw"}
                  </button>
                </div>
                {!shown && !result.text ? (
                  <div className="no-text">
                    <ScanText />
                    <h3>No text detected</h3>
                    <p>Try the Dark mode preset or crop closer to the text.</p>
                    <button
                      className="secondary"
                      onClick={() => setImprove(true)}
                    >
                      Improve result <ArrowRight size={14} />
                    </button>
                  </div>
                ) : (
                  <EditableText
                    value={shown}
                    readOnly={showRaw}
                    onChange={editText}
                    anchors={doc.anchors}
                    highlightIds={[
                      ...remaining,
                      ...(reviewFilter === "numbers" ? reviewWords : []),
                    ].map((w) => w.id)}
                    activeId={activeId}
                    onReview={(id) =>
                      startReview(
                        id,
                        uncertain.some((w) => w.id === id)
                          ? "uncertain"
                          : "numbers",
                      )
                    }
                    onUndo={undo}
                    onRedo={redo}
                  />
                )}
                {result.confidence < 60 && shown && (
                  <p className="warning-note">
                    This result may contain errors. Try a different preset.
                  </p>
                )}
                <div className="review-tools">
                  <span id="editor-hint">
                    Click a highlighted word to check it against the image.
                  </span>
                  {numericWords.length > 0 && (
                    <button onClick={() => startReview(undefined, "numbers")}>
                      Check numbers{" "}
                      <span>
                        {
                          numericWords.filter(
                            (w) => !doc.reviewed.includes(w.id),
                          ).length
                        }
                      </span>
                    </button>
                  )}
                </div>
                {review && (
                  <div className="review-list" aria-label="Words to review">
                    <div className="review-list-heading">
                      <span>
                        {reviewFilter === "numbers"
                          ? "Check numbers carefully"
                          : "Words to check"}{" "}
                        · {reviewWords.length} remaining
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setReview(false);
                          setActiveId(null);
                        }}
                      >
                        Hide review
                      </button>
                    </div>
                    <div className="review-chips">
                      {reviewWords.map((w) => (
                        <button
                          key={w.id}
                          className={activeId === w.id ? "selected" : ""}
                          onClick={() => startReview(w.id)}
                          aria-label={
                            "Review " + w.text + ", word " + (w.id + 1)
                          }
                        >
                          {w.text}
                        </button>
                      ))}
                      {!reviewWords.length && (
                        <span className="review-complete">
                          <Check size={16} />
                          All flagged words checked. Names and numbers still
                          deserve a look.
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {activeWord && (
                  <WordReview
                    word={activeWord}
                    imageUrl={doc.imageUrl}
                    currentValue={
                      activeAnchor
                        ? text.slice(activeAnchor.start, activeAnchor.end)
                        : activeWord.text
                    }
                    canReplace={!!activeAnchor}
                    index={activeIndex}
                    total={reviewWords.length}
                    onMove={moveReview}
                    onReplace={(value) => finishWord(value)}
                    onConfirm={() => finishWord()}
                    onClose={() => setActiveId(null)}
                  />
                )}
              </div>
            ) : (
              <div className="text-empty">
                <div className="text-placeholder-icon">
                  <FileText size={28} strokeWidth={1.3} />
                  <span>
                    <Check size={10} />
                  </span>
                </div>
                <h3>A little less retyping.</h3>
                <p>
                  Your text will appear here,
                  <br />
                  ready to edit, copy, and make your own.
                </p>
                <div className="placeholder-lines">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div className="text-footer">
              <span>
                {words} words <span className="count-divider">·</span>{" "}
                {shown.length} characters
              </span>
              {result ? (
                <span className="time">
                  <Check size={12} />
                  {elapsed.toFixed(1)}s
                </span>
              ) : (
                <span className="editable-label">
                  <span />
                  Editable output
                </span>
              )}
            </div>
          </div>
        </section>
        {error && (
          <div className="error-banner" role="alert">
            <Info size={17} />
            <span>{error}</span>
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <section className={`improve ${improve ? "open" : ""}`}>
          <button
            className="improve-toggle"
            aria-expanded={improve}
            onClick={() => setImprove(!improve)}
          >
            <span className="improve-icon">
              <SlidersHorizontal size={17} />
            </span>
            <span>
              <strong>Improve your result</strong>
              <small>A little fine-tuning goes a long way.</small>
            </span>
            <span className="preset-badge">
              {settings.preset === "custom"
                ? "Custom"
                : presets[settings.preset].label}
            </span>
            <ChevronDown className="disclosure" size={17} />
          </button>
          {improve && (
            <SettingsSheet onClose={closeSettings}>
              <div className="settings-content">
                <div className="settings-label">START WITH A PRESET</div>
                <div className="presets">
                  {Object.entries(presets).map(([key, p]) => {
                    const Icon = presetIcons[key as keyof typeof presetIcons];
                    return (
                      <button
                        disabled={busy}
                        key={key}
                        className={settings.preset === key ? "selected" : ""}
                        onClick={() =>
                          setSettings((s) =>
                            applyPreset(s, key as Exclude<Preset, "custom">),
                          )
                        }
                      >
                        <Icon size={17} />
                        {p.label}
                        {settings.preset === key && <Check size={13} />}
                      </button>
                    );
                  })}
                </div>
                <div className="settings-grid">
                  <label>
                    Text layout
                    <select
                      aria-label="Text layout"
                      disabled={busy}
                      value={settings.psm}
                      onChange={(e) =>
                        change("psm", Number(e.target.value) as Settings["psm"])
                      }
                    >
                      <option value={3}>Auto (document)</option>
                      <option value={4}>Single column</option>
                      <option value={6}>Single block</option>
                      <option value={7}>Single line</option>
                      <option value={8}>Single word</option>
                      <option value={11}>Scattered text</option>
                    </select>
                  </label>
                  <label>
                    Reader
                    <select
                      aria-label="Reader"
                      disabled={busy}
                      value={settings.oem}
                      onChange={(e) =>
                        change("oem", Number(e.target.value) as 0 | 1)
                      }
                    >
                      <option value={1}>Standard · recommended</option>
                      <option value={0} disabled={settings.lang !== "eng"}>
                        Classic · English only
                      </option>
                    </select>
                  </label>
                  <label>
                    Accuracy
                    <select
                      aria-label="Accuracy"
                      disabled={busy || settings.oem === 0}
                      value={settings.model}
                      onChange={(e) =>
                        change("model", e.target.value as Settings["model"])
                      }
                    >
                      <option value="fast">Fast · smaller download</option>
                      <option value="best">Best · larger download</option>
                    </select>
                  </label>
                </div>
                <div className="settings-toggles">
                  <Toggle
                    checked={settings.numbersOnly}
                    disabled={busy}
                    onChange={(v) => changeOutput(v ? "numbers" : "preserve")}
                    label="Numbers only"
                    description="For amounts, dates, and figures"
                  />
                  <Toggle
                    checked={settings.useOriginal}
                    disabled={busy}
                    onChange={(v) => change("useOriginal", v)}
                    label="Use original image"
                    description="Skip image cleanup"
                  />
                </div>
                <button
                  className="advanced-toggle"
                  onClick={() => setAdvanced(!advanced)}
                >
                  <ChevronRight
                    size={14}
                    className={advanced ? "expanded" : ""}
                  />
                  Advanced image & text cleanup
                </button>
                {advanced && (
                  <div className="advanced">
                    <div>
                      <h4>Image cleanup</h4>
                      {(
                        [
                          ["grayscale", "Grayscale"],
                          ["invertIfDark", "Invert dark backgrounds"],
                          ["upscale", "Enlarge small text"],
                          ["denoise", "Reduce image noise"],
                          ["deskew", "Straighten text"],
                          ["removeBorders", "Remove scan borders"],
                          ["removeLines", "Remove table lines"],
                        ] as const
                      ).map(([key, label]) => (
                        <Toggle
                          key={key}
                          label={label}
                          checked={settings.steps[key]}
                          disabled={busy || settings.useOriginal}
                          onChange={(v) => setStep(key, v)}
                        />
                      ))}
                      <label className="threshold-label">
                        Threshold
                        <select
                          aria-label="Threshold"
                          disabled={busy || settings.useOriginal}
                          value={settings.steps.threshold}
                          onChange={(e) =>
                            setStep(
                              "threshold",
                              e.target.value as Steps["threshold"],
                            )
                          }
                        >
                          <option value="none">None</option>
                          <option value="otsu">Even lighting (Otsu)</option>
                          <option value="adaptive">
                            Uneven lighting (adaptive)
                          </option>
                        </select>
                      </label>
                    </div>
                    <div>
                      <h4>Text cleanup</h4>
                      <p className="setting-description">
                        Preview these changes beside your current text before
                        applying them. Your edits stay safe.
                      </p>
                      {(
                        [
                          ["joinHyphens", "Join hyphenated words"],
                          ["mergeLines", "Merge paragraph lines"],
                          ["stripNoise", "Remove stray symbols"],
                          ["preserveSpaces", "Preserve column spacing"],
                          ["normalizeQuotes", "Straighten quotes"],
                          ["numberFixes", "Fix number-like characters"],
                        ] as const
                      ).map(([key, label]) => (
                        <Toggle
                          key={key}
                          label={label}
                          disabled={busy}
                          checked={settings.cleanup[key]}
                          onChange={(v) => changeCleanup(key, v)}
                        />
                      ))}
                      <p className="setting-description">
                        No spelling corrections. No rewritten words. You’re in
                        control.
                      </p>
                    </div>
                  </div>
                )}
                <div className="settings-footer">
                  <span>
                    <Info size={14} />
                    Settings apply the next time you read an image.
                  </span>
                  <button
                    className="primary"
                    disabled={!source || busy}
                    onClick={() => {
                      setImprove(false);
                      if (source) void extract(source, name, settings);
                    }}
                  >
                    <RefreshCw size={15} />
                    Read with these settings
                  </button>
                </div>
              </div>
            </SettingsSheet>
          )}
        </section>
        {!source && !result && (
          <section className="samples">
            <div className="sample-label">
              <span>Just looking around?</span>
              <h2>Try a sample.</h2>
              <p>No upload needed.</p>
            </div>
            <button
              className="sample-card note-sample"
              disabled={busy}
              onClick={() => demo("note")}
            >
              <div className="sample-visual">
                <div className="note-sheet">
                  <b>
                    A little room
                    <br />
                    for good ideas.
                  </b>
                  <span>Good ideas rarely arrive fully formed.</span>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div>
                <strong>A printed page</strong>
                <span>From paper to possibilities</span>
              </div>
              <ArrowUpRight size={16} />
            </button>
            <button
              className="sample-card receipt-sample"
              disabled={busy}
              onClick={() => demo("receipt")}
            >
              <div className="sample-visual">
                <div className="receipt-sheet">
                  <b>THE CORNER STORE</b>
                  <i />
                  <span>
                    Oat milk <em>4.50</em>
                  </span>
                  <span>
                    Coffee <em>12.00</em>
                  </span>
                  <i />
                  <strong>
                    TOTAL <em>27.30</em>
                  </strong>
                </div>
              </div>
              <div>
                <strong>A receipt</strong>
                <span>Every little detail counts</span>
              </div>
              <ArrowUpRight size={16} />
            </button>
            <button
              className="sample-card dark-sample"
              disabled={busy}
              onClick={() => demo("dark")}
            >
              <div className="sample-visual">
                <div className="dark-sheet">
                  <div>
                    <i />
                    <i />
                    <i />
                  </div>
                  <span>notes.md</span>
                  <b>
                    Make the useful
                    <br />
                    things simple.
                  </b>
                  <p>Small tools. Thoughtful details.</p>
                </div>
              </div>
              <div>
                <strong>A dark screenshot</strong>
                <span>Bring your words to light</span>
              </div>
              <ArrowUpRight size={16} />
            </button>
          </section>
        )}
        <section className="benefits">
          <div>
            <span className="benefit-icon">
              <ShieldCheck size={19} />
            </span>
            <div>
              <h3>Private by design</h3>
              <p>Your files stay yours. Always.</p>
            </div>
          </div>
          <div>
            <span className="benefit-icon">
              <ScanText size={19} />
            </span>
            <div>
              <h3>Words, just as they are</h3>
              <p>No AI rewriting. No surprises.</p>
            </div>
          </div>
          <div>
            <span className="benefit-icon">
              <WifiOff size={19} />
            </span>
            <div>
              <h3>Ready when you are</h3>
              <p>Works offline after the first read.</p>
            </div>
          </div>
        </section>
        <footer>
          <span>Made for the words worth keeping.</span>
          <span>
            Best with printed text, screenshots & clear photos.
            <button onClick={() => setModal("help")}>
              A few things to know <ArrowUpRight size={12} />
            </button>
          </span>
        </footer>
      </main>
      <div className="sr-only" aria-live="polite">
        {busy ? `${stage}, ${progress} percent` : stage}
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <Upload size={42} />
          <h2>Drop it here. We’ll find the words.</h2>
          <p>Your image stays on your device.</p>
        </div>
      )}
      {(source || result) && (
        <div className="mobile-actions">
          <button onClick={() => input.current?.click()} disabled={busy}>
            <Plus size={19} />
            New image
          </button>
          <button onClick={() => setImprove(true)}>
            <SlidersHorizontal size={19} />
            Settings
          </button>
          <button className="primary" disabled={!shown} onClick={copy}>
            <Copy size={18} />
            Copy text
          </button>
        </div>
      )}
      {modal === "compare" && candidate && (
        <Modal
          title="Keep the version that works for you"
          wide
          onClose={dismissCandidate}
        >
          <p className="comparison-intro">
            Your current text and corrections are unchanged. Compare both
            versions, then choose. Applying the new result is undoable.
          </p>
          <div className="result-comparison">
            <label>
              <span>
                Your current text <small>{doc.name}</small>
              </span>
              <textarea
                aria-label="Current text"
                readOnly
                value={text}
                dir="auto"
              />
            </label>
            <label>
              <span>
                New result <small>{candidate.name}</small>
              </span>
              <textarea
                aria-label="New result"
                readOnly
                value={candidate.text}
                dir="auto"
              />
            </label>
          </div>
          <div className="comparison-stats">
            <span>
              {text.length} → {candidate.text.length} characters
            </span>
            <span>Check changes to names, numbers, and line breaks.</span>
          </div>
          <div className="modal-actions">
            <button className="secondary" onClick={dismissCandidate}>
              Keep my text
            </button>
            <button className="primary" onClick={acceptCandidate}>
              <Check size={17} />
              Use new result
            </button>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="A few pixels. A lot of possibilities."
          onClose={() => setModal(null)}
        >
          <div className="help-steps">
            <div>
              <span>01</span>
              <h3>Add your image</h3>
              <p>
                Drop, paste, choose a file, or take a photo. Lettra reads
                printed text in screenshots, documents, and receipts.
              </p>
            </div>
            <div>
              <span>02</span>
              <h3>Let your device do the reading</h3>
              <p>
                OpenCV cleans the image. Tesseract reads the characters in a
                local worker. The first read downloads the reader and selected
                language; later reads use the cache.
              </p>
            </div>
            <div>
              <span>03</span>
              <h3>Make the words yours</h3>
              <p>
                Edit the result, copy it, or download a text file. Use Improve
                your result to change the layout or cleanup preset.
              </p>
            </div>
          </div>
          <div className="info-box">
            <h3>A little heads-up</h3>
            <p>
              Handwriting, decorative fonts, blur, and glare can be difficult to
              read. For columns or complex layouts, crop one section at a time.
              Always check important names and numbers.
            </p>
            <p>
              Keyboard shortcuts: <kbd>Ctrl / ⌘ + V</kbd> to paste an image.{" "}
              <kbd>Ctrl / ⌘ + Shift + C</kbd> to copy your result.
            </p>
          </div>
        </Modal>
      )}
      {modal === "privacy" && (
        <Modal
          title="Your images stay with you."
          onClose={() => setModal(null)}
        >
          <div className="privacy-lead">
            <ShieldCheck size={28} />
            <p>
              No uploads. No accounts.
              <br />
              <strong>Just your device, doing its thing.</strong>
            </p>
          </div>
          <div className="prose">
            <h3>Everything happens in your browser</h3>
            <p>
              Images and extracted text are processed in memory on your device.
              Lettra does not send them to a server, an AI service, or an
              analytics provider. There are no tracking scripts.
            </p>
            <h3>A reader that lives locally</h3>
            <p>
              Tesseract uses a small, locally running recognition model. Classic
              mode uses pattern matching. OpenCV uses fixed image processing
              operations. Neither uses an LLM or cloud AI.
            </p>
            <h3>Only the app and language files are downloaded</h3>
            <p>
              All reader code and language packs come from this site. A content
              security policy blocks connections to other domains. You can
              verify this in your browser’s Network panel while reading an
              image.
            </p>
            <h3>History is your choice</h3>
            <p>
              History is off by default. If enabled, the last ten text results
              are stored only in this browser. Turning it off deletes them.
              Clearing an image removes it from this session.
            </p>
            <h3>Offline after the first read</h3>
            <p>
              After a successful online read and cache setup, the app and that
              language’s reader are available offline. A new language or
              accuracy model needs a connection once. Browser storage limits or
              clearing site data may remove the cache.
            </p>
          </div>
        </Modal>
      )}
      {modal === "history" && (
        <Modal title="Your recent words" onClose={() => setModal(null)}>
          <Toggle
            checked={historyOn}
            onChange={toggleHistory}
            label="Keep recent history"
            description="Save up to 10 results in this browser only. Off by default."
          />
          {history.length ? (
            <>
              <button
                className="text-button history-clear"
                onClick={() => {
                  setHistory([]);
                  localStorage.removeItem("lettra-history");
                }}
              >
                Clear all history <Trash2 size={14} />
              </button>
              <div className="history-list">
                {history.map((item, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      const restored: EditorDocument = {
                        ...emptyDocument,
                        text: item.text,
                        result: {
                          text: item.text,
                          confidence: item.confidence ?? 0,
                          words: [],
                        },
                        name: item.name,
                        elapsed: item.elapsed ?? 0,
                      };
                      if (result) {
                        setCandidate(restored);
                        setModal("compare");
                      } else {
                        dispatch({ type: "reset", document: restored });
                        setModal(null);
                      }
                      setShowRaw(false);
                      setStage("Saved text restored");
                      setToast(
                        "Saved text restored. The original image was not stored.",
                      );
                    }}
                  >
                    <FileText size={18} />
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.text.slice(0, 90)}</span>
                      <small>{new Date(item.date).toLocaleString()}</small>
                    </div>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="history-empty">
              <History size={32} />
              <h3>
                {historyOn
                  ? "Ready for your next read."
                  : "A fresh start, every time."}
              </h3>
              <p>
                {historyOn
                  ? "Your next results will appear here."
                  : "Turn on local history if you’d like to keep recent results."}
              </p>
            </div>
          )}
        </Modal>
      )}
      {modal === "crop" && (
        <Modal
          title="Keep the words you need"
          wide
          onClose={() => setModal(null)}
        >
          <p className="crop-instructions">
            Drag a box around the text you want to read.
          </p>
          <div className="crop-container">
            <ReactCrop crop={crop} onChange={(c) => setCrop(c)}>
              <img
                ref={cropImage}
                src={sourceUrl}
                alt="Select the area to extract"
              />
            </ReactCrop>
          </div>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={!crop?.width || !crop?.height}
              onClick={applyCrop}
            >
              <Crop size={16} />
              Crop & read
            </button>
          </div>
        </Modal>
      )}
      {modal === "zoom" && (
        <Modal
          title={tab === "cleaned" ? "Cleaned image" : "Your image"}
          wide
          onClose={() => setModal(null)}
        >
          <img
            className="zoom-image"
            src={tab === "cleaned" ? cleanUrl : sourceUrl}
            alt="Enlarged image"
          />
        </Modal>
      )}
    </>
  );
}
