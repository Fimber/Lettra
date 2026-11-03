import { describe, it, expect } from "vitest";
import { score, distance, summarize } from "../scripts/accuracy-metrics.mjs";
describe("accuracy reporting", () => {
  it("counts deletion, insertion and substitution without hiding case or punctuation", () => {
    expect(distance("kitten", "sitting")).toBe(3);
    expect(score("Total: 27.30", "Total: 27.38").numberErrors).toBe(1);
    expect(score("Key=42;", "key=42").charErrors).toBe(2);
    expect(score("abc", "").cer).toBe(1);
  });
  it("normalizes only whitespace and Unicode equivalence", () => {
    expect(score("café\n42", "cafe\u0301  42").cer).toBe(0);
    expect(score("one two", "two one").wer).toBe(1);
  });
  it("counts hallucinated numbers and keeps no-number cases out of exactness rate", () => {
    expect(score("hello", "hello 1").numbersExact).toBe(false);
    expect(score("hello", "hello").numbersExact).toBeNull();
    expect(score("1.00 1.00", "1.00").numberErrors).toBe(1);
  });
  it("reports both macro and character-weighted errors", () => {
    const groups = summarize([
      {
        variant: "Auto",
        category: "test",
        status: "ok",
        seconds: 1,
        metrics: score("a", "b"),
      },
      {
        variant: "Auto",
        category: "test",
        status: "ok",
        seconds: 2,
        metrics: score("123456789", "123456789"),
      },
    ]);
    expect(groups["Auto/test"].meanCER).toBe(0.5);
    expect(groups["Auto/test"].weightedCER).toBe(0.1);
  });
});
