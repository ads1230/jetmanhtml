'use strict';

// A small software 3D renderer for the pilots (port of
// PilotTurntableView.swift): convex mesh parts, transform, perspective
// projection, back-face culling, three-light shading and back-to-front
// sorting, drawn straight into a Canvas 2D context. Used for the menu
// turntable and, pre-rendered once per skin and view, for the in-game pilot.

// MARK: - Vector helpers

const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  mul: (a, b) => [a[0] * b[0], a[1] * b[1], a[2] * b[2]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  length: (a) => Math.hypot(a[0], a[1], a[2]),
  normalize: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
  },
};

/** Rotation matrix (row-major 3x3) for `angle` radians around a unit axis, like `simd_quatf(angle:axis:)`. */
function rotationMatrix(axis, angle) {
  const [x, y, z] = axis;
  const c = Math.cos(angle), s = Math.sin(angle), t = 1 - c;
  return [
    t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c,
  ];
}

/** A * B (apply B first), like multiplying simd quaternions. */
function matMul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

function matApply(m, p) {
  return [m[0] * p[0] + m[1] * p[1] + m[2] * p[2], m[3] * p[0] + m[4] * p[1] + m[5] * p[2],
    m[6] * p[0] + m[7] * p[1] + m[8] * p[2]];
}

// MARK: - Mesh

/**
 * Generates outward-facing triangles for simple convex shapes. Each shape is
 * a "part": faces of one convex part never overlap each other, so drawing
 * parts back to front avoids most sorting glitches.
 */
class MeshBuilder {
  constructor() {
    this.triangles = [];
    this.parts = [];
  }

  /** Registers a new part; subsequent faces belong to it. `bias` pulls parts that sit on another part's surface toward the camera. */
  beginPart(center, bias, flame = -1) {
    this.parts.push({ center, bias, flame });
  }

  /** Adds a triangle, flipping its winding if needed so the normal points away from the (convex) part's center. */
  add(a, b, c, center, color, gloss, emissive, flame = -1) {
    const normal = V3.cross(V3.sub(b, a), V3.sub(c, a));
    if (!(V3.length(normal) > 1e-7)) return;
    const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const outward = V3.dot(normal, V3.sub(centroid, center)) >= 0;
    this.triangles.push({
      a, b: outward ? b : c, c: outward ? c : b, color, gloss, emissive, flame, part: this.parts.length - 1,
    });
  }

  /**
   * Recolors non-glowing faces added since `start` by the height (y) of each
   * face's center. Each part stays entirely on its own side of `split`
   * (decided by the part's center) so coarse faces can't zigzag across it.
   */
  paint(start, split, colorAt) {
    for (let i = start; i < this.triangles.length; i++) {
      const tri = this.triangles[i];
      if (tri.emissive) continue;
      let y = (tri.a[1] + tri.b[1] + tri.c[1]) / 3;
      y = this.parts[tri.part].center[1] >= split ? Math.max(y, split) : Math.min(y, split - 0.0001);
      tri.color = colorAt(y);
    }
  }

