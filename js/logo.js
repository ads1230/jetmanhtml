'use strict';

// The game's title logo and panel lettering (port of JetmanLogo.swift):
// chunky mechanical letters built from riveted panels, two-tone (cool on
// top, hot below) split by a glowing seam, with an extruded edge, neon glow
// and a periodic shine sweep. Used for JETMAN, GET READY, GAME OVER and
// HIGH SCORES.

const PanelLettering = (() => {
  const cellWidth = 10;
  const cellHeight = 14;
  const gap = 1.3;
  const spaceWidth = 4;
  const depth = 1.1;
  const padding = 1.6;
  /** Where the top and bottom colors meet. */
  const seamY = 7;

  const topLight = [0.50, 0.90, 1.0];
  const topDark = [0.30, 0.32, 0.92];
  const bottomLight = [1.0, 0.36, 0.62];
  const bottomDark = [0.96, 0.36, 0.16];
  const edge = [0.06, 0.05, 0.16];
  const neon = [0.31, 0.96, 1.0];

  /**
   * A rectangle with optional chamfered corners (top-left, top-right,
   * bottom-right, bottom-left), as a clockwise polygon.
   */
  function panel(x, y, w, h, { tl = 0, tr = 0, br = 0, bl = 0 } = {}) {
    return [[x + tl, y], [x + w - tr, y], [x + w, y + tr], [x + w, y + h - br], [x + w - br, y + h], [x + bl, y + h],
      [x, y + h - bl], [x, y + tl]];
  }

  const { green, cyan, orange, pink } = SystemColor;

  /** One letter in a 10 x 14 cell: panels, an indicator lamp (top-left of 1.4 x 0.9) and three vent slots. */
  const glyphs = {
    J: { panels: [panel(0, 0, 10, 3.5, { tl: 1.2 }), panel(6, 3.5, 4, 10.5, { br: 1.6 }),
      panel(0, 10.5, 6, 3.5, { bl: 1.2 }), panel(0, 7.2, 3.5, 3.3, { tl: 0.8 })],
    light: [1.8, 1.3], lightColor: green, vents: [7.2, 8.6] },
    E: { panels: [panel(0, 0, 10, 3.5, { tl: 1.2, tr: 0.8 }), panel(0, 3.5, 3.8, 7),
      panel(3.8, 5.25, 4.8, 3.5, { tr: 0.9, br: 0.9 }), panel(0, 10.5, 10, 3.5, { br: 0.8, bl: 1.2 })],
    light: [6.4, 1.3], lightColor: cyan, vents: [5.0, 11.4] },
    T: { panels: [panel(0, 0, 10, 3.5, { tl: 1.2, tr: 1.2 }), panel(3, 3.5, 4, 10.5, { br: 1, bl: 1 })],
      light: [1.6, 1.3], lightColor: orange, vents: [3.8, 9.2] },
    M: { panels: [panel(0, 0, 10, 3.5, { tl: 2.4, tr: 2.4 }), panel(0, 3.5, 3.5, 10.5, { bl: 0.8 }),
      panel(6.5, 3.5, 3.5, 10.5, { br: 0.8 }), panel(3.75, 3.5, 2.5, 3, { br: 1.25, bl: 1.25 })],
    light: [4.3, 1.3], lightColor: pink, vents: [0.9, 9.4] },
    A: { panels: [panel(0, 0, 10, 3.5, { tl: 3, tr: 3 }), panel(0, 3.5, 3.5, 10.5, { bl: 0.8 }),
      panel(6.5, 3.5, 3.5, 10.5, { br: 0.8 }), panel(3.5, 7.6, 3, 2.6)],
    light: [4.3, 1.3], lightColor: cyan, vents: [7.3, 10.6] },
    N: { panels: [panel(0, 0, 3.5, 14, { tl: 1, bl: 0.8 }), panel(6.5, 0, 3.5, 14, { tr: 1, br: 0.8 }),
      [[3.5, 0], [5.4, 0], [6.5, 5.5], [6.5, 11.5], [3.5, 4.5]]],
    light: [7.5, 1.6], lightColor: green, vents: [0.9, 9.4] },
    G: { panels: [panel(0, 0, 10, 3.5, { tl: 1.2, tr: 0.8 }), panel(0, 3.5, 3.5, 7),
      panel(0, 10.5, 10, 3.5, { br: 0.8, bl: 1.2 }), panel(6.5, 6.8, 3.5, 3.7, { tr: 0.6 }),
      panel(4.6, 6.8, 1.9, 2.4, { bl: 0.6 })],
    light: [6.4, 1.3], lightColor: orange, vents: [0.9, 6.4] },
    R: { panels: [panel(0, 0, 3.5, 14, { tl: 1, bl: 0.8 }), panel(3.5, 0, 6.5, 3.5, { tr: 1.2 }),
      panel(6.5, 3.5, 3.5, 3.2, { br: 1.2 }), panel(3.5, 5.5, 4.6, 2.6, { br: 0.6 }),
      [[4.2, 8.1], [7.4, 8.1], [10, 14], [6.6, 14]]],
    light: [6.6, 1.3], lightColor: pink, vents: [0.9, 9.4] },
    D: { panels: [panel(0, 0, 3.5, 14, { tl: 1, bl: 1 }), panel(3.5, 0, 3.5, 3.5),
      panel(6.5, 0, 3.5, 14, { tr: 2.8, br: 2.8 }), panel(3.5, 10.5, 3.5, 3.5)],
    light: [1.05, 1.6], lightColor: cyan, vents: [7.3, 6.2] },
    H: { panels: [panel(0, 0, 3.5, 14, { tl: 1, bl: 1 }), panel(6.5, 0, 3.5, 14, { tr: 1, br: 1 }),
      panel(3.5, 5.25, 3, 3.5)],
    light: [1.05, 1.6], lightColor: cyan, vents: [7.3, 9.6] },
    I: { panels: [panel(0, 0, 10, 3.5, { tl: 1, tr: 1 }), panel(3, 3.5, 4, 7),
      panel(0, 10.5, 10, 3.5, { br: 1, bl: 1 })],
    light: [1.6, 1.3], lightColor: green, vents: [3.8, 7.8] },
    S: { panels: [panel(0, 0, 10, 3.5, { tl: 1.6, tr: 0.8 }), panel(0, 3.5, 3.5, 2.2),
      panel(0, 5.5, 10, 3.1, { tr: 0.8, bl: 0.8 }), panel(6.5, 8.4, 3.5, 2.3),
      panel(0, 10.5, 10, 3.5, { br: 1.6, bl: 0.8 })],
    light: [6.4, 1.3], lightColor: pink, vents: [1.2, 11.4] },
    C: { panels: [panel(0, 0, 10, 3.5, { tl: 1.6, tr: 0.8 }), panel(0, 3.5, 3.5, 7),
      panel(0, 10.5, 10, 3.5, { br: 0.8, bl: 1.6 })],
    light: [6.4, 1.3], lightColor: orange, vents: [5.2, 11.4] },
    O: { panels: [panel(0, 0, 3.5, 14, { tl: 1.6, bl: 1.6 }), panel(6.5, 0, 3.5, 14, { tr: 1.6, br: 1.6 }),
      panel(3.5, 0, 3, 3.5), panel(3.5, 10.5, 3, 3.5)],
    light: [4.3, 1.3], lightColor: orange, vents: [0.9, 9.4] },
    V: { panels: [panel(0, 0, 3.5, 9, { tl: 1 }), panel(6.5, 0, 3.5, 9, { tr: 1 }),
      [[0, 9], [10, 9], [6.6, 14], [3.4, 14]]],
    light: [1.05, 1.4], lightColor: pink, vents: [7.3, 3.6] },
    Y: { panels: [panel(0, 0, 3.5, 6, { tl: 1 }), panel(6.5, 0, 3.5, 6, { tr: 1 }),
      panel(0, 5.2, 10, 3.6, { br: 3, bl: 3 }), panel(3, 8.8, 4, 5.2, { br: 1, bl: 1 })],
    light: [1.05, 1.4], lightColor: green, vents: [3.8, 10.2] },
  };

  function pointInPolygon(x, y, points) {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i], [xj, yj] = points[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function pathFrom(points) {
    const path = new Path2D();
    path.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1]);
    path.closePath();
    return path;
  }

  const layouts = new Map();

  /** Everything about a word that doesn't change from frame to frame. */
  function layout(word) {
    let cached = layouts.get(word);
    if (cached) return cached;
    let x = 0;
    const panels = [];
    const silhouette = new Path2D();
    const lights = [];
    const vents = [];
    const rivets = [];
    for (const character of word) {
      const letter = glyphs[character];
      if (!letter) {
        x += spaceWidth;
        continue;
      }
      for (const raw of letter.panels) {
        const points = raw.map(([px, py]) => [px + x, py]);
        const path = pathFrom(points);
        panels.push(path);
        silhouette.addPath(path);

        // Rivets near the corners of larger panels.
        const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        if (maxX - minX >= 3 && maxY - minY >= 3) {
          const inset = 0.75;
          for (const [cx, cy] of [[minX + inset, minY + inset], [maxX - inset, minY + inset],
            [maxX - inset, maxY - inset], [minX + inset, maxY - inset]]) {
            // Skip corners that were chamfered away.
            if (pointInPolygon(cx - 0.35, cy - 0.35, points) && pointInPolygon(cx + 0.35, cy + 0.35, points)) {
              rivets.push([cx, cy]);
            }
          }
        }
      }
      lights.push({ x: x + letter.light[0], y: letter.light[1], w: 1.4, h: 0.9, color: letter.lightColor });
      vents.push([x + letter.vents[0], letter.vents[1]]);
      x += cellWidth + gap;
    }
    const width = Math.max(x - gap, cellWidth);
    cached = {
      panels, silhouette, lights, vents, rivets, width,
      totalWidth: width + depth + padding * 2,
      totalHeight: cellHeight + depth + padding * 2,
    };
    layouts.set(word, cached);
    return cached;
  }

  function fillRoundRect(ctx, x, y, w, h, r, style) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = style;
    ctx.fill();
  }

  /**
   * Draws `word` centered in a width x height area of `ctx` at `time` seconds.
   *
   * `part` lets PanelTitle cache what never changes: 'base' is the halo,
   * extruded edge, faces, gloss and the seam's dark line; 'details' is the
   * panel seams, rivets, vents and the lights' bezels; 'live' is the rest
   * (the seam's pulsing glow, the blinking lights and the sweeping shine),
   * drawing the `details` layer (a canvas the size of `ctx`'s) between the
   * seam glow and the lights, in the same order as 'all'.
   */
  function draw(ctx, word, width, height, time, part = 'all', details = null) {
    const L = layout(word);
    const scale = Math.min(width / L.totalWidth, height / L.totalHeight);
    ctx.save();
    ctx.translate((width - L.totalWidth * scale) / 2 + padding * scale, (height - L.totalHeight * scale) / 2 + padding * scale);
    ctx.scale(scale, scale);
    const lettersWidth = L.width;
    const drawsBase = part === 'all' || part === 'base';
    const drawsDetails = part === 'all' || part === 'details';
    const drawsLive = part === 'all' || part === 'live';
    let g;

    if (drawsBase) {
      // Neon halo behind everything.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      for (const [lineWidth, opacity] of [[3.2, 0.06], [1.8, 0.10], [0.9, 0.16]]) {
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = css(neon, opacity);
        ctx.stroke(L.silhouette);
      }
      ctx.restore();

      // Extruded edge for depth (down and to the right).
      const steps = 6;
      for (let step = steps; step >= 1; step--) {
        const t = step / steps;
        ctx.save();
        ctx.translate(depth * t, depth * t);
        ctx.fillStyle = step === steps ? 'rgba(0,0,0,0.6)' : css(edge);
        ctx.fill(L.silhouette);
        ctx.restore();
      }
      ctx.save();
      ctx.translate(depth * 0.5, depth * 0.5);
      ctx.lineWidth = 0.08;
      ctx.strokeStyle = rgba(0.3, 0.2, 0.6, 0.6);
      ctx.stroke(L.silhouette);
      ctx.restore();

      // Two-tone faces.
      ctx.save();
      ctx.beginPath();
      ctx.rect(-1, -1, lettersWidth + 2, seamY + 1);
      ctx.clip();
      g = ctx.createLinearGradient(0, 0, 0, seamY);
      g.addColorStop(0, css(topLight));
      g.addColorStop(1, css(topDark));
      ctx.fillStyle = g;
      ctx.fill(L.silhouette);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(-1, seamY, lettersWidth + 2, cellHeight);
      ctx.clip();
      g = ctx.createLinearGradient(0, seamY, 0, cellHeight);
      g.addColorStop(0, css(bottomLight));
      g.addColorStop(1, css(bottomDark));
      ctx.fillStyle = g;
      ctx.fill(L.silhouette);
      ctx.restore();
    }

    // Everything below is clipped to the letters.
    ctx.save();
    ctx.clip(L.silhouette);

    if (drawsBase) {
      // Glossy highlight across the top.
      g = ctx.createLinearGradient(0, 0, 0, 3);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, lettersWidth, 3);

      // The seam between the two halves (its glow is live).
      ctx.fillStyle = css(edge, 0.8);
      ctx.fillRect(0, seamY - 0.55, lettersWidth, 1.1);
    }

    if (drawsLive) {
      // Glowing seam between the two halves.
      const pulse = 0.8 + 0.2 * Math.sin(time * 2.4);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      g = ctx.createLinearGradient(0, seamY - 0.32, 0, seamY + 0.32);
      g.addColorStop(0, css(neon, 0.7 * pulse));
      g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, css(neon, 0.7 * pulse));
      ctx.fillStyle = g;
      ctx.fillRect(0, seamY - 0.32, lettersWidth, 0.64);
      ctx.restore();
      if (details) {
        // The cached layer was clipped when it was drawn; blit it unclipped so
        // its anti-aliased edges aren't faded twice, then clip again.
        ctx.restore(); // face clip
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(details, 0, 0);
        ctx.restore();
        ctx.save();
        ctx.clip(L.silhouette);
      }
    }

    if (drawsDetails) {
      // Panel seams with a light bevel on their top-left edges.
      const seamColor = css(edge, 0.75);
      for (const path of L.panels) {
        ctx.lineWidth = 0.2;
        ctx.strokeStyle = seamColor;
        ctx.stroke(path);
        ctx.save();
        ctx.clip(path);
        ctx.translate(0.22, 0.22);
        ctx.lineWidth = 0.16;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.stroke(path);
        ctx.restore();
      }

      // Rivets near the corners of larger panels.
      const r = 0.2;
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = css(edge, 0.6);
      for (const [cx, cy] of L.rivets) {
        const rivet = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
        rivet.addColorStop(0, 'rgba(255,255,255,0.9)');
        rivet.addColorStop(1, rgba(0.45, 0.45, 0.45));
        ctx.fillStyle = rivet;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }

      // Vent slots.
      const ventColor = css(edge, 0.7);
      for (const [vx, vy] of L.vents) {
        for (let i = 0; i < 3; i++) fillRoundRect(ctx, vx + i * 0.5, vy, 0.22, 1.4, 0.1, ventColor);
      }

      // Bezels around the indicator lights. (Each light's halo stays inside
      // its own letter, so drawing every bezel before the lights matches the
      // app's light-by-light order.)
      for (const light of L.lights) {
        fillRoundRect(ctx, light.x - 0.12, light.y - 0.12, light.w + 0.24, light.h + 0.24, 0.25, css(edge, 0.85));
      }
    }

    if (drawsLive) {
      // Blinking indicator lights.
      L.lights.forEach((light, index) => {
        const blink = 0.55 + 0.45 * Math.max(0, Math.sin(time * 1.7 + index * 1.3));
        fillRoundRect(ctx, light.x, light.y, light.w, light.h, 0.2, css(light.color, 0.5 + 0.5 * blink));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const mx = light.x + light.w / 2, my = light.y + light.h / 2;
        const halo = ctx.createRadialGradient(mx, my, 0, mx, my, 1.6);
        halo.addColorStop(0, css(light.color, 0.45 * blink));
        halo.addColorStop(1, CLEAR);
        ctx.fillStyle = halo;
        ellipsePath(ctx, light.x - 1, light.y - 1, light.w + 2, light.h + 2);
        ctx.fill();
        ctx.restore();
      });

      // Shine sweeping across every few seconds.
      const period = 4.5;
      const progress = (time % period) / period;
      const sweepX = -6 + progress * (lettersWidth + 18);
      ctx.globalCompositeOperation = 'lighter';
      polygonPath(ctx, [[sweepX, 0], [sweepX + 2.2, 0], [sweepX - 2.8, cellHeight], [sweepX - 5, cellHeight]]);
      g = ctx.createLinearGradient(sweepX - 5, 0, sweepX + 2.2, 0);
      g.addColorStop(0, CLEAR);
      g.addColorStop(0.5, 'rgba(255,255,255,0.4)');
      g.addColorStop(1, CLEAR);
      ctx.fillStyle = g;
      ctx.fill();
    }

    ctx.restore(); // face clip
    ctx.restore();
  }

  function aspectRatio(word) {
    const L = layout(word);
    return L.totalWidth / L.totalHeight;
  }

  return { draw, aspectRatio };
})();

