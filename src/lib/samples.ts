export type Sample = "note" | "receipt" | "dark";
export async function sampleFile(kind: Sample) {
  const canvas = document.createElement("canvas");
  canvas.width = 1100;
  canvas.height = kind === "receipt" ? 1250 : 760;
  const c = canvas.getContext("2d")!;
  c.fillStyle =
    kind === "dark" ? "#192820" : kind === "receipt" ? "#fffdf4" : "#ffffff";
  c.fillRect(0, 0, canvas.width, canvas.height);
  const line = (
    text: string,
    x: number,
    y: number,
    size = 32,
    color = kind === "dark" ? "#e4eae5" : "#26392f",
    font = "Arial",
  ) => {
    c.fillStyle = color;
    c.font = `${size}px ${font}`;
    c.fillText(text, x, y);
  };
  if (kind === "note") {
    line("A little room for good ideas.", 70, 120, 50);
    line("FIELD NOTES / NOVEMBER 2026", 70, 185, 22, "#68786d");
    const text = [
      "Good ideas rarely arrive fully formed.",
      "They begin as a sentence in a notebook,",
      "a conversation on a walk, or a paragraph",
      "you want to come back to.",
      "",
      "Keep a little space for the things that",
      "make you stop and think. Write them down.",
      "Make something of them.",
    ];
    text.forEach((s, i) => line(s, 70, 285 + i * 46));
  } else if (kind === "receipt") {
    line("THE CORNER STORE", 120, 130, 52);
    line("12 Garden Street", 120, 190);
    line("03 NOV 2026   10:42", 120, 245);
    const text = [
      "--------------------------------",
      "Oat milk                  4.50",
      "Sourdough bread           6.00",
      "Coffee beans             12.00",
      "Apples                    3.50",
      "--------------------------------",
      "SUBTOTAL                 26.00",
      "TAX                       1.30",
      "TOTAL                    27.30",
      "",
      "Thank you for shopping local!",
    ];
    text.forEach((s, i) =>
      line(s, 120, 350 + i * 62, 36, "#26392f", "monospace"),
    );
  } else {
    line("notes.md", 65, 100, 24, "#a5bd9e");
    line("Make the useful things simple.", 65, 220, 48);
    [
      "Small tools. Thoughtful details.",
      "A little less friction in your day.",
      "",
      "Your images stay on your device.",
      "Your words are yours to keep.",
    ].forEach((s, i) => line(s, 65, 330 + i * 60, 32));
  }
  return new Promise<File>((resolve) =>
    canvas.toBlob((blob) =>
      resolve(new File([blob!], `lettra-${kind}.png`, { type: "image/png" })),
    ),
  );
}
