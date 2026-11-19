const svgNamespace = "http://www.w3.org/2000/svg";
const displacementScale = 128;

function svg(tag, attributes = {}) {
  const element = document.createElementNS(svgNamespace, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function setRegion(region, x, y, width, height) {
  const { element } = region;
  if (region.x !== x) element.setAttribute("x", region.x = x);
  if (region.y !== y) element.setAttribute("y", region.y = y);
  if (region.width !== width) element.setAttribute("width", region.width = width);
  if (region.height !== height) element.setAttribute("height", region.height = height);
}

function makeMapGenerator(context) {
  const size = context.canvas.width;
  const image = context.createImageData(size, size);
  const axis = Float64Array.from({ length: size }, (_, i) => (i + 0.5) * 2 / size - 1);
  const gradient = new Float64Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(axis[x], axis[y]);
      if (distance >= 1) continue;
      const index = y * size + x;
      gradient[index] = (1 - distance ** 2) ** 2;
      image.data[index * 4 + 3] = 255 * Math.min(1, (1 - distance) * 18);
    }
  }
  return radius => {
    const magnitude = 0.58 * radius;
    for (let y = 0, index = 0; y < size; y++) {
      for (let x = 0; x < size; x++, index++) {
        if (!gradient[index]) continue;
        // Sample toward the center and ease the bend out at the bubble's rim.
        const bend = magnitude * gradient[index] * 255 / displacementScale;
        image.data[index * 4] = 128 - axis[x] * bend;
        image.data[index * 4 + 1] = 128 - axis[y] * bend;
      }
    }
    context.putImageData(image, 0, 0);
    return context.canvas.toDataURL();
  };
}

function createFilter(heading, intro) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;

  const definitions = svg("svg", { width: 0, height: 0, "aria-hidden": "true" });
  definitions.style.position = "absolute";
  const filter = svg("filter", {
    id: "name-bubble-refraction", filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB",
  });
  definitions.append(filter);
  intro.append(definitions);

  const maps = new Map();
  const images = [];
  const lenses = svg("feMerge", { result: "lenses" });
  const displacement = svg("feDisplacementMap", {
    in: "SourceGraphic", in2: "lenses", scale: displacementScale,
    xChannelSelector: "R", yChannelSelector: "G", result: "refracted",
  });
  const inside = svg("feComposite", { in: "refracted", in2: "lenses", operator: "in", result: "inside" });
  const outside = svg("feComposite", { in: "SourceGraphic", in2: "lenses", operator: "out", result: "outside" });
  // Keep original pixels outside the lens and crossfade only along its rim.
  filter.append(
    lenses,
    displacement,
    inside,
    outside,
    svg("feComposite", { in: "inside", in2: "outside", operator: "arithmetic", k2: 1, k3: 1 })
  );

  const makeMap = makeMapGenerator(context);
  const filterRegion = { element: filter };
  const displacementRegion = { element: displacement };
  const insideRegion = { element: inside };
  let mapInput = "lenses";
  function update(visible, scrollY, bounds, ink, moving) {
    const origin = heading.getBoundingClientRect();
    // Leave room for motion between frames without filtering the entire intro.
    const padding = moving ? 96 : 12;
    const step = 32;
    const filterLeft = Math.max(bounds.left, Math.floor((ink.left - padding) / step) * step);
    const filterTop = Math.max(bounds.top, Math.floor((ink.top - padding) / step) * step);
    const filterRight = Math.min(bounds.right, Math.ceil((ink.right + padding) / step) * step);
    const filterBottom = Math.min(bounds.bottom, Math.ceil((ink.bottom + padding) / step) * step);
    setRegion(filterRegion, filterLeft - origin.left, filterTop - origin.top, filterRight - filterLeft, filterBottom - filterTop);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    while (images.length > visible.length) {
      images.pop().element.remove();
      lenses.lastElementChild.remove();
    }
    for (let i = 0; i < visible.length; i++) {
      const { x, y, radius } = visible[i];
      let image = images[i];
      if (!image) {
        const result = `lens-map-${i}`;
        const element = svg("feImage", { result, preserveAspectRatio: "none" });
        image = { element };
        images.push(image);
        filter.insertBefore(element, lenses);
        lenses.append(svg("feMergeNode", { in: result }));
      }
      // Reuse maps across nearby sizes while keeping the lens boundary exact.
      const size = Math.min(320, Math.round(radius / 4) * 4);
      if (size !== image.size) {
        let url = maps.get(size);
        if (!url) {
          url = makeMap(size);
          maps.set(size, url);
        }
        image.element.setAttribute("href", url);
        image.size = size;
      }
      const lensX = x - radius - origin.left;
      const lensY = y - radius - scrollY - origin.top;
      setRegion(image, lensX, lensY, 2 * radius, 2 * radius);
      left = Math.min(left, lensX);
      top = Math.min(top, lensY);
      right = Math.max(right, lensX + 2 * radius);
      bottom = Math.max(bottom, lensY + 2 * radius);
    }
    setRegion(displacementRegion, left, top, right - left, bottom - top);
    setRegion(insideRegion, left, top, right - left, bottom - top);

    // A single bubble can feed the filter directly without compositing a map layer.
    const nextInput = visible.length === 1 ? "lens-map-0" : "lenses";
    if (nextInput !== mapInput) {
      mapInput = nextInput;
      for (const primitive of [displacement, inside, outside]) primitive.setAttribute("in2", mapInput);
    }
  }

  return { update, dispose: () => definitions.remove() };
}

