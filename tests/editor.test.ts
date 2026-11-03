import { describe, it, expect } from "vitest";
import {
  anchorWords,
  anchorsForOutput,
  editDocument,
  editorReducer,
  initialHistory,
  emptyDocument,
  outputText,
  type OCRWord,
  type EditorDocument,
} from "../src/lib/editor";
import { defaults } from "../src/lib/settings";
const word = (id: number, text: string): OCRWord => ({
  id,
  text,
  confidence: 40,
  bbox: { x0: id * 20, y0: 0, x1: id * 20 + 15, y1: 15 },
});
function document(text: string): EditorDocument {
  const words = text.split(" ").map((text, id) => word(id, text));
  return {
    ...emptyDocument,
    text,
    result: { text, confidence: 90, words },
    anchors: anchorWords(words, text),
    imageUrl: "first-image",
    name: "first.png",
  };
}
describe("word locations", () => {
  it("preserves exact occurrence locations when paragraph whitespace changes", () => {
    expect(
      anchorsForOutput([word(0, "a"), word(1, "a")], "a\n  a", "a a"),
    ).toEqual([
      { id: 0, start: 0, end: 1 },
      { id: 1, start: 2, end: 3 },
    ]);
  });
  it("does not relocate a merged word onto a later duplicate", () => {
    expect(
      anchorsForOutput(
        [word(0, "a-"), word(1, "b"), word(2, "a-")],
        "a-\nb a-",
        "ab a-",
      ),
    ).toEqual([{ id: 2, start: 3, end: 5 }]);
  });
  it("tracks repeated words independently", () => {
    expect(
      anchorWords([word(0, "total"), word(1, "total")], "total total"),
    ).toEqual([
      { id: 0, start: 0, end: 5 },
      { id: 1, start: 6, end: 11 },
    ]);
  });
  it("does not mistake a partial word for a separate occurrence", () => {
    expect(anchorWords([word(0, "test")], "testing test")[0].start).toBe(8);
  });
  it("shifts unchanged anchors after an insertion", () => {
    const next = editDocument(document("Hello world"), "Hello bright world");
    expect(next.anchors.find((a) => a.id === 1)).toEqual({
      id: 1,
      start: 13,
      end: 18,
    });
  });
  it("invalidates only the edited word instead of highlighting another occurrence", () => {
    const next = editDocument(document("total total"), "sum total");
    expect(next.anchors).toEqual([{ id: 1, start: 4, end: 9 }]);
  });
  it("invalidates ranges spanning a deletion", () =>
    expect(editDocument(document("a b c"), "ac").anchors).toEqual([]));
  it("invalidates a token when letters are appended or its space is removed", () => {
    expect(editDocument(document("cat dog"), "cats dog").anchors).toEqual([
      { id: 1, start: 5, end: 8 },
    ]);
    expect(editDocument(document("cat dog"), "catdog").anchors).toEqual([]);
  });
});
describe("protected document history", () => {
  it("undoes an accepted rerun with its original image and text", () => {
    const first = document("my correction");
    const initial = editorReducer(initialHistory, {
      type: "reset",
      document: first,
    });
    const replacement = {
      ...document("new OCR"),
      imageUrl: "second-image",
      name: "second.png",
    };
    const accepted = editorReducer(initial, {
      type: "commit",
      document: replacement,
    });
    const undone = editorReducer(accepted, { type: "undo" });
    expect(undone.present).toBe(first);
    expect(editorReducer(undone, { type: "redo" }).present).toBe(replacement);
  });
  it("coalesces adjacent typing while keeping a pre-edit undo point", () => {
    let state = editorReducer(initialHistory, {
      type: "reset",
      document: document("Hello"),
    });
    state = editorReducer(state, { type: "edit", text: "Hello a", at: 1000 });
    state = editorReducer(state, { type: "edit", text: "Hello ab", at: 1100 });
    expect(state.past).toHaveLength(1);
    expect(editorReducer(state, { type: "undo" }).present.text).toBe("Hello");
  });
  it("discards redo only after a new edit", () => {
    let state = editorReducer(initialHistory, {
      type: "reset",
      document: document("original"),
    });
    state = editorReducer(state, {
      type: "edit",
      text: "first edit",
      at: 1000,
    });
    state = editorReducer(state, { type: "undo" });
    expect(state.future).toHaveLength(1);
    state = editorReducer(state, {
      type: "edit",
      text: "second edit",
      at: 1100,
    });
    expect(state.future).toHaveLength(0);
  });
  it("keeps review decisions undoable", () => {
    const doc = document("27.38");
    const state = editorReducer(
      editorReducer(initialHistory, { type: "reset", document: doc }),
      { type: "commit", document: { ...doc, reviewed: [0] } },
    );
    expect(editorReducer(state, { type: "undo" }).present.reviewed).toEqual([]);
  });
  it("limits retained image versions and edit checkpoints", () => {
    let state = initialHistory;
    for (let i = 0; i < 60; i++)
      state = editorReducer(state, {
        type: "commit",
        document: { ...document(String(i)), imageUrl: "image-" + i },
      });
    expect(new Set(state.past.map((d) => d.imageUrl)).size).toBeLessThanOrEqual(
      4,
    );
    expect(state.past.length).toBeLessThanOrEqual(40);
  });
});
describe("output modes", () => {
  it("preserves code and spacing without cleanup", () =>
    expect(outputText("_private  =  1\n| value", defaults, "preserve")).toBe(
      "_private  =  1\n| value",
    ));
  it("offers paragraph cleanup independently", () =>
    expect(outputText("A line\ncontinues here", defaults, "paragraphs")).toBe(
      "A line continues here",
    ));
});
