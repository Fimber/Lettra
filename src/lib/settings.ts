export type Steps = {
  grayscale: boolean;
  upscale: boolean;
  denoise: boolean;
  threshold: "none" | "otsu" | "adaptive";
  deskew: boolean;
  invertIfDark: boolean;
  removeBorders: boolean;
  removeLines: boolean;
};
export type Preset =
  "auto" | "screenshot" | "document" | "dark" | "receipt" | "custom";
export type Cleanup = {
  joinHyphens: boolean;
  mergeLines: boolean;
  stripNoise: boolean;
  numberFixes: boolean;
  normalizeQuotes: boolean;
  preserveSpaces: boolean;
};
export type Settings = {
  preset: Preset;
  steps: Steps;
  lang: string;
  oem: 0 | 1;
  psm: 3 | 4 | 6 | 7 | 8 | 11;
  model: "fast" | "best";
  numbersOnly: boolean;
  useOriginal: boolean;
  cleanup: Cleanup;
};
const base: Steps = {
  grayscale: true,
  upscale: true,
  denoise: false,
  threshold: "otsu",
  deskew: true,
  invertIfDark: true,
  removeBorders: false,
  removeLines: false,
};
export const presets: Record<
  Exclude<Preset, "custom">,
  { label: string; steps: Steps }
> = {
  auto: { label: "Auto", steps: { ...base } },
  screenshot: {
    label: "Screenshot",
    steps: { ...base, threshold: "none", deskew: false },
  },
  document: {
    label: "Document",
    steps: { ...base, denoise: true, threshold: "adaptive" },
  },
  dark: { label: "Dark mode", steps: { ...base, deskew: false } },
  receipt: {
    label: "Receipt",
    steps: { ...base, denoise: true, threshold: "adaptive", removeLines: true },
  },
};
export const defaults: Settings = {
  preset: "auto",
  steps: { ...base },
  lang: "eng",
  oem: 1,
  psm: 3,
  model: "fast",
  numbersOnly: false,
  useOriginal: false,
  cleanup: {
    joinHyphens: true,
    mergeLines: false,
    stripNoise: true,
    numberFixes: true,
    normalizeQuotes: false,
    preserveSpaces: true,
  },
};
export const languages = [
  ["eng", "English"],
  ["fra", "French"],
  ["spa", "Spanish"],
  ["por", "Portuguese"],
  ["deu", "German"],
  ["ara", "Arabic"],
  ["chi_sim", "Chinese (simplified)"],
  ["hin", "Hindi"],
  ["yor", "Yoruba"],
];
export function applyPreset(
  s: Settings,
  preset: Exclude<Preset, "custom">,
): Settings {
  return {
    ...s,
    preset,
    steps: { ...presets[preset].steps },
    cleanup: {
      ...s.cleanup,
      mergeLines: preset === "document",
      preserveSpaces: preset !== "document",
    },
    psm: preset === "receipt" ? 4 : preset === "screenshot" ? 6 : 3,
  };
}