export function setupBubbleRefraction(heading) {
  const intro = heading.closest(".home-intro");
  const glyphs = [...heading.querySelectorAll(".name-letter-glyph")];
  const letters = [];
  const visible = [];
  const ink = {};
  let filter;
  let active = false;

  function clear() {
    if (active) heading.style.removeProperty("filter");
    active = false;
  }

  function update(bubbles, scrollY) {
    if (!bubbles.length || filter === null) return clear();
    const bounds = intro.getBoundingClientRect();
    const pageTop = bounds.top + scrollY;
    const pageBottom = bounds.bottom + scrollY;
    visible.length = letters.length = 0;
    for (const bubble of bubbles) {
      const { x, y, radius } = bubble;
      if (!(x + radius > bounds.left && x - radius < bounds.right &&
          y + radius > pageTop && y - radius < pageBottom)) continue;
      if (!letters.length) {
        for (const glyph of glyphs) letters.push(glyph.getBoundingClientRect());
      }
      const localY = y - scrollY;
      for (const letter of letters) {
        const dy = Math.max(0, letter.top - localY, localY - letter.bottom);
        const dx = Math.max(0, letter.left - x, x - letter.right);
        if (dx * dx + dy * dy >= radius * radius) continue;
        visible.push(bubble);
        break;
      }
    }
    if (!visible.length) {
      letters.length = 0;
      return clear();
    }
    if (filter === undefined) filter = createFilter(heading, intro) ?? null;
    if (filter) {
      ink.left = ink.top = Infinity;
      ink.right = ink.bottom = -Infinity;
      for (const letter of letters) {
        ink.left = Math.min(ink.left, letter.left);
        ink.top = Math.min(ink.top, letter.top);
        ink.right = Math.max(ink.right, letter.right);
        ink.bottom = Math.max(ink.bottom, letter.bottom);
      }
      const moving = glyphs.some(glyph => {
        const reason = glyph.parentElement.dataset.motionReason;
        return reason && reason !== "idle";
      });
      filter.update(visible, scrollY, bounds, ink, moving);
      if (!active) heading.style.filter = "url(#name-bubble-refraction)";
      active = true;
    }
    visible.length = letters.length = 0;
  }

  return { update, dispose() { clear(); filter?.dispose(); } };
}
