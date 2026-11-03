type Word = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

// Automatic page segmentation can split a log or a numeric table into columns.
// Restrict the retry to flat-background images with structured content and an
// observed return up the page. Ordinary prose and posters keep their layout.
export function needsRowLayout(words: Word[], height: number): boolean {
  if (words.length < 12) return false;
  const numeric = words.filter((w) => /\d/.test(w.text)).length / words.length;
  if (numeric < 0.15) return false;
  return words.some(
    (word, i) => i > 0 && words[i - 1].bbox.y0 - word.bbox.y0 > height * 0.15,
  );
}
