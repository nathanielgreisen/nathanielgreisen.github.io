import { traceGlyphOutline } from "./letter-wake.js";

const emptyRow = Object.freeze([]);

export function readGlyphMask(pixels, width, height, left, top, measureMass = true) {
  const rows = new Array(height);
  let mass = 0, x = 0, y = 0, moment = 0;
  let inkLeft = width, inkRight = 0, inkTop = height, inkBottom = 0;
  for (let row = 0; row < height; row++) {
    let runs;
    const alphaOffset = row * width * 4 + 3;
    const py = top + row + 0.5;
    for (let col = 0; col < width; col++) {
      if (!(pixels[alphaOffset + col * 4] >= 128)) continue;
      const start = col;
      col++;
      while (col < width && pixels[alphaOffset + col * 4] >= 128) col++;
      (runs ??= []).push([start, col]);
      inkLeft = Math.min(inkLeft, start);
      inkRight = Math.max(inkRight, col);
      if (measureMass) {
        for (let i = start; i < col; i++) {
          const px = left + i + 0.5;
          mass++;
          x += px;
          y += py;
          moment += px * px + py * py;
        }
      }
    }
    if (runs) {
      if (inkTop === height) inkTop = row;
      inkBottom = row + 1;
    }
    rows[row] = runs ?? emptyRow;
  }
  const pivot = { x: mass ? x / mass : left + width / 2, y: mass ? y / mass : top + height / 2 };
  const inertia = Math.max(1, mass ? moment / mass - pivot.x ** 2 - pivot.y ** 2 : 1);
  return { left, top, width, height, rows, pivot, inertia,
    ink: { left: left + inkLeft, right: left + inkRight, top: top + inkTop, bottom: top + inkBottom },
    get outline() {
      const outline = traceGlyphOutline(rows, width);
      Object.defineProperty(this, "outline", { value: outline });
      return outline;
    } };
}

// Keep both canvases on the CPU so drawing the source never triggers a GPU readback.
export function createGlyphRotator(mask, pixels, context) {
  const { pivot, width: sourceWidth, height: sourceHeight } = mask;
  const sourceLeft = mask.left - pivot.x;
  const sourceRight = mask.left + sourceWidth - pivot.x;
  const sourceTop = mask.top - pivot.y;
  const sourceBottom = mask.top + sourceHeight - pivot.y;
  const source = document.createElement("canvas");
  source.width = sourceWidth;
  source.height = sourceHeight;
  source.getContext("2d", { willReadFrequently: true })
    .putImageData(new ImageData(pixels, sourceWidth, sourceHeight), 0, 0);
  const versions = new Map([[0, mask]]);
  return function rotate(angle) {
    const step = Math.round(angle * 90 / Math.PI);
    const cached = versions.get(step);
    if (cached) return cached;
    const radians = step * Math.PI / 90;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const leftEdge = pivot.x + sourceLeft * cos;
    const rightEdge = pivot.x + sourceRight * cos;
    const leftY = pivot.y + sourceLeft * sin;
    const rightY = pivot.y + sourceRight * sin;
    const topX = sourceTop * sin, bottomX = sourceBottom * sin;
    const topY = sourceTop * cos, bottomY = sourceBottom * cos;
    const left = Math.floor(Math.min(leftEdge, rightEdge) - Math.max(topX, bottomX)) - 1;
    const top = Math.floor(Math.min(leftY, rightY) + Math.min(topY, bottomY)) - 1;
    const width = Math.ceil(Math.max(leftEdge, rightEdge) - Math.min(topX, bottomX)) - left + 1;
    const height = Math.ceil(Math.max(leftY, rightY) + Math.max(topY, bottomY)) - top + 1;
    if (context.canvas.width < width) context.canvas.width = width;
    if (context.canvas.height < height) context.canvas.height = height;
    context.resetTransform();
    context.clearRect(0, 0, width, height);
    context.setTransform(cos, sin, -sin, cos, pivot.x - left, pivot.y - top);
    context.drawImage(source, sourceLeft, sourceTop);
    const raster = context.getImageData(0, 0, width, height).data;
    const rotated = readGlyphMask(raster, width, height, left, top, false);
    versions.set(step, rotated);
    return rotated;
  };
}