  /**
   * Superellipsoid: `exponent` 1 is an ellipsoid, smaller values approach a
   * box with rounded edges. `decal`, given a face's direction normalized to
   * the part's half-size (-1...1 on each axis), can return [color, emissive]
   * to paint there (used for the visor, belt and chest light).
   */
  superellipsoid(center, radii, exponent, color, gloss, emissive, rings, segments, bias, decal) {
    this.beginPart(center, bias);
    const shape = (v) => Math.sign(v) * Math.pow(Math.abs(v), exponent) || 0;
    const grid = [];
    for (let i = 0; i <= rings; i++) {
      const theta = (i / rings) * Math.PI;
      const row = [];
      for (let j = 0; j <= segments; j++) {
        const phi = (j / segments) * 2 * Math.PI;
        const ux = Math.sin(theta) * Math.cos(phi), uy = Math.cos(theta), uz = Math.sin(theta) * Math.sin(phi);
        row.push([center[0] + shape(ux) * radii[0], center[1] + shape(uy) * radii[1], center[2] + shape(uz) * radii[2]]);
      }
      grid.push(row);
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segments; j++) {
        const p00 = grid[i][j], p01 = grid[i][j + 1], p10 = grid[i + 1][j], p11 = grid[i + 1][j + 1];
        let faceColor = color;
        let faceEmissive = emissive;
        if (decal) {
          const theta = ((i + 0.5) / rings) * Math.PI;
          const phi = ((j + 0.5) / segments) * 2 * Math.PI;
          const ux = Math.sin(theta) * Math.cos(phi), uy = Math.cos(theta), uz = Math.sin(theta) * Math.sin(phi);
          const override = decal([shape(ux), shape(uy), shape(uz)]);
          if (override) {
            faceColor = override[0];
            faceEmissive = override[1];
          }
        }
        this.add(p00, p10, p11, center, faceColor, gloss, faceEmissive);
        this.add(p00, p11, p01, center, faceColor, gloss, faceEmissive);
      }
    }
  }

  ellipsoid(center, radii, color, gloss, { emissive = false, rings = 10, segments = 16, bias = 0, decal = null } = {}) {
    this.superellipsoid(center, radii, 1, color, gloss, emissive, rings, segments, bias, decal);
  }

  roundedBox(center, size, color, gloss, { emissive = false, bias = 0, decal = null } = {}) {
    this.superellipsoid(center, V3.scale(size, 0.5), 0.3, color, gloss, emissive, decal ? 16 : 8, decal ? 24 : 12,
      bias, decal);
  }

  /** A convex polygon `base` extruded along `extrude` (for angled pieces such as blades and wedges). */
  prism(base, extrude, color, gloss, { emissive = false, bias = 0 } = {}) {
    const top = base.map((p) => V3.add(p, extrude));
    let sum = [0, 0, 0];
    for (const p of base) sum = V3.add(sum, p);
    for (const p of top) sum = V3.add(sum, p);
    const center = V3.scale(sum, 1 / (base.length * 2));
    this.beginPart(center, bias);
    for (let i = 1; i < base.length - 1; i++) {
      this.add(base[0], base[i], base[i + 1], center, color, gloss, emissive);
      this.add(top[0], top[i], top[i + 1], center, color, gloss, emissive);
    }
    for (let i = 0; i < base.length; i++) {
      const j = (i + 1) % base.length;
      this.add(base[i], base[j], top[j], center, color, gloss, emissive);
      this.add(base[i], top[j], top[i], center, color, gloss, emissive);
    }
  }

  /** A cone pointing from `base` toward `tip` in any direction. */
  spike(base, tip, radius, color, gloss, { segments = 10, bias = 0 } = {}) {
    const axis = V3.normalize(V3.sub(tip, base));
    const helper = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = V3.normalize(V3.cross(axis, helper));
    const v = V3.cross(axis, u);
    const center = V3.add(base, V3.scale(V3.sub(tip, base), 0.3));
    this.beginPart(center, bias);
    for (let j = 0; j < segments; j++) {
      const a0 = (j / segments) * 2 * Math.PI;
      const a1 = ((j + 1) / segments) * 2 * Math.PI;
      const p0 = V3.add(base, V3.scale(V3.add(V3.scale(u, Math.cos(a0)), V3.scale(v, Math.sin(a0))), radius));
      const p1 = V3.add(base, V3.scale(V3.add(V3.scale(u, Math.cos(a1)), V3.scale(v, Math.sin(a1))), radius));
      this.add(p0, p1, tip, center, color, gloss, false);
      this.add(p0, p1, base, center, color, gloss, false);
    }
  }

  /** Vertical cylinder with caps, optionally tilted around the z-axis. */
  cylinder(center, radius, height, color, gloss, { tilt = 0, segments = 18, bias = 0 } = {}) {
    this.beginPart(center, bias);
    const rotation = rotationMatrix([0, 0, 1], tilt);
    const point = (angle, y) => V3.add(center, matApply(rotation, [Math.cos(angle) * radius, y, Math.sin(angle) * radius]));
    const top = V3.add(center, matApply(rotation, [0, height / 2, 0]));
    const bottom = V3.add(center, matApply(rotation, [0, -height / 2, 0]));
    for (let j = 0; j < segments; j++) {
      const a0 = (j / segments) * 2 * Math.PI;
      const a1 = ((j + 1) / segments) * 2 * Math.PI;
      const t0 = point(a0, height / 2), t1 = point(a1, height / 2);
      const b0 = point(a0, -height / 2), b1 = point(a1, -height / 2);
      this.add(b0, t0, t1, center, color, gloss, false);
      this.add(b0, t1, b1, center, color, gloss, false);
      this.add(top, t0, t1, center, color, gloss, false);
      this.add(bottom, b0, b1, center, color, gloss, false);
    }
  }

  /** Cone hanging down from `base` (the jetpack flames). */
  cone(base, radius, length, color, flame, { segments = 10, bias = 0 } = {}) {
    const apex = V3.add(base, [0, -length, 0]);
    const center = V3.add(base, [0, -length / 3, 0]);
    this.beginPart(center, bias, flame);
    for (let j = 0; j < segments; j++) {
      const a0 = (j / segments) * 2 * Math.PI;
      const a1 = ((j + 1) / segments) * 2 * Math.PI;
      const p0 = V3.add(base, [Math.cos(a0) * radius, 0, Math.sin(a0) * radius]);
      const p1 = V3.add(base, [Math.cos(a1) * radius, 0, Math.sin(a1) * radius]);
      this.add(p0, p1, apex, center, color, 0, true, flame);
      this.add(p0, p1, base, center, color, 0, true, flame);
    }
  }

  /** Packs the triangles into typed arrays for fast per-frame rendering. */
  finish() {
    const n = this.triangles.length;
    const mesh = {
      count: n,
      positions: new Float64Array(n * 9),
      colors: new Float64Array(n * 3),
      gloss: new Float64Array(n),
      emissive: new Uint8Array(n),
      flame: new Int8Array(n),
      part: new Int32Array(n),
      partCount: this.parts.length,
      partCenters: new Float64Array(this.parts.length * 3),
      partBias: new Float64Array(this.parts.length),
      partFlame: new Int8Array(this.parts.length),
    };
    this.triangles.forEach((tri, i) => {
      mesh.positions.set([...tri.a, ...tri.b, ...tri.c], i * 9);
      mesh.colors.set(tri.color, i * 3);
      mesh.gloss[i] = tri.gloss;
      mesh.emissive[i] = tri.emissive ? 1 : 0;
      mesh.flame[i] = tri.flame;
      mesh.part[i] = tri.part;
    });
    this.parts.forEach((part, i) => {
      mesh.partCenters.set(part.center, i * 3);
      mesh.partBias[i] = part.bias;
      mesh.partFlame[i] = part.flame;
    });
    return mesh;
  }
}

/**
 * The pilot models, built once per skin from simple convex parts.
 * Coordinates are in meters with y up and the pilot facing +z.
 */
