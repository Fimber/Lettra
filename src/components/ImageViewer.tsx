"use client";
import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import type { OCRWord } from "@/lib/editor";
export function ImageViewer({
  url,
  alt,
  word,
}: {
  url: string;
  alt: string;
  word?: OCRWord | null;
}) {
  const container = useRef<HTMLDivElement>(null),
    drag = useRef<{ x: number; y: number; left: number; top: number } | null>(
      null,
    );
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 }),
    [viewport, setViewport] = useState({ width: 400, height: 400 }),
    [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const fit = Math.max(
    0.01,
    Math.min(
      (viewport.width - 32) / dimensions.width,
      (viewport.height - 32) / dimensions.height,
      1,
    ),
  );
  const scale = fit * zoom;
  useEffect(() => {
    setZoom(1);
  }, [url]);
  useEffect(() => {
    if (word)
      setZoom(
        Math.max(
          1,
          Math.min(
            5,
            viewport.width / ((word.bbox.x1 - word.bbox.x0 + 140) * fit),
          ),
        ),
      );
  }, [word, fit, viewport.width]);
  useLayoutEffect(() => {
    if (!word || !container.current) return;
    const el = container.current;
    const offsetX = Math.max(
        16,
        (viewport.width - dimensions.width * scale) / 2,
      ),
      offsetY = Math.max(16, (viewport.height - dimensions.height * scale) / 2);
    el.scrollLeft =
      offsetX +
      ((word.bbox.x0 + word.bbox.x1) / 2) * scale -
      viewport.width / 2;
    el.scrollTop =
      offsetY +
      ((word.bbox.y0 + word.bbox.y1) / 2) * scale -
      viewport.height / 2;
  }, [word, scale, dimensions, viewport]);
  return (
    <div className="viewer">
      <div className="viewer-controls">
        <span>
          {word
            ? "Selected word in the reader’s image"
            : "Drag to pan when zoomed"}
        </span>
        <button
          aria-label="Zoom out"
          disabled={zoom <= 1}
          onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
        >
          <ZoomOut size={17} />
        </button>
        <span className="zoom-value">{Math.round(zoom * 100)}%</span>
        <button
          aria-label="Zoom in"
          disabled={zoom >= 6}
          onClick={() => setZoom((z) => Math.min(6, z + 0.5))}
        >
          <ZoomIn size={17} />
        </button>
        <button
          aria-label="Fit image"
          onClick={() => {
            setZoom(1);
            container.current?.scrollTo(0, 0);
          }}
        >
          <Maximize2 size={16} />
        </button>
      </div>
      <div
        className={`viewer-viewport ${zoom > 1 ? "pannable" : ""}`}
        ref={container}
        tabIndex={0}
        aria-label="Image preview; use arrow keys to pan"
        onPointerDown={(e) => {
          if (zoom <= 1) return;
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            left: e.currentTarget.scrollLeft,
            top: e.currentTarget.scrollTop,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          e.currentTarget.scrollLeft =
            drag.current.left - (e.clientX - drag.current.x);
          e.currentTarget.scrollTop =
            drag.current.top - (e.clientY - drag.current.y);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <div
          className="viewer-stage"
          style={{
            width: Math.max(viewport.width, dimensions.width * scale + 32),
            height: Math.max(viewport.height, dimensions.height * scale + 32),
          }}
        >
          <div
            className="viewer-image"
            style={{
              width: dimensions.width * scale,
              height: dimensions.height * scale,
            }}
          >
            <img
              src={url}
              alt={alt}
              draggable={false}
              onLoad={(e) =>
                setDimensions({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
            />
            {word && (
              <span
                className="word-box"
                aria-label={`Image location of ${word.text}`}
                style={{
                  left: word.bbox.x0 * scale - 3,
                  top: word.bbox.y0 * scale - 3,
                  width: (word.bbox.x1 - word.bbox.x0) * scale + 6,
                  height: (word.bbox.y1 - word.bbox.y0) * scale + 6,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
