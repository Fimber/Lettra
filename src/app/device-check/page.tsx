"use client";
import { useEffect, useRef, useState } from "react";
import { normalizeFile } from "@/lib/input";
import { defaults, applyPreset } from "@/lib/settings";
import { preprocess, recognize, cancelReader } from "@/lib/reader";
import { sampleFile, type Sample } from "@/lib/samples";
import { score } from "../../../scripts/accuracy-metrics.mjs";
import { downloadBlob } from "@/lib/download";
import "./style.css";
type Check = {
  name: string;
  status: "pass" | "fail" | "completed";
  seconds?: number;
  detail: string;
  cer?: number;
};
const references = {
  note: "A little room for good ideas.\nFIELD NOTES / NOVEMBER 2026\nGood ideas rarely arrive fully formed.\nThey begin as a sentence in a notebook,\na conversation on a walk, or a paragraph\nyou want to come back to.\nKeep a little space for the things that\nmake you stop and think. Write them down.\nMake something of them.",
  dark: "notes.md\nMake the useful things simple.\nSmall tools. Thoughtful details.\nA little less friction in your day.\nYour images stay on your device.\nYour words are yours to keep.",
};
export default function DeviceCheck() {
  const [checks, setChecks] = useState<Check[]>([]),
    [busy, setBusy] = useState(false),
    [stage, setStage] = useState("Ready"),
    [physical, setPhysical] = useState(false),
    [kind, setKind] = useState("unknown"),
    [manual, setManual] = useState<Record<string, boolean>>({}),
    [info, setInfo] = useState<Record<string, unknown>>({});
  const token = useRef(0),
    startedAt = useRef("");
  useEffect(() => {
    const nav = navigator as Navigator & { deviceMemory?: number };
    setInfo({
      userAgent: nav.userAgent,
      platform: nav.platform,
      hardwareConcurrency: nav.hardwareConcurrency,
      deviceMemoryGB: nav.deviceMemory ?? null,
      screen: {
        width: screen.width,
        height: screen.height,
        dpr: devicePixelRatio,
      },
      viewport: { width: innerWidth, height: innerHeight },
      secureContext: isSecureContext,
    });
    setKind(
      /Android/i.test(nav.userAgent)
        ? "android"
        : /iPhone/i.test(nav.userAgent)
          ? "iphone"
          : "desktop-or-emulator",
    );
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      token.current++;
      cancelReader();
    };
  }, []);
  async function read(file: File) {
    const canvas = await normalizeFile(file),
      cleaned = await preprocess(canvas, defaults);
    return recognize(cleaned, defaults, (status, progress) => {
      if (status === "recognizing text")
        setStage(`Reading on this device · ${Math.round(progress * 100)}%`);
    });
  }
  async function run() {
    const run = ++token.current;
    cancelReader();
    setChecks([]);
    setBusy(true);
    startedAt.current = new Date().toISOString();
    const next: Check[] = [];
    const add = (check: Check) => {
      next.push(check);
      if (token.current === run) setChecks([...next]);
    };
    try {
      add({
        name: "Browser capabilities",
        status:
          typeof Worker !== "undefined" &&
          typeof WebAssembly !== "undefined" &&
          typeof createImageBitmap !== "undefined"
            ? "pass"
            : "fail",
        detail: `Workers, WebAssembly and image decoding. OffscreenCanvas: ${typeof OffscreenCanvas !== "undefined"}.`,
      });
      for (const sample of ["note", "dark", "receipt"] as Sample[]) {
        setStage(`Checking ${sample} recognition`);
        const file = await sampleFile(sample),
          start = performance.now();
        const result = await read(file),
          seconds = (performance.now() - start) / 1000;
        if (token.current !== run) return;
        if (sample !== "receipt") {
          const metrics = score(references[sample], result.text);
          add({
            name: sample === "note" ? "Printed text" : "Dark image",
            status: metrics.cer < 0.02 ? "pass" : "fail",
            seconds,
            cer: metrics.cer,
            detail: `${(metrics.cer * 100).toFixed(2)}% character error on the built-in fixture. ${sample === "note" ? "First reader initialization in this run; downloads may be cached." : "Reader reused."}`,
          });
        } else {
          const expected = [
              "4.50",
              "6.00",
              "12.00",
              "3.50",
              "26.00",
              "1.30",
              "27.30",
            ],
            amounts = result.text.match(/\b\d+\.\d{2}\b/g) || [];
          add({
            name: "Receipt amounts",
            status:
              JSON.stringify(expected) === JSON.stringify(amounts)
                ? "pass"
                : "fail",
            seconds,
            detail: `Expected ${expected.join(", ")}. Read ${amounts.join(", ") || "no amounts"}.`,
          });
        }
      }
      setStage("Checking cancellation and recovery");
      const canvas = await normalizeFile(await sampleFile("note"));
      const pending = preprocess(canvas, applyPreset(defaults, "document"));
      cancelReader();
      let cancelled = false;
      try {
        await pending;
      } catch (e) {
        cancelled = e instanceof Error && e.message === "Cancelled";
      }
      if (token.current !== run) return;
      add({
        name: "Cancellation",
        status: cancelled ? "pass" : "fail",
        detail: "Cancelled a pending image-processing job.",
      });
      const recovered = await read(await sampleFile("note"));
      if (token.current !== run) return;
      add({
        name: "Reader recovery",
        status: recovered.text.includes("Good ideas") ? "pass" : "fail",
        detail: "A new extraction completed after cancellation.",
      });
      const resources = performance.getEntriesByType(
        "resource",
      ) as PerformanceResourceTiming[];
      const external = resources
        .filter(
          (r) =>
            /^https?:/.test(r.name) &&
            new URL(r.name).origin !== location.origin,
        )
        .map((r) => new URL(r.name).origin);
      add({
        name: "Local processing requests",
        status: external.length ? "fail" : "pass",
        detail: external.length
          ? `Observed external origins: ${[...new Set(external)].join(", ")}`
          : "All observed resource requests stayed on this site's origin. Images were processed in memory.",
      });
      setStage("Automatic checks complete. Finish the hands-on checks below.");
    } catch (e) {
      if (token.current === run) {
        add({
          name: "Run error",
          status: "fail",
          detail: e instanceof Error ? e.message : String(e),
        });
        setStage("A check failed. Download the report to investigate.");
      }
    } finally {
      if (token.current === run) setBusy(false);
    }
  }
  async function photo(file: File) {
    const run = ++token.current;
    if (!startedAt.current) startedAt.current = new Date().toISOString();
    setBusy(true);
    setStage("Reading your camera photo");
    try {
      const start = performance.now(),
        result = await read(file);
      if (token.current !== run) return;
      setChecks((old) => [
        ...old,
        {
          name: "Camera/file photo",
          status: result.text.trim() ? "completed" : "fail",
          seconds: (performance.now() - start) / 1000,
          detail: `Read ${result.text.length} characters. This measures completion and time, not accuracy; no photo or text is included in the report.`,
        },
      ]);
      setStage(
        "Photo processed locally. Check accuracy in the main workspace.",
      );
    } catch (e) {
      if (token.current === run)
        setChecks((old) => [
          ...old,
          {
            name: "Camera/file photo",
            status: "fail",
            detail: e instanceof Error ? e.message : String(e),
          },
        ]);
    } finally {
      if (token.current === run) setBusy(false);
    }
  }
  function download() {
    const report = {
      schemaVersion: 1,
      suite: "lettra-device-check-2026-11-03",
      startedAt: startedAt.current,
      finishedAt: new Date().toISOString(),
      hardware: {
        kind,
        physicalPhoneSelfReported: physical,
        evidence:
          "User declaration and browser-reported properties; no hardware attestation",
        ...info,
      },
      checks,
      handsOn: manual,
      limitations: [
        "Built-in fixtures are smoke tests, not the 50-image corpus.",
        "A desktop or emulated run does not count as a physical-phone test.",
        "Camera capture, paste/copy/download, rotation, keyboard and offline checks require hands-on confirmation.",
      ],
    };
    downloadBlob(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
      `lettra-device-check-${kind}.json`,
    );
  }
  return (
    <main className="device-check">
      <a className="device-back" href="/">
        ← Back to Lettra
      </a>
      <h1>Check Lettra on this device.</h1>
      <p>
        Run this page in Safari on an iPhone or Chrome on an Android phone.
        Tests and reports stay in this browser. Nothing is submitted
        automatically.
      </p>
      <section className="device-card">
        <h2>1. Identify the device</h2>
        <label>
          Device{" "}
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="unknown">Choose a device</option>
            <option value="android">Android phone</option>
            <option value="iphone">iPhone</option>
            <option value="desktop-or-emulator">Desktop or emulator</option>
          </select>
        </label>
        <label className="device-checkline">
          <input
            type="checkbox"
            checked={physical}
            onChange={(e) => setPhysical(e.target.checked)}
          />
          I am running this on a physical phone.
        </label>
        <small>
          Browser emulation is useful, but does not verify phone hardware,
          memory limits or camera behavior.
        </small>
      </section>
      <section className="device-card">
        <h2>2. Run automatic checks</h2>
        <p>
          Keep this tab open. The first run downloads the local OCR reader;
          later runs reuse cached assets.
        </p>
        <div className="device-buttons">
          <button className="primary" onClick={run} disabled={busy}>
            Run device checks
          </button>
          {busy && (
            <button
              className="secondary"
              onClick={() => {
                token.current++;
                cancelReader();
                setBusy(false);
                setStage("Cancelled. Start again when ready.");
              }}
            >
              Cancel checks
            </button>
          )}
        </div>
        <p role="status">{stage}</p>
        <ul className="device-results">
          {checks.map((check, i) => (
            <li key={i}>
              <div>
                <strong>{check.name}</strong>
                <span className={`device-${check.status}`}>
                  {check.status.toUpperCase()}
                  {check.seconds !== undefined
                    ? ` · ${check.seconds.toFixed(2)}s`
                    : ""}
                </span>
              </div>
              <p>{check.detail}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="device-card">
        <h2>3. Try a camera photo</h2>
        <p>
          Photograph a printed paragraph in good light. Aim for completion
          within 15 seconds on a mid-range Android. This check does not save or
          upload the photo.
        </p>
        <label className="device-file">
          Take or choose a photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={(e) => {
              if (e.target.files?.[0]) void photo(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </label>
      </section>
      <section className="device-card">
        <h2>4. Hands-on checks</h2>
        <p>
          In the{" "}
          <a href="/" target="_blank" rel="noreferrer">
            main workspace
          </a>
          , perform each check, then mark only those you actually verified.
        </p>
        {[
          [
            "camera",
            "The camera opened, captured an image and produced readable text.",
          ],
          ["clipboard", "Copy text pasted correctly into another app."],
          ["download", "The TXT download opened with the expected text."],
          [
            "keyboard",
            "I edited a word with the phone keyboard and used Undo without losing text.",
          ],
          [
            "review",
            "Word review, image zoom and the settings sheet worked with touch.",
          ],
          [
            "rotation",
            "Portrait and landscape layouts remained usable without clipped controls.",
          ],
          [
            "offline",
            "After one online read, airplane mode + a reload still allowed another read.",
          ],
          [
            "repeat",
            "Ten consecutive images completed without a crash or tab reload.",
          ],
        ].map(([key, label]) => (
          <label className="device-checkline" key={key}>
            <input
              type="checkbox"
              checked={!!manual[key]}
              onChange={(e) =>
                setManual((old) => ({ ...old, [key]: e.target.checked }))
              }
            />
            {label}
          </label>
        ))}
        <button
          className="primary"
          disabled={!checks.length || busy}
          onClick={download}
        >
          Download device report
        </button>
        <p className="device-note">
          A downloaded report records failures too. Share that file with the
          developer so issues can be reproduced; it contains device details and
          timings, not your photo or its text.
        </p>
      </section>
    </main>
  );
}
