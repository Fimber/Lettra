"use client";
import { useMemo, useRef, useEffect } from "react";
import type { Anchor } from "@/lib/editor";
export function EditableText({
  value,
  readOnly,
  onChange,
  anchors,
  highlightIds,
  activeId,
  onReview,
  onUndo,
  onRedo,
}: {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  anchors: Anchor[];
  highlightIds: number[];
  activeId: number | null;
  onReview: (id: number) => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const mirror = useRef<HTMLDivElement>(null),
    editor = useRef<HTMLTextAreaElement>(null);
  const highlights = useMemo(() => {
    const ids = new Set(highlightIds);
    return anchors.filter((a) => ids.has(a.id));
  }, [anchors, highlightIds]);
  useEffect(() => {
    if (activeId === null || readOnly) return;
    const range = anchors.find((a) => a.id === activeId);
    if (range && editor.current)
      editor.current.setSelectionRange(range.start, range.end);
  }, [activeId, readOnly, anchors]);
  const pieces: React.ReactNode[] = [];
  let cursor = 0;
  if (!readOnly)
    for (const range of highlights) {
      pieces.push(value.slice(cursor, range.start));
      pieces.push(
        <mark
          key={range.id}
          className={range.id === activeId ? "active-word" : ""}
        >
          {value.slice(range.start, range.end)}
        </mark>,
      );
      cursor = range.end;
    }
  pieces.push(value.slice(cursor));
  return (
    <div className="text-editor">
      <div className="text-mirror" ref={mirror} aria-hidden="true" dir="auto">
        {pieces}
        {"\n"}
      </div>
      <textarea
        ref={editor}
        aria-label={readOnly ? "Raw extracted text" : "Editable extracted text"}
        aria-describedby="editor-hint"
        readOnly={readOnly}
        value={value}
        spellCheck={false}
        dir="auto"
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          if (readOnly) return;
          const position = e.currentTarget.selectionStart;
          const word = highlights.find(
            (a) => position >= a.start && position < a.end,
          );
          if (word) onReview(word.id);
        }}
        onKeyDown={(e) => {
          if (
            (e.ctrlKey || e.metaKey) &&
            !e.altKey &&
            (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")
          ) {
            e.preventDefault();
            if (e.shiftKey || e.key.toLowerCase() === "y") onRedo();
            else onUndo();
          }
        }}
        onScroll={(e) => {
          if (mirror.current) {
            mirror.current.scrollTop = e.currentTarget.scrollTop;
            mirror.current.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
      />
    </div>
  );
}
