import type { Settings } from "./settings";
import { cleanText } from "./cleanup";
export type OCRWord = {
  id: number;
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
export type OCRResult = { text: string; confidence: number; words: OCRWord[] };
export type Anchor = { id: number; start: number; end: number };
export type OutputMode = "preserve" | "paragraphs" | "numbers" | "custom";
export type EditorDocument = {
  text: string;
  result: OCRResult | null;
  anchors: Anchor[];
  reviewed: number[];
  imageUrl: string;
  width: number;
  height: number;
  source: HTMLCanvasElement | null;
  sourceUrl: string;
  name: string;
  size: number;
  elapsed: number;
  outputMode: OutputMode;
};
export const emptyDocument: EditorDocument = {
  text: "",
  result: null,
  anchors: [],
  reviewed: [],
  imageUrl: "",
  width: 0,
  height: 0,
  source: null,
  sourceUrl: "",
  name: "",
  size: 0,
  elapsed: 0,
  outputMode: "preserve",
};
export function outputText(
  raw: string,
  settings: Settings,
  mode: OutputMode,
): string {
  if (mode === "preserve") return raw.replace(/\r\n?/g, "\n").trim();
  return cleanText(
    raw,
    mode === "paragraphs"
      ? {
          ...settings.cleanup,
          joinHyphens: true,
          mergeLines: true,
          preserveSpaces: false,
        }
      : settings.cleanup,
    mode === "numbers" || settings.numbersOnly,
  );
}
// Each occurrence gets its own anchor, even when the same word repeats.
export function anchorWords(words: OCRWord[], text: string): Anchor[] {
  const anchors: Anchor[] = [];
  let cursor = 0;
  for (const word of words) {
    if (!word.text) continue;
    let start = text.indexOf(word.text, cursor);
    while (
      start >= 0 &&
      ((start > 0 &&
        /[\p{L}\p{N}_]/u.test(text[start - 1]) &&
        /[\p{L}\p{N}_]/u.test(word.text[0])) ||
        (/[\p{L}\p{N}_]/u.test(text[start + word.text.length] ?? "") &&
          /[\p{L}\p{N}_]/u.test(word.text.at(-1)!)))
    )
      start = text.indexOf(word.text, start + 1);
    if (start < 0) continue;
    anchors.push({ id: word.id, start, end: start + word.text.length });
    cursor = start + word.text.length;
  }
  return anchors;
}
// Never guess a word's position after an edit crosses its boundaries.
export function editDocument(
  doc: EditorDocument,
  text: string,
): EditorDocument {
  if (text === doc.text) return doc;
  let start = 0;
  while (
    start < text.length &&
    start < doc.text.length &&
    text[start] === doc.text[start]
  )
    start++;
  let oldEnd = doc.text.length,
    newEnd = text.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    doc.text[oldEnd - 1] === text[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  const anchors = doc.anchors
    .flatMap((a) =>
      a.end <= start
        ? [a]
        : a.start >= oldEnd
          ? [{ ...a, start: a.start + delta, end: a.end + delta }]
          : [],
    )
    .filter((a) => {
      // Inserting a letter beside a word or deleting its separating space also
      // changes that word. Do not retain a clickable partial-word anchor.
      const token = text.slice(a.start, a.end);
      return !(
        (/[\p{L}\p{N}_]/u.test(text[a.start - 1] ?? "") &&
          /[\p{L}\p{N}_]/u.test(token[0] ?? "")) ||
        (/[\p{L}\p{N}_]/u.test(text[a.end] ?? "") &&
          /[\p{L}\p{N}_]/u.test(token.at(-1) ?? ""))
      );
    });
  return { ...doc, text, anchors };
}
// Map whitespace-only cleanup by character order. For changes to the words
// themselves, keep only proven untouched ranges, never re-match a duplicate.
export function anchorsForOutput(
  words: OCRWord[],
  raw: string,
  text: string,
): Anchor[] {
  const original = raw.replace(/\r\n?/g, "\n").trim();
  const anchors = anchorWords(words, original);
  if (original === text) return anchors;
  if (original.replace(/\s/g, "") === text.replace(/\s/g, "")) {
    const locations = new Map<number, number>();
    let cursor = 0;
    for (let i = 0; i < original.length; i++) {
      if (/\s/.test(original[i])) continue;
      while (/\s/.test(text[cursor] ?? "")) cursor++;
      locations.set(i, cursor++);
    }
    return anchors.flatMap((a) => {
      const start = locations.get(a.start),
        end = locations.get(a.end - 1);
      return start !== undefined && end !== undefined
        ? [{ ...a, start, end: end + 1 }]
        : [];
    });
  }
  return editDocument({ ...emptyDocument, text: original, anchors }, text)
    .anchors;
}
export type EditorHistory = {
  past: EditorDocument[];
  present: EditorDocument;
  future: EditorDocument[];
  typedAt: number;
};
export const initialHistory: EditorHistory = {
  past: [],
  present: emptyDocument,
  future: [],
  typedAt: 0,
};
type Action =
  | { type: "reset"; document: EditorDocument }
  | { type: "commit"; document: EditorDocument }
  | { type: "edit"; text: string; at: number }
  | { type: "undo" }
  | { type: "redo" };
function bounded(past: EditorDocument[]) {
  const images = new Set<string>();
  let cut = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    images.add(past[i].imageUrl);
    if (images.size > 4) {
      cut = i + 1;
      break;
    }
  }
  return past.slice(Math.max(cut, past.length - 40));
}
export function editorReducer(
  state: EditorHistory,
  action: Action,
): EditorHistory {
  if (action.type === "reset")
    return { ...initialHistory, present: action.document };
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous
      ? {
          past: state.past.slice(0, -1),
          present: previous,
          future: [state.present, ...state.future],
          typedAt: 0,
        }
      : state;
  }
  if (action.type === "redo") {
    const next = state.future[0];
    return next
      ? {
          past: bounded([...state.past, state.present]),
          present: next,
          future: state.future.slice(1),
          typedAt: 0,
        }
      : state;
  }
  const next =
    action.type === "edit"
      ? editDocument(state.present, action.text)
      : action.document;
  if (next === state.present) return state;
  const coalesce =
    action.type === "edit" &&
    state.typedAt > 0 &&
    action.at - state.typedAt < 700 &&
    state.future.length === 0;
  return {
    past: coalesce ? state.past : bounded([...state.past, state.present]),
    present: next,
    future: [],
    typedAt: action.type === "edit" ? action.at : 0,
  };
}