const PilotMesh = (() => {
  const orange = [1.0, 0.55, 0.22];
  const cyan = [0.31, 0.96, 1.0];
  const darkMetal = [0.22, 0.23, 0.27];
  const flameCore = [1.0, 0.95, 0.75];

  /** Nozzle positions the flames stretch from. */
  const flamePivots = [[-0.1, -0.26, -0.27], [0.1, -0.26, -0.27]];

  const cache = new Map();

  function model(skin) {
    let mesh = cache.get(skin.id);
    if (!mesh) {
      mesh = build(skin);
      cache.set(skin.id, mesh);
    }
    return mesh;
  }

  function build(skin) {
    const b = new MeshBuilder();
    if (skin.id === 'vanguard') buildVanguard(b);
    else if (skin.id === 'joker') buildJoker(b);
    else if (skin.id === 'hero') buildHero(b);
    else if (skin.isRobot) buildRobot(skin, b);
    else buildSuitedPilot(skin, b);
    // The hero flies on his own; everyone else wears the jetpack.
    if (skin.id !== 'hero') buildJetpack(skin, b);
    return b.finish();
  }

  function buildSuitedPilot(skin, b) {
    const navy = skin.suit, navyDark = skin.suitDark, accent = skin.accent, white = skin.helmet;

    // Torso with the belt painted onto its surface.
    b.roundedBox([0, 0, 0], [0.36, 0.42, 0.24], navy, 0.2, {
      decal: (p) => (p[1] > -0.78 && p[1] < -0.5 ? [accent, false] : null),
    });
    // Small details are thin raised plates: rounded-box faces are too coarsely
    // tessellated to paint small decals on.
    b.roundedBox([0, 0.07, 0.122], [0.1, 0.1, 0.02], orange, 0.5, { emissive: true, bias: 0.02 });

    // Jet-fighter flight helmet. The mirrored visor and the center stripe are
    // painted onto the shell itself so depth sorting can't make them flicker.
    const visor = skin.visor;
    b.ellipsoid([0, 0.38, 0], [0.19, 0.2, 0.21], white, 0.8, {
      rings: 18, segments: 28, bias: 0.05,
      decal: (d) => {
        if (d[2] > 0.22 && d[1] > -0.2 && d[1] < 0.55) {
          // Mirrored visor: brighter at the top like a reflected sky.
          return [vmix(visor.dark, visor.light, clamp((d[1] + 0.2) / 0.75, 0, 1)), false];
        }
        if (Math.abs(d[0]) < 0.13 && d[1] > 0.2 && d[2] < 0.5) return [accent, false];
        return null;
      },
    });
    // Visor housing along the top and side pivot knobs.
    b.roundedBox([0, 0.565, 0.04], [0.07, 0.035, 0.17], vscale(white, 0.82), 0.7, { bias: 0.1 });
    for (const side of [-1, 1]) {
      b.ellipsoid([side * 0.188, 0.42, 0.03], [0.018, 0.034, 0.034], vscale(white, 0.7), 0.6,
        { rings: 6, segments: 10, bias: 0.07 });
    }
    // Oxygen mask over the nose and mouth, valve, and a ribbed hose down to the chest.
    const mask = MASK_COLOR;
    b.roundedBox([0, 0.3, 0.17], [0.11, 0.1, 0.08], mask, 0.4, { bias: 0.09 });
    b.ellipsoid([0, 0.285, 0.215], [0.035, 0.03, 0.02], vscale(mask, 0.6), 0.5, { rings: 6, segments: 10, bias: 0.1 });
    [[0.035, 0.245, 0.18], [0.06, 0.2, 0.165], [0.075, 0.155, 0.15], [0.085, 0.11, 0.138]].forEach((point, i) => {
      b.ellipsoid(point, [0.022, 0.022, 0.022], i % 2 === 0 ? mask : vscale(mask, 0.75), 0.4,
        { rings: 5, segments: 8, bias: 0.06 });
    });

    for (const side of [-1, 1]) {
      // Arms and gloves.
      b.cylinder([side * 0.235, -0.02, 0.02], 0.055, 0.32, navy, 0.2, { tilt: side * 0.18 });
      b.ellipsoid([side * 0.265, -0.2, 0.03], [0.068, 0.068, 0.068], accent, 0.3, { bias: 0.05 });
      // Legs and boots.
      b.cylinder([side * 0.1, -0.38, 0], 0.07, 0.36, navyDark, 0.2);
      b.roundedBox([side * 0.1, -0.6, 0.03], [0.15, 0.1, 0.22], accent, 0.3, { bias: 0.06 });
    }
  }

  /**
   * The mecha: an armored robot painted exactly like the logo. One vertical
   * gradient runs down the whole body (sky blue at the top of the head to
   * indigo at the waist, then pink to orange-red at the feet), split by the
   * logo's glowing white seam, with dark navy joints like the logo's outlines.
   */
  function buildRobot(skin, b) {
    const joint = LogoPalette.outline;
    const neonWhite = [0.85, 0.98, 1.0];
    const base = skin.suit; // replaced by the gradient below

    // Armor panels, recolored afterwards from the logo gradient by height.
    const armorStart = b.triangles.length;

    // Head: a boxy helm with cheek vents.
    b.roundedBox([0, 0.4, 0], [0.32, 0.26, 0.28], base, 0.7, { bias: 0.05 });
    for (const side of [-1, 1]) b.roundedBox([side * 0.162, 0.4, 0.0], [0.02, 0.07, 0.09], base, 0.5, { bias: 0.07 });

    // Chest, with the logo's glowing seam around the waist.
    b.roundedBox([0, 0.03, 0], [0.42, 0.4, 0.26], base, 0.6, {
      decal: (p) => (p[1] < -0.72 && p[1] > -0.92 ? [neonWhite, true] : null),
    });
    // Hips.
    b.roundedBox([0, -0.21, 0], [0.32, 0.1, 0.22], base, 0.5);

    for (const side of [-1, 1]) {
      // Shoulder pads, armored forearms and fists.
      b.roundedBox([side * 0.29, 0.17, 0], [0.17, 0.13, 0.21], base, 0.7, { bias: 0.06 });
      b.roundedBox([side * 0.29, -0.11, 0.01], [0.12, 0.18, 0.13], base, 0.5, { bias: 0.02 });
      b.roundedBox([side * 0.29, -0.24, 0.02], [0.1, 0.08, 0.1], base, 0.5, { bias: 0.04 });
      // Armored shins and heavy feet.
      b.roundedBox([side * 0.1, -0.45, 0], [0.14, 0.2, 0.16], base, 0.5);
      b.roundedBox([side * 0.1, -0.6, 0.035], [0.16, 0.08, 0.23], base, 0.4, { bias: 0.06 });
    }
    const seamHeight = -0.15;
    b.paint(armorStart, seamHeight, (y) => LogoPalette.color(y, 0.53, seamHeight, -0.64));

    // Dark navy joints and antenna.
    b.cylinder([0, 0.25, 0], 0.06, 0.07, joint, 0.8);
    b.cylinder([0.11, 0.6, -0.04], 0.012, 0.16, joint, 0.8, { segments: 8, bias: 0.05 });
    for (const side of [-1, 1]) {
      b.cylinder([side * 0.29, 0.03, 0], 0.045, 0.16, joint, 0.8);
      b.cylinder([side * 0.1, -0.3, 0], 0.05, 0.12, joint, 0.8);
    }

    // Indicator lights in the logo's lamp colors: cyan visor, green reactor,
    // pink antenna tip, orange knee lights.
    b.roundedBox([0, 0.43, 0.142], [0.25, 0.065, 0.02], LogoPalette.lampCyan, 1, { emissive: true, bias: 0.08 });
    b.roundedBox([0, 0.09, 0.132], [0.12, 0.1, 0.02], LogoPalette.lampGreen, 1, { emissive: true, bias: 0.02 });
    b.ellipsoid([0.11, 0.69, -0.04], [0.03, 0.03, 0.03], LogoPalette.lampPink, 1,
      { emissive: true, rings: 6, segments: 10, bias: 0.06 });
    for (const side of [-1, 1]) {
      b.roundedBox([side * 0.1, -0.39, 0.082], [0.07, 0.03, 0.015], LogoPalette.lampOrange, 0.5,
        { emissive: true, bias: 0.02 });
    }
  }

  /** Vanguard: a sleek knight-style robot. White armor plates over a black frame, gold trim, thin glowing cyan strips. */
  function buildVanguard(b) {
    const { armor, frame, gold, line } = VanguardPalette;

    // Head: a knight-style helm. White shell with a low crown ridge, a pointed
    // brow peak over a black face plate with a cyan visor, twin gold blades
    // sweeping back from the temples, and angular cheek guards.
    b.roundedBox([0, 0.4, 0], [0.26, 0.26, 0.26], armor, 0.8, { bias: 0.05 });
    b.roundedBox([0, 0.535, -0.03], [0.05, 0.035, 0.2], armor, 0.8, { bias: 0.06 });
    b.roundedBox([0, 0.37, 0.128], [0.18, 0.13, 0.02], frame, 0.6, { bias: 0.07 });
    b.prism([[-0.13, 0.465, 0.1], [0.13, 0.465, 0.1], [0, 0.465, 0.2]], [0, 0.03, 0], armor, 0.8, { bias: 0.1 });
    // Single visor band with tapered ends.
    b.prism([[-0.08, 0.405, 0.14], [-0.06, 0.39, 0.14], [0.06, 0.39, 0.14], [0.08, 0.405, 0.14],
      [0.06, 0.42, 0.14], [-0.06, 0.42, 0.14]], [0, 0, 0.008], line, 1, { emissive: true, bias: 0.11 });
    for (const side of [-1, 1]) {
      // Gold blade swept back almost horizontally along the temple, like a helmet wing.
      b.prism([[side * 0.13, 0.41, 0.08], [side * 0.13, 0.47, 0.08], [side * 0.13, 0.49, -0.3]],
        [side * 0.025, 0, 0], gold, 0.95, { bias: 0.08 });
      // Angular cheek guard with a cyan vent light.
      b.roundedBox([side * 0.14, 0.34, 0.06], [0.03, 0.09, 0.11], frame, 0.6, { bias: 0.07 });
      b.roundedBox([side * 0.157, 0.34, 0.06], [0.006, 0.04, 0.05], line, 1, { emissive: true, bias: 0.08 });
    }
    b.cylinder([0, 0.25, 0], 0.055, 0.07, frame, 0.6);

    // Chest: white plate over a black lower frame, cyan light strips and a gold core.
    b.roundedBox([0, 0.04, 0], [0.4, 0.38, 0.25], armor, 0.7, { decal: (p) => (p[1] < -0.6 ? [frame, false] : null) });
    for (const side of [-1, 1]) {
      b.roundedBox([side * 0.11, 0.07, 0.127], [0.018, 0.2, 0.01], line, 1, { emissive: true, bias: 0.02 });
    }
    b.roundedBox([0, 0.1, 0.13], [0.08, 0.08, 0.02], gold, 0.9, { bias: 0.02 });
    // Hips with a gold buckle.
    b.roundedBox([0, -0.2, 0], [0.3, 0.1, 0.22], frame, 0.5);
    b.roundedBox([0, -0.2, 0.112], [0.06, 0.06, 0.015], gold, 0.9, { bias: 0.02 });

    for (const side of [-1, 1]) {
      // Shoulder armor with a gold rim, black joint, white gauntlet with a cyan strip, black fist.
      b.roundedBox([side * 0.29, 0.17, 0], [0.18, 0.13, 0.22], armor, 0.8,
        { bias: 0.06, decal: (p) => (p[1] < -0.6 ? [gold, false] : null) });
      b.cylinder([side * 0.29, 0.03, 0], 0.045, 0.16, frame, 0.6);
      b.roundedBox([side * 0.29, -0.11, 0.01], [0.14, 0.2, 0.15], armor, 0.7, { bias: 0.02 });
      b.roundedBox([side * 0.362, -0.11, 0.01], [0.01, 0.13, 0.02], line, 1, { emissive: true, bias: 0.04 });
      b.roundedBox([side * 0.29, -0.245, 0.02], [0.1, 0.08, 0.1], frame, 0.5, { bias: 0.04 });

      // Black thigh, white shin with a gold knee plate and cyan strip, white foot.
      b.cylinder([side * 0.1, -0.3, 0], 0.058, 0.13, frame, 0.6);
      b.roundedBox([side * 0.1, -0.45, 0], [0.14, 0.2, 0.16], armor, 0.7);
      b.roundedBox([side * 0.1, -0.37, 0.082], [0.08, 0.035, 0.015], gold, 0.9, { bias: 0.02 });
      b.roundedBox([side * 0.1, -0.47, 0.082], [0.018, 0.1, 0.012], line, 1, { emissive: true, bias: 0.02 });
      b.roundedBox([side * 0.1, -0.6, 0.035], [0.16, 0.08, 0.23], armor, 0.6,
        { bias: 0.06, decal: (p) => (p[1] < -0.5 ? [frame, false] : null) });
    }
  }

  /** Face details shared by the costumed humans: eyes and a smile on a head centered at `head` with radius `r`. */
  function addFace(head, r, smile, b) {
    for (const side of [-1, 1]) {
      b.ellipsoid(V3.add(head, [side * 0.055, 0.03, r * 0.93]), [0.016, 0.02, 0.01], [0.08, 0.06, 0.06], 0.8,
        { rings: 5, segments: 8, bias: 0.08 });
    }
    b.roundedBox(V3.add(head, [0, -0.06, r * 0.9]), [0.08, 0.016, 0.015], smile, 0.5, { bias: 0.08 });
    for (const side of [-1, 1]) {
      b.ellipsoid(V3.add(head, [side * 0.045, -0.05, r * 0.9]), [0.012, 0.012, 0.01], smile, 0.5,
        { rings: 4, segments: 6, bias: 0.08 });
    }
  }

  /** Joker: a playing-card jester in red, blue and yellow motley with a three-pointed belled hat, ruffled collar and a grin. */
  function buildJoker(b) {
    const { red, blue, yellow, gold, glove } = JokerPalette;

    // Harlequin tunic split red/blue with a yellow belt and a yellow diamond.
    b.roundedBox([0, 0, 0], [0.36, 0.42, 0.24], red, 0.3, {
      decal: (p) => {
        if (p[1] > -0.78 && p[1] < -0.5) return [yellow, false];
        return p[0] < 0 ? [red, false] : [blue, false];
      },
    });
    b.prism([[0, 0.17, 0.121], [0.065, 0.07, 0.121], [0, -0.03, 0.121], [-0.065, 0.07, 0.121]], [0, 0, 0.01], yellow, 0.4,
      { bias: 0.02 });

    // Ruffled collar: alternating colored puffs around the neck.
    const ruffColors = [red, yellow, blue];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 2 * Math.PI;
      b.ellipsoid([Math.cos(a) * 0.13, 0.22, Math.sin(a) * 0.11], [0.045, 0.03, 0.045], ruffColors[i % 3], 0.3,
        { rings: 5, segments: 8, bias: 0.03 });
    }

    // Head and grin.
    const head = [0, 0.36, 0];
    b.ellipsoid(head, [0.155, 0.16, 0.155], SKIN_TONE, 0.3, { rings: 14, segments: 20, bias: 0.05 });
    addFace(head, 0.155, red, b);
    for (const side of [-1, 1]) {
      b.ellipsoid(V3.add(head, [side * 0.09, -0.03, 0.12]), [0.025, 0.018, 0.01], [1.0, 0.55, 0.55], 0.2,
        { rings: 4, segments: 6, bias: 0.07 });
    }

    // Jester hat: split crown, yellow band, three floppy points with bells.
    b.ellipsoid([0, 0.48, 0], [0.165, 0.075, 0.165], red, 0.3,
      { bias: 0.08, decal: (d) => (d[0] < 0 ? [blue, false] : [red, false]) });
    b.cylinder([0, 0.455, 0], 0.162, 0.035, yellow, 0.4, { bias: 0.09 });
    const points = [
      { base: [-0.08, 0.53, 0], tip: [-0.33, 0.5, 0.04], color: blue },
      { base: [0, 0.55, -0.03], tip: [0, 0.78, -0.2], color: yellow },
      { base: [0.08, 0.53, 0], tip: [0.33, 0.5, 0.04], color: red },
    ];
    for (const point of points) {
      b.spike(point.base, point.tip, 0.07, point.color, 0.3, { bias: 0.09 });
      b.ellipsoid(point.tip, [0.032, 0.032, 0.032], gold, 1, { rings: 6, segments: 10, bias: 0.12 });
    }

    for (const side of [-1, 1]) {
      // Arms and legs swap colors across the body, harlequin style.
      b.cylinder([side * 0.235, -0.02, 0.02], 0.055, 0.32, side < 0 ? blue : red, 0.3, { tilt: side * 0.18 });
      b.ellipsoid([side * 0.265, -0.2, 0.03], [0.065, 0.065, 0.065], glove, 0.3, { bias: 0.05 });
      b.cylinder([side * 0.1, -0.38, 0], 0.07, 0.36, side < 0 ? blue : red, 0.3);
      // Yellow boots with a gold toe bell.
      b.roundedBox([side * 0.1, -0.6, 0.04], [0.14, 0.09, 0.24], yellow, 0.4, { bias: 0.06 });
      b.ellipsoid([side * 0.1, -0.57, 0.17], [0.026, 0.026, 0.026], gold, 1, { rings: 6, segments: 10, bias: 0.08 });
    }
  }

  /** Hero: an original caped superhero. Teal suit, crimson cape, gloves and boots, gold belt and a chevron emblem. */
  function buildHero(b) {
    const { suit, suitDark, cape, gold, mask, hair } = HeroPalette;

    // Torso with a gold belt, and the chest emblem.
    b.roundedBox([0, 0, 0], [0.38, 0.42, 0.24], suit, 0.5, {
      decal: (p) => (p[1] > -0.78 && p[1] < -0.5 ? [gold, false] : null),
    });
    b.ellipsoid([0, 0.07, 0.122], [0.075, 0.075, 0.012], gold, 0.9, { rings: 6, segments: 16, bias: 0.02 });
    for (const side of [-1, 1]) {
      b.prism([[0, 0.125, 0.134], [side * 0.05, 0.075, 0.134], [side * 0.05, 0.04, 0.134], [0, 0.09, 0.134]],
        [0, 0, 0.006], cape, 0.5, { bias: 0.03 });
    }

    // Head with swept hair and a dark domino mask over the eyes.
    const head = [0, 0.36, 0];
    b.ellipsoid(head, [0.15, 0.16, 0.155], SKIN_TONE, 0.3, {
      rings: 14, segments: 20, bias: 0.05,
      decal: (d) => {
        if (d[1] > 0.42 || (d[2] < -0.25 && d[1] > -0.2)) return [hair, false];
        if (d[2] > 0.45 && d[1] > -0.05 && d[1] < 0.3) return [mask, false];
        return null;
      },
    });
    for (const side of [-1, 1]) {
      b.roundedBox(V3.add(head, [side * 0.055, 0.035, 0.146]), [0.04, 0.016, 0.01], [0.95, 0.97, 1.0], 0.8,
        { bias: 0.08 });
    }
    b.roundedBox(V3.add(head, [0, -0.065, 0.14]), [0.06, 0.012, 0.012], [0.6, 0.25, 0.22], 0.4, { bias: 0.08 });

    // Crimson cape hanging from the shoulders to the backs of the knees.
    b.prism([[-0.17, 0.24, -0.135], [0.17, 0.24, -0.135], [0.3, -0.48, -0.17], [-0.3, -0.48, -0.17]], [0, 0, -0.016],
      cape, 0.5, { bias: 0.02 });

    for (const side of [-1, 1]) {
      b.cylinder([side * 0.245, -0.02, 0.02], 0.06, 0.32, suit, 0.5, { tilt: side * 0.18 });
      b.ellipsoid([side * 0.275, -0.2, 0.03], [0.07, 0.07, 0.07], cape, 0.5, { bias: 0.05 });
      b.cylinder([side * 0.1, -0.36, 0], 0.072, 0.32, suitDark, 0.5);
      b.roundedBox([side * 0.1, -0.56, 0.02], [0.15, 0.17, 0.2], cape, 0.6, { bias: 0.06 });
    }
  }

  function buildJetpack(skin, b) {
    const chrome = skin.metal;
    for (const side of [-1, 1]) {
      // Jetpack tanks, domes and nozzles.
      b.cylinder([side * 0.1, 0.02, -0.27], 0.075, 0.4, chrome, 1);
      b.ellipsoid([side * 0.1, 0.22, -0.27], [0.075, 0.075, 0.075], chrome, 1, { bias: 0.03 });
      b.cylinder([side * 0.1, -0.22, -0.27], 0.055, 0.08, darkMetal, 0.6, { bias: 0.03 });
    }

    // Jetpack body and status light.
    b.roundedBox([0, 0.02, -0.18], [0.32, 0.36, 0.12], chrome, 1);
    b.ellipsoid([0, 0.16, -0.245], [0.024, 0.024, 0.024], cyan, 1, { emissive: true, rings: 5, segments: 8, bias: 0.02 });

    // Flames: outer orange cone and bright core, pointing down from each nozzle.
    flamePivots.forEach((pivot, index) => {
      b.cone(pivot, 0.06, 0.3, orange, index);
      b.cone(V3.add(pivot, [0, -0.005, 0]), 0.032, 0.18, flameCore, index, { bias: 0.01 });
    });
  }

  return { model, flamePivots };
})();