/**
 * A live canvas showing panel lettering (SwiftUI `PanelTitle`), redrawn at
 * 30 fps while it's on screen.
 */
class PanelTitle {
  constructor(text, label) {
    this.word = text.toUpperCase();
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'panel-title';
    this.canvas.style.aspectRatio = String(PanelLettering.aspectRatio(this.word));
    this.canvas.setAttribute('role', 'heading');
    this.canvas.setAttribute('aria-label', label || text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()));
    this.ctx = this.canvas.getContext('2d');
    PanelTitle.all.add(this);
  }

  /**
   * Redraws if the canvas is visible, resizing its backing store to match the
   * screen. The parts of the lettering that never change are drawn once per
   * size into two offscreen layers; each frame then only draws the animated
   * glow, lights and shine around them.
   */
  render(time) {
    const canvas = this.canvas;
    // Check visibility first: reading the size forces a layout.
    if (!canvas.isConnected || !PanelTitle.isShown(canvas)) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const key = `${pw}x${ph}x${w}x${h}`;
    if (this.layersKey !== key) {
      // Free the old layers now: Safari keeps canvas memory until they're collected.
      for (const old of [this.base, this.details]) if (old) old.width = old.height = 0;
      this.base = this.layer(pw, ph, dpr, w, h, 'base');
      this.details = this.layer(pw, ph, dpr, w, h, 'details');
      this.layersKey = key;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    PanelLettering.draw(ctx, this.word, w, h, time, 'live', this.details);
  }

  /** One unchanging part of the lettering, drawn into a canvas the size of this one. */
  layer(pw, ph, dpr, w, h, part) {
    const layer = document.createElement('canvas');
    layer.width = pw;
    layer.height = ph;
    const c = layer.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    PanelLettering.draw(c, this.word, w, h, 0, part);
    return layer;
  }

  /** Whether an element and its ancestors are displayed and not faded out. */
  static isShown(element) {
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      if (node.hidden || node.classList.contains('is-hidden')) return false;
    }
    return element.offsetParent !== null;
  }

  /** Redraws every visible panel title, at most 30 times a second (TimelineView minimumInterval 1/30). */
  static renderAll(nowSeconds) {
    if (nowSeconds - PanelTitle.lastRender < 1 / 31) return;
    PanelTitle.lastRender = nowSeconds;
    const time = Date.now() / 1000;
    for (const title of PanelTitle.all) title.render(time);
  }
}
PanelTitle.all = new Set();
PanelTitle.lastRender = -Infinity;
