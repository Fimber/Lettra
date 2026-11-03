export const MAX_BYTES = 15 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
export function inspectHeader(bytes: Uint8Array): {
  type: string;
  width?: number;
  height?: number;
} {
  const b = bytes,
    v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const str = (a: number, n: number) =>
    String.fromCharCode(...b.slice(a, a + n));
  if (b.length >= 24 && b[0] === 137 && str(1, 3) === "PNG")
    return {
      type: "image/png",
      width: v.getUint32(16),
      height: v.getUint32(20),
    };
  if (b.length >= 10 && ["GIF87a", "GIF89a"].includes(str(0, 6)))
    return {
      type: "image/gif",
      width: v.getUint16(6, true),
      height: v.getUint16(8, true),
    };
  if (b.length >= 26 && str(0, 2) === "BM") {
    const core = v.getUint32(14, true) === 12;
    return {
      type: "image/bmp",
      width: core ? v.getUint16(18, true) : Math.abs(v.getInt32(18, true)),
      height: core ? v.getUint16(20, true) : Math.abs(v.getInt32(22, true)),
    };
  }
  if (b.length >= 30 && str(0, 4) === "RIFF" && str(8, 4) === "WEBP") {
    if (str(12, 4) === "VP8X")
      return {
        type: "image/webp",
        width: 1 + b[24] + (b[25] << 8) + (b[26] << 16),
        height: 1 + b[27] + (b[28] << 8) + (b[29] << 16),
      };
    if (str(12, 4) === "VP8L")
      return {
        type: "image/webp",
        width: 1 + b[21] + ((b[22] & 63) << 8),
        height: 1 + (b[22] >> 6) + (b[23] << 2) + ((b[24] & 15) << 10),
      };
    if (str(12, 4) === "VP8 ")
      return {
        type: "image/webp",
        width: v.getUint16(26, true) & 16383,
        height: v.getUint16(28, true) & 16383,
      };
  }
  if (b.length > 12 && b[0] === 255 && b[1] === 216 && b[2] === 255) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 255) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker === 216 || marker === 217) {
        i += 2;
        continue;
      }
      const size = v.getUint16(i + 2);
      if (size < 2) break;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker)
      )
        return {
          type: "image/jpeg",
          height: v.getUint16(i + 5),
          width: v.getUint16(i + 7),
        };
      i += size + 2;
    }
    return { type: "image/jpeg" };
  }
  if (
    b.length >= 20 &&
    str(4, 4) === "ftyp" &&
    /heic|heix|hevc|hevx|mif1/.test(str(8, Math.min(b.length - 8, 48)))
  ) {
    for (let i = 4; i + 16 < b.length; i++)
      if (str(i, 4) === "ispe")
        return {
          type: "image/heic",
          width: v.getUint32(i + 8),
          height: v.getUint32(i + 12),
        };
    return { type: "image/heic" };
  }
  throw new Error(
    "This file type isn't supported. Use JPG, PNG, WebP, BMP, GIF or HEIC.",
  );
}
export async function normalizeFile(file: File): Promise<HTMLCanvasElement> {
  if (file.size > MAX_BYTES)
    throw new Error("Image is too large. Use an image under 15 MB.");
  const header = inspectHeader(new Uint8Array(await file.arrayBuffer()));
  if (!header.width || !header.height)
    throw new Error(
      "The image dimensions could not be read safely. Please export it as PNG or JPG.",
    );
  if (header.width * header.height > MAX_PIXELS)
    throw new Error("Image is too large. Use an image under 40 megapixels.");
  let blob: Blob = file;
  if (header.type === "image/heic") {
    const { default: convert } = await import("heic2any");
    const converted = await convert({ blob: file, toType: "image/png" });
    blob = Array.isArray(converted) ? converted[0] : converted;
  }
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });
  const limit =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory! <= 2
      ? 2000
      : 3000;
  const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}
export function rotateCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.height;
  canvas.height = source.width;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(canvas.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(source, 0, 0);
  return canvas;
}
