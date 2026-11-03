import type { Cleanup } from "./settings";
export function cleanText(
  raw: string,
  rules: Cleanup,
  numbersOnly = false,
): string {
  let text = raw.replace(/\r\n?/g, "\n");
  if (rules.joinHyphens)
    text = text.replace(/(\p{L})-\n[ \t]*(\p{Ll})/gu, "$1$2");
  if (rules.stripNoise)
    text = text.replace(
      /^[ \t]*[|~_´]+[ \t]*(?=\S)|(?<=\S)[ \t]+[|~_´]+[ \t]*$/gm,
      "",
    );
  if (rules.mergeLines) text = text.replace(/([^.!?:\n])\n(?=\p{Ll})/gu, "$1 ");
  if (!rules.preserveSpaces) text = text.replace(/[ \t]+/g, " ");
  if (rules.normalizeQuotes)
    text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  if (numbersOnly && rules.numberFixes)
    text = text.replace(/\b[\dOlISB.,:/-]+\b/g, (token) =>
      (token.match(/\d/g)?.length ?? 0) > token.length / 2
        ? token.replace(
            /[OlISB]/g,
            (c) => ({ O: "0", l: "1", I: "1", S: "5", B: "8" })[c]!,
          )
        : token,
    );
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
