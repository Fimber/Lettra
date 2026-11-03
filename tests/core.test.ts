import { describe, it, expect } from "vitest";
import { cleanText } from "../src/lib/cleanup";
import { inspectHeader } from "../src/lib/input";
import { defaults, applyPreset } from "../src/lib/settings";
describe("predictable text cleanup", () => {
  it("preserves meaningful symbol prefixes in code", () =>
    expect(cleanText("_private\n~value\n|operator", defaults.cleanup)).toBe(
      "_private\n~value\n|operator",
    ));
  it("removes only separated edge noise", () =>
    expect(cleanText("| a sentence ~\n_\nmore text", defaults.cleanup)).toBe(
      "a sentence\n\nmore text",
    ));
  it("joins line-end hyphens without replacing names or code", () =>
    expect(cleanText("informa-\ntion\nOpenAI foo_bar", defaults.cleanup)).toBe(
      "information\nOpenAI foo_bar",
    ));
  it("preserves column alignment by default", () =>
    expect(cleanText("Name     Value\nfoo      2", defaults.cleanup)).toBe(
      "Name     Value\nfoo      2",
    ));
  it("only merges a continuation that starts lowercase", () =>
    expect(
      cleanText("A sentence\ncontinues here.\nNew sentence.", {
        ...defaults.cleanup,
        mergeLines: true,
      }),
    ).toBe("A sentence continues here.\nNew sentence."));
  it("does not merge paragraphs", () =>
    expect(
      cleanText("A thought\n\ncontinues later", {
        ...defaults.cleanup,
        mergeLines: true,
      }),
    ).toBe("A thought\n\ncontinues later"));
  it("fixes numbers only when requested and predominantly digits", () => {
    expect(cleanText("12O5 CODE 1O", defaults.cleanup, true)).toBe(
      "1205 CODE 1O",
    );
    expect(cleanText("12O5", defaults.cleanup, false)).toBe("12O5");
  });
  it("treats extracted markup as text", () =>
    expect(cleanText("<script>alert(1)</script>", defaults.cleanup)).toBe(
      "<script>alert(1)</script>",
    ));
});
describe("input validation", () => {
  it("rejects disguised executable or SVG", () => {
    expect(() =>
      inspectHeader(new TextEncoder().encode('<svg onload="alert(1)">')),
    ).toThrow();
    expect(() => inspectHeader(new Uint8Array([77, 90, 1, 2]))).toThrow();
  });
  it("reads PNG dimensions before decoding", () => {
    const b = new Uint8Array(24);
    b.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const v = new DataView(b.buffer);
    v.setUint32(16, 100000);
    v.setUint32(20, 50000);
    expect(inspectHeader(b)).toEqual({
      type: "image/png",
      width: 100000,
      height: 50000,
    });
  });
  it("reads GIF first frame dimensions", () => {
    const b = new Uint8Array(10);
    b.set(new TextEncoder().encode("GIF89a"));
    b[6] = 100;
    b[8] = 80;
    expect(inspectHeader(b)).toEqual({
      type: "image/gif",
      width: 100,
      height: 80,
    });
  });
  it("recognizes JPEG SOF dimensions", () => {
    const b = new Uint8Array([
      255, 216, 255, 192, 0, 17, 8, 1, 44, 2, 88, 3, 1, 17, 0, 2, 17, 0, 3, 17,
      0,
    ]);
    expect(inspectHeader(b)).toEqual({
      type: "image/jpeg",
      width: 600,
      height: 300,
    });
  });
});
describe("settings", () => {
  it("keeps screenshot whitespace and disables thresholding", () => {
    const s = applyPreset(defaults, "screenshot");
    expect(s.steps.threshold).toBe("none");
    expect(s.cleanup.preserveSpaces).toBe(true);
    expect(s.psm).toBe(6);
  });
  it("does not mutate defaults", () => {
    const s = applyPreset(defaults, "receipt");
    s.steps.grayscale = false;
    expect(defaults.steps.grayscale).toBe(true);
  });
});
