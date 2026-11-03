"use client";
import { useState, useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import type { OCRWord } from "@/lib/editor";
export function WordReview({
  word,
  imageUrl,
  currentValue,
  canReplace,
  index,
  total,
  onMove,
  onReplace,
  onConfirm,
  onClose,
}: {
  word: OCRWord;
  imageUrl: string;
  currentValue: string;
  canReplace: boolean;
  index: number;
  total: number;
  onMove: (direction: number) => void;
  onReplace: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState(currentValue);
  useEffect(() => {
    setDraft(currentValue);
  }, [word.id, currentValue]);
  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive || !canvas.current) return;
      const pad = 20,
        x = Math.max(0, word.bbox.x0 - pad),
        y = Math.max(0, word.bbox.y0 - pad),
        w = Math.min(img.width - x, word.bbox.x1 - word.bbox.x0 + pad * 2),
        h = Math.min(img.height - y, word.bbox.y1 - word.bbox.y0 + pad * 2);
      if (w <= 0 || h <= 0) return;
      const surface = canvas.current;
      surface.width = w * 3;
      surface.height = h * 3;
      const ctx = surface.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, w, h, 0, 0, surface.width, surface.height);
    };
    img.src = imageUrl;
    return () => {
      alive = false;
    };
  }, [word, imageUrl]);
  return (
    <section className="word-review" aria-label="Review selected word">
      <div className="review-heading">
        <div>
          <strong>Check against the image</strong>
          <span>
            Word {index + 1} of {total} · {Math.round(word.confidence)}% reader
            confidence
          </span>
        </div>
        <button
          className="icon-button"
          aria-label="Close word review"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      <div className="word-crop">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Enlarged source image for ${word.text}`}
        />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canReplace) onReplace(draft);
        }}
      >
        <label>
          Correct this word
          <input
            aria-label="Correct this word"
            value={draft}
            disabled={!canReplace}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        {!canReplace && (
          <p>
            This word was changed or merged. Edit it in the text panel, then
            mark it checked.
          </p>
        )}
        <div className="review-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous uncertain word"
            disabled={total < 2}
            onClick={() => onMove(-1)}
          >
            <ArrowLeft size={18} />
          </button>
          <button type="button" className="secondary" onClick={onConfirm}>
            <Check size={16} />
            Looks right
          </button>
          <button
            type="submit"
            className="primary"
            disabled={!canReplace || draft === currentValue}
          >
            Apply correction
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Next uncertain word"
            disabled={total < 2}
            onClick={() => onMove(1)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </form>
      <small>
        Alt + ← / → moves between words. Your corrections are undoable.
      </small>
    </section>
  );
}
