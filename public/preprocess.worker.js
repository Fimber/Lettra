/* Image data stays inside this worker. All OpenCV matrices are released per run. */
let cvReady;
function loadCV() {
  return (cvReady ||= (async () => {
    importScripts("/vendor/opencv.js");
    const module = await self.cv;
    if (module.Mat) return module;
    return new Promise((resolve, reject) => {
      module.onRuntimeInitialized = () => resolve(module);
      setTimeout(
        () =>
          reject(
            new Error("The image processor could not start. Try refreshing."),
          ),
        45000,
      );
    });
  })());
}
self.onmessage = async ({ data }) => {
  const mats = [];
  const hold = (x) => (mats.push(x), x);
  try {
    const cv = await loadCV();
    const input = data.bitmap;
    const surface = new OffscreenCanvas(input.width, input.height),
      context = surface.getContext("2d");
    context.drawImage(input, 0, 0);
    input.close();
    let img = hold(
      cv.matFromImageData(
        context.getImageData(0, 0, surface.width, surface.height),
      ),
    );
    const steps = { ...data.steps };
    const gray = hold(new cv.Mat());
    cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY);
    if (data.preset === "auto") {
      const colors = new Set();
      let min = 255,
        max = 0;
      for (let y = 0; y < 4; y++)
        for (let x = 0; x < 4; x++) {
          let sum = 0,
            count = 0;
          for (
            let j = Math.floor((y * gray.rows) / 4);
            j < Math.floor(((y + 1) * gray.rows) / 4);
            j += 8
          )
            for (
              let i = Math.floor((x * gray.cols) / 4);
              i < Math.floor(((x + 1) * gray.cols) / 4);
              i += 8
            ) {
              const n = gray.data[j * gray.cols + i];
              sum += n;
              count++;
              colors.add(n >> 2);
            }
          if (count) {
            min = Math.min(min, sum / count);
            max = Math.max(max, sum / count);
          }
        }
      const photo = colors.size > 45 && max - min > 35;
      steps.denoise = photo;
      steps.threshold = photo ? "adaptive" : "otsu";
    }
    if (
      steps.grayscale ||
      steps.threshold !== "none" ||
      steps.deskew ||
      steps.removeLines ||
      steps.removeBorders
    )
      img = gray;
    if (steps.invertIfDark && cv.mean(gray)[0] < 110) {
      const out = hold(new cv.Mat());
      cv.bitwise_not(img, out);
      img = out;
    }
    if (steps.upscale) {
      const g = hold(new cv.Mat());
      if (img.channels() === 4) cv.cvtColor(img, g, cv.COLOR_RGBA2GRAY);
      else img.copyTo(g);
      const bin = hold(new cv.Mat());
      cv.threshold(g, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      const labels = hold(new cv.Mat()),
        stats = hold(new cv.Mat()),
        centroids = hold(new cv.Mat());
      const count = cv.connectedComponentsWithStats(
          bin,
          labels,
          stats,
          centroids,
          8,
          cv.CV_32S,
        ),
        heights = [];
      for (let i = 1; i < count; i++) {
        const h = stats.intAt(i, cv.CC_STAT_HEIGHT),
          w = stats.intAt(i, cv.CC_STAT_WIDTH);
        if (h >= 5 && h <= 200 && w > 1 && w < h * 5) heights.push(h);
      }
      heights.sort((a, b) => a - b);
      const median = heights[Math.floor(heights.length / 2)];
      const scale =
        median && median < 20
          ? Math.min(2, 30 / median, 3000 / Math.max(img.cols, img.rows))
          : 1;
      if (scale > 1) {
        const out = hold(new cv.Mat());
        cv.resize(
          img,
          out,
          new cv.Size(
            Math.round(img.cols * scale),
            Math.round(img.rows * scale),
          ),
          0,
          0,
          cv.INTER_CUBIC,
        );
        img = out;
      }
    }
    if (steps.denoise) {
      const out = hold(new cv.Mat());
      cv.medianBlur(img, out, 3);
      img = out;
    }
    if (steps.threshold !== "none") {
      const out = hold(new cv.Mat());
      if (steps.threshold === "adaptive")
        cv.adaptiveThreshold(
          img,
          out,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY,
          31,
          10,
        );
      else cv.threshold(img, out, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      img = out;
    }
    if (steps.deskew) {
      const bin = hold(new cv.Mat());
      cv.threshold(img, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      const points = [];
      const stride = Math.max(
        1,
        Math.ceil(Math.sqrt((img.rows * img.cols) / 150000)),
      );
      for (let y = 0; y < img.rows; y += stride)
        for (let x = 0; x < img.cols; x += stride)
          if (bin.data[y * img.cols + x]) points.push(x, y);
      if (points.length > 20) {
        const pts = hold(
          cv.matFromArray(points.length / 2, 1, cv.CV_32FC2, points),
        );
        let angle = cv.minAreaRect(pts).angle;
        if (angle > 45) angle -= 90;
        else if (angle < -45) angle += 90;
        if (Math.abs(angle) >= 0.5 && Math.abs(angle) <= 15) {
          const matrix = hold(
              cv.getRotationMatrix2D(
                new cv.Point(img.cols / 2, img.rows / 2),
                angle,
                1,
              ),
            ),
            out = hold(new cv.Mat());
          cv.warpAffine(
            img,
            out,
            matrix,
            new cv.Size(img.cols, img.rows),
            cv.INTER_CUBIC,
            cv.BORDER_CONSTANT,
            new cv.Scalar(255, 255, 255, 255),
          );
          img = out;
        }
      }
    }
    if (steps.removeLines) {
      const bin = hold(new cv.Mat());
      cv.threshold(img, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      const h = hold(new cv.Mat()),
        v = hold(new cv.Mat()),
        mask = hold(new cv.Mat());
      const hk = hold(
          cv.getStructuringElement(
            cv.MORPH_RECT,
            new cv.Size(Math.max(40, Math.round(img.cols / 20)), 1),
          ),
        ),
        vk = hold(
          cv.getStructuringElement(
            cv.MORPH_RECT,
            new cv.Size(1, Math.max(40, Math.round(img.rows / 20))),
          ),
        );
      cv.morphologyEx(bin, h, cv.MORPH_OPEN, hk);
      cv.morphologyEx(bin, v, cv.MORPH_OPEN, vk);
      cv.bitwise_or(h, v, mask);
      const out = hold(new cv.Mat());
      cv.add(img, mask, out);
      img = out;
    }
    if (steps.removeBorders) {
      const bin = hold(new cv.Mat());
      cv.threshold(img, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      const labels = hold(new cv.Mat()),
        stats = hold(new cv.Mat()),
        centroids = hold(new cv.Mat());
      const n = cv.connectedComponentsWithStats(
        bin,
        labels,
        stats,
        centroids,
        8,
        cv.CV_32S,
      );
      let left = img.cols,
        top = img.rows,
        right = 0,
        bottom = 0;
      for (let i = 1; i < n; i++) {
        const x = stats.intAt(i, 0),
          y = stats.intAt(i, 1),
          w = stats.intAt(i, 2),
          h = stats.intAt(i, 3);
        if (
          x > 2 &&
          y > 2 &&
          x + w < img.cols - 2 &&
          y + h < img.rows - 2 &&
          stats.intAt(i, 4) > 5
        ) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x + w);
          bottom = Math.max(bottom, y + h);
        }
      }
      if (right > left && bottom > top) {
        left = Math.max(0, left - 12);
        top = Math.max(0, top - 12);
        right = Math.min(img.cols, right + 12);
        bottom = Math.min(img.rows, bottom + 12);
        img = hold(img.roi(new cv.Rect(left, top, right - left, bottom - top)));
      }
    }
    const rgba = hold(new cv.Mat());
    if (img.channels() === 1) cv.cvtColor(img, rgba, cv.COLOR_GRAY2RGBA);
    else img.copyTo(rgba);
    const output = new OffscreenCanvas(rgba.cols, rgba.rows);
    output
      .getContext("2d")
      .putImageData(
        new ImageData(new Uint8ClampedArray(rgba.data), rgba.cols, rgba.rows),
        0,
        0,
      );
    const bitmap = output.transferToImageBitmap();
    self.postMessage({ id: data.id, bitmap }, [bitmap]);
  } catch (error) {
    self.postMessage({
      id: data.id,
      error:
        error.message ||
        "Image processing failed. Try the original image option.",
    });
  } finally {
    for (let i = mats.length - 1; i >= 0; i--) mats[i].delete();
  }
};
