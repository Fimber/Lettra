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

// Compare local OCR evidence without a dictionary or reference transcript.
// Weight confident alphanumeric characters; a short, confident fragment must
// not replace a more complete page, and punctuation noise earns no credit.
export function readingEvidence(words: { text: string; confidence: number }[]) {
  return words.reduce((sum, word) => {
    const letters = word.text.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
    return sum + letters * (Math.max(0, word.confidence - 30) / 70) ** 2;
  }, 0);
}
