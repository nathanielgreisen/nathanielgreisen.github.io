import { expect, test } from "@playwright/test";
import { makeLetterWake, sampleLetterWake, traceGlyphOutline } from "../src/letter-wake.js";

function glyph(withFoot) {
  const width = 60;
  const height = 50;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 2; y < 47; y++) {
    for (let x = 2; x < 56; x++) {
      if (x < 6 || (withFoot && y >= 43)) pixels[(y * width + x) * 4 + 3] = 255;
    }
  }
  return { width, height, left: 0, top: 0, outline: traceGlyphOutline(pixels, width, height) };
}

function movingWake(mask, vx) {
  return makeLetterWake({
    x: 100,
    y: 100,
    bounds: { left: 100 - vx / 60, top: 100 },
    mask,
  }, { left: 0, top: 0 }, 1 / 60);
}

test("letter wakes grow with speed and taper behind the direction of movement", () => {
  const stem = glyph(false);
  const slow = movingWake(stem, 150);
  const fast = movingWake(stem, 900);
  const reverse = movingWake(stem, -900);
  expect(movingWake(stem, 0)).toBeNull();
  expect(fast.trail).toBeGreaterThan(slow.trail);
  expect(fast.reach).toBeGreaterThan(slow.reach);
  expect(sampleLetterWake(57, 131, slow)).toBeNull();
  expect(sampleLetterWake(57, 131, fast).force).toBeGreaterThan(0);
  expect(sampleLetterWake(57, 131, fast).force).toBeLessThan(sampleLetterWake(100, 131, fast).force);
  expect(sampleLetterWake(57, 131, reverse)).toBeNull();
  expect(sampleLetterWake(148, 131, reverse).force).toBeGreaterThan(0);
});

test("the wake follows the glyph's strokes, including a foot outside the main stem", () => {
  const stem = movingWake(glyph(false), -900);
  const bent = movingWake(glyph(true), -900);
  expect(sampleLetterWake(209, 155, stem)).toBeNull();
  expect(sampleLetterWake(209, 155, bent).force).toBeGreaterThan(0);
});
