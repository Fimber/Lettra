export const normalize = (text) =>
  text.normalize("NFC").trim().replace(/\s+/gu, " ");
export function distance(a, b) {
  let start = 0,
    endA = a.length,
    endB = b.length;
  while (start < endA && start < endB && a[start] === b[start]) start++;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  a = a.slice(start, endA);
  b = b.slice(start, endB);
  if (a.length < b.length) [a, b] = [b, a];
  if (!b.length) return a.length;
  let previous = Uint32Array.from({ length: b.length + 1 }, (_, i) => i),
    next = new Uint32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    next[0] = i;
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    [previous, next] = [next, previous];
  }
  return previous[b.length];
}
export const numberTokens = (text) =>
  text.match(/[+-]?\d+(?:[.,:/-]\d+)*/g) || [];
export function score(reference, prediction) {
  const truth = normalize(reference),
    actual = normalize(prediction);
  const characters = [...truth],
    observed = [...actual],
    words = truth ? truth.split(" ") : [],
    recognized = actual ? actual.split(" ") : [];
  const numbers = numberTokens(truth),
    found = numberTokens(actual);
  const charErrors = distance(characters, observed),
    wordErrors = distance(words, recognized),
    numberErrors = distance(numbers, found);
  return {
    charErrors,
    characters: characters.length,
    cer: charErrors / Math.max(1, characters.length),
    wordErrors,
    words: words.length,
    wer: wordErrors / Math.max(1, words.length),
    numberErrors,
    numbers: numbers.length,
    numberErrorRate:
      numbers.length || found.length
        ? numberErrors / Math.max(1, numbers.length)
        : null,
    numbersExact: numbers.length || found.length ? numberErrors === 0 : null,
    casefoldCER:
      distance([...truth.toLowerCase()], [...actual.toLowerCase()]) /
      Math.max(1, [...truth.toLowerCase()].length),
  };
}
export function summarize(rows) {
  const groups = {};
  for (const row of rows) {
    const key = `${row.variant}/${row.category}`;
    (groups[key] ??= []).push(row);
  }
  return Object.fromEntries(
    Object.entries(groups).map(([key, items]) => {
      const sum = (k) => items.reduce((s, r) => s + (r.metrics?.[k] || 0), 0),
        mean = (k) => sum(k) / items.length;
      const seconds = items.map((r) => r.seconds).sort((a, b) => a - b),
        numeric = items.filter((r) => r.metrics?.numbersExact !== null);
      return [
        key,
        {
          count: items.length,
          failures: items.filter((r) => r.status !== "ok").length,
          meanCER: mean("cer"),
          weightedCER: sum("charErrors") / Math.max(1, sum("characters")),
          meanWER: mean("wer"),
          casefoldCER: mean("casefoldCER"),
          numberTokenErrorRate:
            sum("numberErrors") / Math.max(1, sum("numbers")),
          numericExactImages: numeric.filter((r) => r.metrics.numbersExact)
            .length,
          numericImages: numeric.length,
          p50Seconds: seconds[Math.floor((seconds.length - 1) * 0.5)],
          p95Seconds: seconds[Math.ceil((seconds.length - 1) * 0.95)],
        },
      ];
    }),
  );
}
