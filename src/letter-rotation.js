import { traceGlyphOutline } from "./letter-wake.js";

export function readGlyphMask(pixels, width, height, left, top, measureMass = true) {
  const rows = [];
  let mass = 0, x = 0, y = 0, moment = 0;
  let inkLeft = width, inkRight = 0, inkTop = height, inkBottom = 0;
  for (let row = 0; row < height; row++) {
    const runs = [];
    let start = -1;
    for (let col = 0; col <= width; col++) {
      const solid = col < width && pixels[(row * width + col) * 4 + 3] >= 128;
      if (solid) {
        if (measureMass) {
          const px = left + col + 0.5;
          const py = top + row + 0.5;
          mass++;
          x += px;
          y += py;
          moment += px * px + py * py;
        }
        if (start < 0) start = col;
      } else if (start >= 0) {
        runs.push([start, col]);
        inkLeft = Math.min(inkLeft, start);
        inkRight = Math.max(inkRight, col);
        inkTop = Math.min(inkTop, row);
        inkBottom = row + 1;
        start = -1;
      }
    }
    rows.push(runs);
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
  const source = document.createElement("canvas");
  source.width = sourceWidth;
  source.height = sourceHeight;
  source.getContext("2d", { willReadFrequently: true })
    .putImageData(new ImageData(pixels, sourceWidth, sourceHeight), 0, 0);
  const versions = new Map([[0, mask]]);
  return function rotate(angle) {
    const step = Math.round(angle * 90 / Math.PI);
    if (versions.has(step)) return versions.get(step);
    const radians = step * Math.PI / 90;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const corners = [mask.left, mask.left + mask.width].flatMap(x =>
      [mask.top, mask.top + mask.height].map(y => ({
        x: pivot.x + (x - pivot.x) * cos - (y - pivot.y) * sin,
        y: pivot.y + (x - pivot.x) * sin + (y - pivot.y) * cos,
      })));
    const left = Math.floor(Math.min(...corners.map(p => p.x))) - 1;
    const top = Math.floor(Math.min(...corners.map(p => p.y))) - 1;
    const width = Math.ceil(Math.max(...corners.map(p => p.x))) - left + 1;
    const height = Math.ceil(Math.max(...corners.map(p => p.y))) - top + 1;
    if (context.canvas.width < width) context.canvas.width = width;
    if (context.canvas.height < height) context.canvas.height = height;
    context.resetTransform();
    context.clearRect(0, 0, width, height);
    context.setTransform(cos, sin, -sin, cos, pivot.x - left, pivot.y - top);
    context.drawImage(source, mask.left - pivot.x, mask.top - pivot.y);
    const raster = context.getImageData(0, 0, width, height).data;
    const rotated = readGlyphMask(raster, width, height, left, top, false);
    versions.set(step, rotated);
    return rotated;
  };
}
