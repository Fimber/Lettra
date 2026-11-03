"use client";
import { useMemo, useRef } from "react";
export function EditableText({
  value,
  readOnly,
  onChange,
  uncertain,
}: {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  uncertain: { text: string; confidence: number }[];
}) {
  const mirror = useRef<HTMLDivElement>(null);
  const scores = useMemo(
    () => new Map(uncertain.map((word) => [word.text, word.confidence])),
    [uncertain],
  );
  return (
    <div className="text-editor">
      <div className="text-mirror" ref={mirror} aria-hidden="true" dir="auto">
        {value
          .split(/(\s+)/)
          .map((token, i) =>
            scores.has(token) ? <mark key={i}>{token}</mark> : token,
          )}
        {"\n"}
      </div>
      <textarea
        aria-label={readOnly ? "Raw extracted text" : "Editable extracted text"}
        readOnly={readOnly}
        value={value}
        spellCheck={false}
        dir="auto"
        onChange={(e) => onChange(e.target.value)}
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
