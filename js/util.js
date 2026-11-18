'use strict';

// Shared helpers: math, colors, path shapes, deterministic noise and saved
// values. Loaded first; everything here is global.

const TAU = Math.PI * 2;

function clamp(value, lo, hi) {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Uniform random number in lo...hi (Swift's `.random(in:)`). */
function random(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

// MARK: Colors
// Colors are [r, g, b] arrays of 0...1 sRGB components, like the Swift
// `SIMD3<Float>` / `Color(red:green:blue:)` values they were ported from.

/** CSS color string from 0...1 components and an opacity. */
function rgba(r, g, b, a = 1) {
  return 'rgba(' + Math.round(clamp(r, 0, 1) * 255) + ',' + Math.round(clamp(g, 0, 1) * 255) + ',' +
    Math.round(clamp(b, 0, 1) * 255) + ',' + clamp(a, 0, 1) + ')';
}

/** CSS color string from an [r, g, b] array and an opacity. */
function css(rgb, a = 1) {
  return rgba(rgb[0], rgb[1], rgb[2], a);
}

const vscale = (v, s) => [v[0] * s, v[1] * s, v[2] * s];
const vmin1 = (v) => [Math.min(v[0], 1), Math.min(v[1], 1), Math.min(v[2], 1)];
const vmix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** SwiftUI's system colors (dark appearance), used where the app wrote `.cyan`, `.pink`... */
const SystemColor = {
  red: [1.0, 0.271, 0.227],
  orange: [1.0, 0.624, 0.039],
  yellow: [1.0, 0.839, 0.039],
  green: [0.188, 0.82, 0.345],
  cyan: [0.392, 0.824, 1.0],
  pink: [1.0, 0.216, 0.373],
};

/** Hue/saturation/brightness (0...1 each) to [r, g, b]. */
function hsb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (((i % 6) + 6) % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    default: return [v, p, q];
  }
}

// MARK: Path shapes (added to the current path)

/** Ellipse inscribed in a rect, as a new path. */
function ellipsePath(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, TAU);
}

/** Adds a rounded rect subpath (radius clamped like Core Graphics). */
function addRoundRect(ctx, x, y, w, h, r) {
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/** Rounded rect as a new path. */
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  addRoundRect(ctx, x, y, w, h, r);
}

/** Closed polygon from [x, y] pairs, as a new path. */
function polygonPath(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
}

// MARK: Deterministic noise (bit-exact ports of the Swift versions)

const U64_MASK = (1n << 64n) - 1n;
const sceneryHashCache = new Map();

/**
 * Deterministic 0..<1 value for a formation index, so scenery is stable as it
 * scrolls. Same 64-bit mix as `GameRenderer.hash`, so the cave scenery is
 * laid out exactly like the original's.
 */
function sceneryHash(i, seed) {
  const key = i * 64 + seed;
  let value = sceneryHashCache.get(key);
  if (value !== undefined) return value;
  let x = (BigInt.asUintN(64, BigInt(i)) * 0x9E3779B97F4A7C15n + BigInt(seed) * 0xBF58476D1CE4E5B9n) & U64_MASK;
  x = ((x ^ (x >> 31n)) * 0x94D049BB133111EBn) & U64_MASK;
  x ^= x >> 29n;
  value = Number(x % 10000n) / 10000;
  if (sceneryHashCache.size > 60000) sceneryHashCache.clear();
  sceneryHashCache.set(key, value);
  return value;
}

/** SplitMix64, like the Swift `SeededGenerator`, with Swift's `Double.random(in:using:)`. */
class SeededGenerator {
  constructor(seed) {
    this.state = BigInt.asUintN(64, BigInt(seed) + 0x9E3779B97F4A7C15n);
  }

  next() {
    this.state = BigInt.asUintN(64, this.state + 0x9E3779B97F4A7C15n);
    let z = this.state;
    z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n);
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94D049BB133111EBn);
    return z ^ (z >> 31n);
  }

  /** `Double.random(in: lo..<hi, using:)` */
  halfOpen(lo, hi) {
    const rand = this.next() & ((1n << 53n) - 1n);
    const value = (hi - lo) * (Number(rand) * 2 ** -53) + lo;
    return value === hi ? this.halfOpen(lo, hi) : value;
  }

  /** `Double.random(in: lo...hi, using:)` (Lemire's bounded integer, as in the Swift stdlib). */
  closed(lo, hi) {
    const bound = (1n << 53n) + 1n;
    let m = this.next() * bound;
    if ((m & U64_MASK) < bound) {
      const t = BigInt.asUintN(64, -bound) % bound;
      while ((m & U64_MASK) < t) m = this.next() * bound;
    }
    const rand = m >> 64n;
    if (rand === 1n << 53n) return hi;
    return (hi - lo) * (Number(rand) * 2 ** -53) + lo;
  }
}

// MARK: Saved values (localStorage, standing in for UserDefaults / @AppStorage)

const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Storage can be unavailable (private modes, file:// in some browsers).
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      // Ignore, as above.
    }
  },
};
