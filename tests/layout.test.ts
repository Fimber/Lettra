import { describe, expect, it } from "vitest";
import { needsRowLayout } from "../src/lib/layout";
const word = (text: string, y: number) => ({
  text,
  bbox: { x0: 0, x1: 50, y0: y, y1: y + 20 },
});
describe("structured reading order", () => {
  it("detects a columnwise numeric table", () => {
    expect(
      needsRowLayout(
        [
          ...Array.from({ length: 10 }, (_, i) => word(`Item`, i * 40)),
          ...Array.from({ length: 10 }, (_, i) => word(`${i}.00`, i * 40)),
        ],
        500,
      ),
    ).toBe(true);
  });
  it("preserves rowwise tables and multicolumn prose", () => {
    expect(
      needsRowLayout(
        Array.from({ length: 20 }, (_, i) => word(`${i}.00`, i * 20)),
        500,
      ),
    ).toBe(false);
    expect(
      needsRowLayout(
        Array.from({ length: 20 }, (_, i) => word("prose", (i % 10) * 40)),
        500,
      ),
    ).toBe(false);
  });
  it("does not collapse a sparse numbered poster", () => {
    expect(needsRowLayout([word("2026", 400), word("November", 0)], 500)).toBe(
      false,
    );
  });
});