// MARK: - Renderer

const PilotRenderer3D = (() => {
  const cameraPosition = [0, 0.02, 3.4];
  const fieldOfView = (30 * Math.PI) / 180;

  // World-space lights (fixed while the pilot turns, so shading changes with angle).
  const keyDirection = V3.normalize([-0.55, 0.65, 0.6]);
  const keyColor = [1.0, 0.95, 0.88];
  const rimDirection = V3.normalize([0.7, 0.35, -0.75]);
  const rimColor = [0.31, 0.96, 1.0];
  const fillDirection = V3.normalize([0.6, -0.6, 0.5]);
  const fillColor = [1.0, 0.4, 0.7];

  /** Height of the camera's view at the pilot's distance, in meters. */
  const visibleHeight = 2 * cameraPosition[2] * Math.tan(fieldOfView / 2);
  /** Approximate height of the pilot model from boots to helmet, in meters. */
  const modelHeight = 1.3;

  // Scratch buffers reused every frame.
  let capacity = 0;
  let faceOrder, facePartDepth, faceDepth, faceColor, facePoints;
  const colorStrings = new Map();

  function ensureCapacity(n) {
    if (n <= capacity) return;
    capacity = n;
    faceOrder = new Array(n);
    facePartDepth = new Float64Array(n);
    faceDepth = new Float64Array(n);
    faceColor = new Int32Array(n);
    facePoints = new Float64Array(n * 6);
  }

  /** How far each projected face is grown on every side, in canvas units. */
  const seam = 0.3;

  /**
   * Grows the projected triangle at `facePoints[o...o + 5]` by `seam` on every
   * side, so neighbouring faces overlap and no anti-aliasing seams show
   * between them. This matches outlining each face with a 0.6-unit hairline
   * of its own colour (miter joins, limit 10), at about a third of the drawing
   * cost. Offsetting all three sides of a triangle equally scales it about its
   * incenter.
   */
  function growFace(o) {
    const x0 = facePoints[o], y0 = facePoints[o + 1];
    const x1 = facePoints[o + 2], y1 = facePoints[o + 3];
    const x2 = facePoints[o + 4], y2 = facePoints[o + 5];
    const a = Math.hypot(x2 - x1, y2 - y1), b = Math.hypot(x0 - x2, y0 - y2), c = Math.hypot(x1 - x0, y1 - y0);
    const perimeter = a + b + c;
    const doubleArea = Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0));
    if (!(perimeter > 0 && doubleArea > 0)) return;
    const growth = seam * perimeter / doubleArea; // seam / inradius
    const ix = (a * x0 + b * x1 + c * x2) / perimeter, iy = (a * y0 + b * y1 + c * y2) / perimeter;
    for (let k = 0; k < 6; k += 2) {
      const dx = facePoints[o + k] - ix, dy = facePoints[o + k + 1] - iy;
      // Sharp corners would spike out; cap each corner's move at 10x the seam, like a miter limit.
      const g = Math.min(growth, (seam * 10) / Math.max(Math.hypot(dx, dy), 1e-9));
      facePoints[o + k] += dx * g;
      facePoints[o + k + 1] += dy * g;
    }
  }

  function colorString(key) {
    let s = colorStrings.get(key);
    if (!s) {
      s = `rgb(${key >> 16},${(key >> 8) & 255},${key & 255})`;
      if (colorStrings.size > 20000) colorStrings.clear();
      colorStrings.set(key, s);
    }
    return s;
  }

  function flameScales(t) {
    return PilotMesh.flamePivots.map((_, index) => 0.85 + 0.25 * Math.sin(t * 37 + index * 2.1) + 0.08 * Math.sin(t * 91 + index));
  }

  /** Screen position of a model-space point for the given pose. */
  function project(p, rotation, cx, cy, viewHeight) {
    const focal = viewHeight / (2 * Math.tan(fieldOfView / 2));
    const q = V3.sub(matApply(rotation, p), cameraPosition);
    return [cx + (focal * q[0]) / -q[2], cy - (focal * q[1]) / -q[2]];
  }

  /**
   * Draws the pilot with an explicit pose. `viewHeight` is the on-screen
   * height of the camera's full view (`visibleHeight` meters).
   */
  function draw(ctx, cx, cy, viewHeight, rotation, offset, scales, skin, floorGlow, nozzleGlow = true) {
    const mesh = PilotMesh.model(skin);
    const focal = viewHeight / (2 * Math.tan(fieldOfView / 2));
    const [r0, r1, r2, r3, r4, r5, r6, r7, r8] = rotation;
    const [ox, oy, oz] = offset;
    const [camX, camY, camZ] = cameraPosition;
    const pivots = PilotMesh.flamePivots;

    if (floorGlow) {
      // Soft glow beneath him.
      const fz = oz - camZ;
      const feetX = cx + (focal * (ox - camX)) / -fz;
      const feetY = cy - (focal * (-0.85 + oy - camY)) / -fz;
      const glowWidth = viewHeight * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(feetX, feetY, 0, feetX, feetY, glowWidth / 2);
      g.addColorStop(0, css(SystemColor.cyan, 0.3));
      g.addColorStop(1, CLEAR);
      ctx.fillStyle = g;
      ellipsePath(ctx, feetX - glowWidth / 2, feetY - glowWidth * 0.09, glowWidth, glowWidth * 0.18);
      ctx.fill();
      ctx.restore();
    }

    // Depth of each part this frame (toward the camera is +z).
    const partDepths = new Float64Array(mesh.partCount);
    for (let i = 0; i < mesh.partCount; i++) {
      const x = mesh.partCenters[i * 3];
      let y = mesh.partCenters[i * 3 + 1];
      const z = mesh.partCenters[i * 3 + 2];
      const flame = mesh.partFlame[i];
      if (flame >= 0) y = pivots[flame][1] + (y - pivots[flame][1]) * scales[flame];
      partDepths[i] = r6 * x + r7 * y + r8 * z + oz + mesh.partBias[i];
    }

    ensureCapacity(mesh.count);
    const P = mesh.positions;
    const world = new Float64Array(9);
    let count = 0;
    for (let t = 0; t < mesh.count; t++) {
      const flame = mesh.flame[t];
      for (let k = 0; k < 3; k++) {
        const x = P[t * 9 + k * 3];
        let y = P[t * 9 + k * 3 + 1];
        const z = P[t * 9 + k * 3 + 2];
        if (flame >= 0) y = pivots[flame][1] + (y - pivots[flame][1]) * scales[flame];
        world[k * 3] = r0 * x + r1 * y + r2 * z + ox;
        world[k * 3 + 1] = r3 * x + r4 * y + r5 * z + oy;
        world[k * 3 + 2] = r6 * x + r7 * y + r8 * z + oz;
      }
      const ax = world[0], ay = world[1], az = world[2];
      const e1x = world[3] - ax, e1y = world[4] - ay, e1z = world[5] - az;
      const e2x = world[6] - ax, e2y = world[7] - ay, e2z = world[8] - az;
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const nl = Math.hypot(nx, ny, nz);
      if (!(nl > 0)) continue;
      nx /= nl; ny /= nl; nz /= nl;
      const gx = (ax + world[3] + world[6]) / 3, gy = (ay + world[4] + world[7]) / 3, gz = (az + world[5] + world[8]) / 3;
      let vx = camX - gx, vy = camY - gy, vz = camZ - gz;
      const vl = Math.hypot(vx, vy, vz);
      vx /= vl; vy /= vl; vz /= vl;
      // Back-face culling.
      const facing = nx * vx + ny * vy + nz * vz;
      if (!(facing > 0)) continue;

      // Shading.
      const gloss = mesh.gloss[t];
      const cr = mesh.colors[t * 3], cg = mesh.colors[t * 3 + 1], cb = mesh.colors[t * 3 + 2];
      const nk = nx * keyDirection[0] + ny * keyDirection[1] + nz * keyDirection[2];
      const key = Math.max(0, nk);
      // reflect(-key, n) = -key + 2 (n·key) n
      const rx = -keyDirection[0] + 2 * nk * nx, ry = -keyDirection[1] + 2 * nk * ny, rz = -keyDirection[2] + 2 * nk * nz;
      const specular = Math.pow(Math.max(0, rx * vx + ry * vy + rz * vz), 6 + gloss * 40) * gloss;
      let red, green, blue;
      if (mesh.emissive[t]) {
        // Glowing parts stay bright, with a little shape from the key light.
        const k = 0.85 + 0.3 * key, s = specular * 0.6;
        red = cr * k + s; green = cg * k + s; blue = cb * k + s;
      } else {
        const fill = Math.max(0, nx * fillDirection[0] + ny * fillDirection[1] + nz * fillDirection[2]);
        const rim = Math.pow(Math.max(0, nx * rimDirection[0] + ny * rimDirection[1] + nz * rimDirection[2]), 1.5);
        const fresnel = Math.pow(1 - Math.max(0, facing), 3);
        const glow = rim * 0.45 + fresnel * 0.35;
        const spec = specular * 0.9;
        red = cr * (0.2 + key * 0.95 * keyColor[0] + fill * 0.3 * fillColor[0]) + rimColor[0] * glow + keyColor[0] * spec;
        green = cg * (0.2 + key * 0.95 * keyColor[1] + fill * 0.3 * fillColor[1]) + rimColor[1] * glow + keyColor[1] * spec;
        blue = cb * (0.2 + key * 0.95 * keyColor[2] + fill * 0.3 * fillColor[2]) + rimColor[2] * glow + keyColor[2] * spec;
      }
      const R = Math.round(clamp(red, 0, 1) * 255), G = Math.round(clamp(green, 0, 1) * 255);
      const B = Math.round(clamp(blue, 0, 1) * 255);

      for (let k = 0; k < 3; k++) {
        const qz = world[k * 3 + 2] - camZ;
        facePoints[count * 6 + k * 2] = cx + (focal * (world[k * 3] - camX)) / -qz;
        facePoints[count * 6 + k * 2 + 1] = cy - (focal * (world[k * 3 + 1] - camY)) / -qz;
      }
      growFace(count * 6);
      facePartDepth[count] = partDepths[mesh.part[t]];
      faceDepth[count] = gz;
      faceColor[count] = (R << 16) | (G << 8) | B;
      faceOrder[count] = count;
      count++;
    }

    // Painter's algorithm by part, farthest first.
    const order = faceOrder.slice(0, count);
    order.sort((a, b) => (facePartDepth[a] !== facePartDepth[b] ? facePartDepth[a] - facePartDepth[b] : faceDepth[a] - faceDepth[b]));

    // Consecutive faces of the same color are filled together (same result,
    // far fewer draw calls). Each face was grown slightly (growFace), which
    // hides anti-aliasing seams between faces.
    ctx.save();
    let current = -1;
    const flush = () => {
      if (current < 0) return;
      ctx.fillStyle = colorString(current);
      ctx.fill();
    };
    for (let i = 0; i < count; i++) {
      const f = order[i];
      const color = faceColor[f];
      if (color !== current) {
        flush();
        current = color;
        ctx.beginPath();
      }
      const o = f * 6;
      ctx.moveTo(facePoints[o], facePoints[o + 1]);
      ctx.lineTo(facePoints[o + 2], facePoints[o + 3]);
      ctx.lineTo(facePoints[o + 4], facePoints[o + 5]);
      ctx.closePath();
    }
    flush();
    ctx.restore();

    // Additive glow at each nozzle.
    if (skin.id !== 'hero' && nozzleGlow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      pivots.forEach((pivot, index) => {
        const local = [pivot[0], pivot[1] - 0.12 * scales[index], pivot[2]];
        const nozzle = V3.add(matApply(rotation, local), offset);
        // The jetpack is on his back: fade the glow out as it turns behind his body.
        const visibility = clamp((nozzle[2] - oz + 0.05) / 0.25, 0, 1);
        if (!(visibility > 0)) return;
        const qz = nozzle[2] - camZ;
        const px = cx + (focal * (nozzle[0] - camX)) / -qz;
        const py = cy - (focal * (nozzle[1] - camY)) / -qz;
        const r = viewHeight * 0.09 * scales[index];
        const g = ctx.createRadialGradient(px, py, 0, px, py, r);
        g.addColorStop(0, css(SystemColor.orange, 0.45 * visibility));
        g.addColorStop(1, CLEAR);
        ctx.fillStyle = g;
        ellipsePath(ctx, px - r, py - r, r * 2, r * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  }

  return { draw, project, flameScales, visibleHeight, modelHeight };
})();

// MARK: - Menu turntable

/**
 * A 3D version of the jetpack pilot that slowly turns, sways and bobs so the
 * main menu shows him from every angle.
 */
const PilotTurntable = {
  /** Full turns around the vertical axis, with a slow pitch and roll so he's also seen from slightly above, below and side-on. */
  draw(ctx, width, height, t, skin) {
    const yaw = rotationMatrix([0, 1, 0], t * 0.75);
    const pitch = rotationMatrix([1, 0, 0], Math.sin(t * 0.5) * 0.35);
    const roll = rotationMatrix([0, 0, 1], Math.sin(t * 0.8) * 0.12);
    // Floating bob.
    const offset = [0, Math.sin(t * 1.6) * 0.06, 0];
    PilotRenderer3D.draw(ctx, width / 2, height / 2, height, matMul(matMul(pitch, yaw), roll), offset,
      PilotRenderer3D.flameScales(t), skin, true);
  },
};

// MARK: - In-game sprites

/**
 * Draws the 3D pilot inside the game, from pre-rendered images. Each view of
 * each skin is rendered from the 3D model once and cached. In game the pilot
 * only tilts or banks around the viewing axis, which is just a 2D rotation
 * of that image, so each frame draws the image plus animated 2D flames.
 */
const PilotSprite3D = (() => {
  /** On-screen model length (boots to helmet) the sprites are rendered at. */
  const referenceHeight = 240;
  const cache = new Map();

  /** Back view: turned to face away, leaning into the climb so the top of the jetpack shows. */
  const backPose = matMul(rotationMatrix([1, 0, 0], 0.25), rotationMatrix([0, 1, 0], Math.PI));

  /**
   * Side view: head (+y) points right, jetpack (−z) points up and the front
   * (+z) faces down, then turned a little toward the viewer so some of his
   * back shows.
   */
  const lying = [0, 1, 0, 0, 0, -1, -1, 0, 0];
  const sidePose = matMul(rotationMatrix([1, 0, 0], 0.35), lying);

  /** Renders (once) and returns the cached sprite for a skin and view. */
  function sprite(skin, view) {
    const key = skin.id + ':' + view;
    let cached = cache.get(key);
    if (cached !== undefined) return cached;
    cached = null;
    try {
      const pose = view === 'back' ? backPose : sidePose;
      // Room for hats, antennas, blades and arms around the 1.3 m body.
      const w = view === 'back' ? referenceHeight * 1.3 : referenceHeight * 1.6;
      const h = view === 'back' ? referenceHeight * 1.5 : referenceHeight * 1.2;
      const cx = w / 2, cy = h / 2;
      const viewHeight = referenceHeight * (PilotRenderer3D.visibleHeight / PilotRenderer3D.modelHeight);
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const c = canvas.getContext('2d');
      c.scale(scale, scale);
      // Flames are drawn live as 2D shapes, so render the model without them.
      PilotRenderer3D.draw(c, cx, cy, viewHeight, pose, [0, 0, 0], [0.001, 0.001], skin, false, false);
      const nozzles = PilotMesh.flamePivots.map((pivot) => {
        const p = PilotRenderer3D.project([pivot[0], pivot[1] - 0.03, pivot[2]], pose, cx, cy, viewHeight);
        return [p[0] - cx, p[1] - cy];
      });
      cached = { canvas, w, h, nozzles };
    } catch (e) {
      cached = null; // Falls back to the flat 2D pilot.
    }
    cache.set(key, cached);
    return cached;
  }

  /**
   * The sprite resampled once to `pixelsPerUnit` canvas pixels per sprite
   * unit (its on-screen size), so each frame only rotates it: a high-quality
   * downscale every frame is costly, especially where canvases are drawn on
   * the CPU. Remade when the size changes (resizes, render quality).
   */
  function sized(s, pixelsPerUnit) {
    const ppu = Math.round(pixelsPerUnit * 256) / 256;
    if (s.sized && s.sizedPPU === ppu) return s.sized;
    if (s.sized) s.sized.width = s.sized.height = 0; // free it now (Safari holds canvas memory until a GC)
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(s.w * ppu));
    canvas.height = Math.max(1, Math.round(s.h * ppu));
    const c = canvas.getContext('2d');
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(s.canvas, 0, 0, canvas.width, canvas.height);
    s.sized = canvas;
    s.sizedPPU = ppu;
    return canvas;
  }

  /** Draws a cached sprite rotated by `rotation`, with flames on top. */
  function drawSprite(s, ctx, cx, cy, length, rotation, skin, flame) {
    const k = length / referenceHeight;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.scale(k, k);
    const t = ctx.getTransform();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(sized(s, Math.hypot(t.a, t.b)), -s.w / 2, -s.h / 2, s.w, s.h);

    // The hero flies without a jetpack. Otherwise the nozzles face out of the
    // body in both views, so the flames go on top.
    if (skin.id !== 'hero') {
      ctx.globalCompositeOperation = 'lighter';
      const half = referenceHeight * 0.045;
      s.nozzles.forEach(([nx, ny], index) => {
        const [[dx, dy], flameLength] = flame(index);
        // Perpendicular to the flame, for its width.
        const sx = -dy, sy = dx;
        const point = (along, across) => [nx + dx * along + sx * across, ny + dy * along + sy * across];
        const flamePath = (scale) => {
          const p0 = point(0, -half * scale);
          const c1 = point(flameLength * scale * 0.5, -half * scale * 1.3);
          const tip = point(flameLength * scale, 0);
          const c2 = point(flameLength * scale * 0.5, half * scale * 1.3);
          const p1 = point(0, half * scale);
          ctx.beginPath();
          ctx.moveTo(p0[0], p0[1]);
          ctx.quadraticCurveTo(c1[0], c1[1], tip[0], tip[1]);
          ctx.quadraticCurveTo(c2[0], c2[1], p1[0], p1[1]);
          ctx.closePath();
        };
        const [gx, gy] = point(flameLength * 0.3, 0);
        const r = Math.max(referenceHeight * 0.05, flameLength * 0.8);
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
        g.addColorStop(0, css(SystemColor.orange, 0.45));
        g.addColorStop(1, CLEAR);
        ctx.fillStyle = g;
        ellipsePath(ctx, gx - r, gy - r, r * 2, r * 2);
        ctx.fill();
        flamePath(1);
        ctx.fillStyle = rgba(1, 0.55, 0.22, 0.9);
        ctx.fill();
        flamePath(0.55);
        ctx.fillStyle = rgba(1, 0.95, 0.75);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  return {
    /**
     * The pilot from behind, upright, for portrait play. `height` is his
     * on-screen height (boots to helmet); `bank` rolls him toward the side
     * he's steering. Returns false if the sprite isn't available.
     */
    drawBackView(ctx, cx, cy, height, bank, time, skin) {
      const s = sprite(skin, 'back');
      if (!s) return false;
      drawSprite(s, ctx, cx, cy, height, bank, skin, (index) => {
        // Seen from behind, the flames fire straight down the screen.
        const flicker = 0.85 + 0.25 * Math.sin(time * 37 + index * 2.1) + 0.08 * Math.sin(time * 91 + index);
        return [[0, 1], referenceHeight * 0.2 * flicker];
      });
      return true;
    },

    /**
     * The pilot from the side, flying right, for landscape play. `length` is
     * his on-screen length (boots to helmet); `tilt` pitches his nose up
     * (negative) or down (positive). The flame flares while `thrusting`.
     */
    drawSideView(ctx, cx, cy, length, tilt, time, thrusting, skin) {
      const s = sprite(skin, 'side');
      if (!s) return false;
      drawSprite(s, ctx, cx, cy, length, tilt, skin, (index) => {
        // Flames trail behind him (to the left), long right after a flap.
        const flicker = 0.5 + 0.5 * Math.sin(time * 60 + index);
        const size = thrusting ? 0.26 + flicker * 0.12 : 0.06 + flicker * 0.03;
        return [[-1, 0], referenceHeight * size];
      });
      return true;
    },

    /** Renders a skin's sprites ahead of time so the first frame in game doesn't stall. */
    warm(skin) {
      sprite(skin, 'side');
      sprite(skin, 'back');
    },
  };
})();
