'use strict';

// Draws a GameModel into a Canvas 2D context (port of GameRenderer.swift).
// SwiftUI's `.plusLighter` blend maps to `globalCompositeOperation = 'lighter'`.

const ROCK_LIGHT = [0.11, 0.15, 0.30];
const ROCK_DARK = [0.03, 0.04, 0.11];
const NEON_CYAN = [0.31, 0.96, 1.0];
const NEON_VIOLET = [0.62, 0.42, 1.0];
const HOT_PINK = [1.0, 0.24, 0.55];
const HOT_ORANGE = [1.0, 0.55, 0.22];
const CLEAR = 'rgba(0,0,0,0)';

class GameRenderer {
  constructor() {
    this.model = null;
    this.w = 0;
    this.h = 0;
    /** The main menu shows the cave without the 2D pilot or his exhaust. */
    this.showsPlayer = true;
    this.skin = PilotSkin.navy;
    /** Settings → Screen shake. */
    this.screenShake = true;
  }

  /** Playfield height in canvas units (one world unit). */
  get unit() { return Math.min(this.h, this.w / GameModel.minimumAspect); }
  /** Vertical offset of the playfield when letterboxed. */
  get originY() { return (this.h - this.unit) / 2; }

  screenX(worldX) { return (worldX - this.model.cameraX) * this._unit; }
  screenY(worldY) { return this._originY + worldY * this._unit; }

  // MARK: Entry point

  /** Draws the world into `ctx`, whose current transform maps world-view points to the canvas. */
  draw(ctx, model, width, height) {
    this.model = model;
    this.w = width;
    this.h = height;
    this._unit = this.unit;
    this._originY = this.originY;

    this.drawBackdrop(ctx);

    ctx.save();
    // Screen shake after a crash.
    if (this.screenShake && model.shake > 0) {
      const s = model.shake * model.shake * 10;
      ctx.translate(Math.sin(model.time * 91) * s, Math.cos(model.time * 73) * s);
    }
    this.drawCave(ctx);
    this.drawObstacles(ctx);
    if (this.showsPlayer) {
      this.drawParticles(ctx, true);
      if (model.phase !== 'crashed') this.drawPlayer(ctx);
    }
    this.drawParticles(ctx, false);
    ctx.restore();

    this.drawVignette(ctx);
  }

  // MARK: Background

  drawBackdrop(ctx) {
    const { w, h } = this;
    // Back wall of the cave: darkest at the top and bottom, faintly lit in the middle.
    const wall = ctx.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, css(ROCK_DARK));
    wall.addColorStop(0.5, rgba(0.09, 0.07, 0.20));
    wall.addColorStop(1, css(ROCK_DARK));
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);

    // Rock texture on the back wall.
    this.drawWallPatches(ctx);

    // Light shafts falling through cracks in the ceiling.
    this.drawLightShafts(ctx);

    // Far and near layers of stalactites and stalagmites.
    const far = [0.12, 0.09, 0.25];
    const near = [0.07, 0.06, 0.17];
    this.drawFormations(ctx, 0.15, 0.16, 0.38, true, far, 11, false);
    this.drawFormations(ctx, 0.15, 0.19, 0.34, false, far, 23, false);
    this.drawFormations(ctx, 0.35, 0.27, 0.32, true, near, 37, true);
    this.drawFormations(ctx, 0.35, 0.3, 0.3, false, near, 41, true);

    // Drifting dust motes catching the light.
    const m = this.model;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tile = Math.max(w, 1);
    for (const mote of GameRenderer.motes) {
      let x = (mote.x * tile - m.cameraX * this._unit * 0.5 + Math.sin(m.time * 0.4 + mote.phase) * 12) % tile;
      if (x < 0) x += tile;
      let y = (mote.y * h - m.time * 6) % h;
      if (y < 0) y += h;
      const alpha = 0.25 + 0.2 * Math.sin(m.time * 1.5 + mote.phase);
      const s = mote.size;
      ctx.fillStyle = css(NEON_CYAN, alpha);
      ellipsePath(ctx, x - s / 2, y - s / 2, s, s);
      ctx.fill();
    }
    ctx.restore();
  }

  drawWallPatches(ctx) {
    const unit = this._unit;
    const parallax = 0.06;
    const spacing = 0.22;
    const offset = this.model.cameraX * parallax;
    const first = Math.floor(offset / spacing) - 1;
    const count = Math.trunc(this.w / unit / spacing) + 3;
    const tint = css([0.16, 0.12, 0.3], 0.5);
    for (let k = 0; k <= count; k++) {
      const i = first + k;
      const cx = (i * spacing - offset + sceneryHash(i, 3) * spacing) * unit;
      const cy = this.screenY(0.1 + sceneryHash(i, 5) * 0.8);
      const w = (0.12 + sceneryHash(i, 7) * 0.18) * unit;
      const h = w * (0.4 + sceneryHash(i, 9) * 0.4);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
      g.addColorStop(0, tint);
      g.addColorStop(1, CLEAR);
      ctx.fillStyle = g;
      ellipsePath(ctx, cx - w / 2, cy - h / 2, w, h);
      ctx.fill();
    }
  }

  drawLightShafts(ctx) {
    const unit = this._unit, m = this.model;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const parallax = 0.1;
    const spacing = 1.4;
    const offset = m.cameraX * parallax;
    const first = Math.floor(offset / spacing) - 1;
    const count = Math.trunc(this.w / unit / spacing) + 3;
    for (let k = 0; k <= count; k++) {
      const i = first + k;
      if (!(sceneryHash(i, 13) > 0.3)) continue;
      const topX = (i * spacing - offset + sceneryHash(i, 17) * spacing * 0.6) * unit;
      const slant = unit * 0.25;
      const topWidth = unit * (0.03 + sceneryHash(i, 19) * 0.03);
      const bottomWidth = topWidth * 5;
      const flicker = 0.85 + 0.15 * Math.sin(m.time * 0.7 + i);
      ctx.beginPath();
      ctx.moveTo(topX - topWidth / 2, 0);
      ctx.lineTo(topX + topWidth / 2, 0);
      ctx.lineTo(topX + slant + bottomWidth / 2, this.h);
      ctx.lineTo(topX + slant - bottomWidth / 2, this.h);
      ctx.closePath();
      const g = ctx.createLinearGradient(topX, 0, topX + slant, this.h * 0.85);
      g.addColorStop(0, css(NEON_VIOLET, 0.16 * flicker));
      g.addColorStop(1, css(NEON_CYAN, 0));
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * A row of tapering rock spikes hanging from the top (stalactites) or
   * rising from the bottom (stalagmites), joined by a continuous rock band.
   */
  drawFormations(ctx, parallax, spacing, length, fromTop, color, seed, crystals) {
    const unit = this._unit;
    const offset = this.model.cameraX * parallax;
    const first = Math.floor(offset / spacing) - 1;
    const count = Math.trunc(this.w / unit / spacing) + 3;
    const direction = fromTop ? 1 : -1;
    const base = fromTop ? this.screenY(0.04) : this.screenY(0.96);
    const edge = fromTop ? -20 : this.h + 20;

    ctx.beginPath();
    ctx.rect(-20, Math.min(base, edge), this.w + 40, Math.abs(base - edge));
    const crystalSpots = [];

    for (let k = 0; k <= count; k++) {
      const i = first + k;
      const cx = (i * spacing - offset + (sceneryHash(i, seed) - 0.5) * spacing * 0.5) * unit;
      const width = spacing * unit * (0.45 + sceneryHash(i, seed + 1) * 0.6);
      const len = length * unit * (0.3 + 0.7 * sceneryHash(i, seed + 2));
      const lean = (sceneryHash(i, seed + 3) - 0.5) * width * 0.5;

      ctx.moveTo(cx - width / 2, base - 4 * direction);
      ctx.quadraticCurveTo(cx - width * 0.15, base + len * 0.55 * direction, cx + lean, base + len * direction);
      ctx.quadraticCurveTo(cx + width * 0.15, base + len * 0.55 * direction, cx + width / 2, base - 4 * direction);
      ctx.closePath();

      if (crystals && sceneryHash(i, seed + 4) > 0.65) {
        const t = 0.25 + sceneryHash(i, seed + 5) * 0.3;
        crystalSpots.push([cx + lean * t + width * 0.12, base + len * t * direction, width * 0.24, i]);
      }
    }
    ctx.fillStyle = css(color);
    ctx.fill();

    // Subtle rim light along the formations.
    ctx.strokeStyle = css(NEON_VIOLET, 0.08);
    ctx.lineWidth = 1;
    ctx.stroke();

    for (const [x, y, scale, i] of crystalSpots) {
      this.drawCrystalCluster(ctx, x, y, scale, !fromTop, sceneryHash(i, seed + 6) > 0.5 ? NEON_CYAN : HOT_PINK);
    }
  }

  drawCrystalCluster(ctx, px, py, scale, pointingUp, tint) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.75 + 0.25 * Math.sin(this.model.time * 1.8 + px * 0.01);
    const r = scale * 1.6;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, css(tint, 0.3 * pulse));
    g.addColorStop(1, CLEAR);
    ctx.fillStyle = g;
    ellipsePath(ctx, px - r, py - r, r * 2, r * 2);
    ctx.fill();

    const direction = pointingUp ? -1 : 1;
    const fill = css(tint, 0.55 * pulse);
    const stroke = rgba(1, 1, 1, 0.4 * pulse);
    ctx.lineWidth = 0.6;
    for (const [angle, lengthScale] of GameRenderer.shards) {
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      const len = scale * lengthScale;
      const half = scale * 0.16;
      ctx.beginPath();
      ctx.moveTo(-half, 0);
      ctx.lineTo(-half, len * 0.7 * direction);
      ctx.lineTo(0, len * direction);
      ctx.lineTo(half, len * 0.7 * direction);
      ctx.lineTo(half, 0);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // MARK: Cave

  /** Screen-space points along the ceiling or floor. */
  edgePoints(top) {
    const m = this.model;
    const spacing = GameModel.columnSpacing;
    const points = new Array(m.columns.length);
    for (let k = 0; k < m.columns.length; k++) {
      const column = m.columns[k];
      points[k] = [this.screenX((m.firstColumnIndex + k) * spacing), this.screenY(top ? column.top : column.bottom)];
    }
    return points;
  }

  /** Smoothed path through the points (quadratic curves to the midpoints), added to the current path. */
  addSmoothPath(ctx, points, offsetY) {
    if (points.length === 0) return;
    ctx.moveTo(points[0][0], points[0][1] + offsetY);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1], cur = points[i];
      ctx.quadraticCurveTo(prev[0], prev[1] + offsetY, (prev[0] + cur[0]) / 2, (prev[1] + cur[1]) / 2 + offsetY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last[0], last[1] + offsetY);
  }

  drawCave(ctx) {
    const pad = 40;
    const unit = this._unit;
    for (const isTop of [true, false]) {
      const points = this.edgePoints(isTop);
      if (points.length === 0) continue;
      const first = points[0], last = points[points.length - 1];
      const outerY = isTop ? -pad : this.h + pad;

      ctx.beginPath();
      this.addSmoothPath(ctx, points, 0);
      ctx.lineTo(last[0], outerY);
      ctx.lineTo(first[0], outerY);
      ctx.closePath();
      const edgeY = isTop ? this.screenY(0.1) : this.screenY(0.9);
      const rock = ctx.createLinearGradient(0, edgeY, 0, outerY);
      rock.addColorStop(0, css(ROCK_LIGHT));
      rock.addColorStop(1, css(ROCK_DARK));
      ctx.fillStyle = rock;
      ctx.fill();

      // Inner strata lines for depth.
      const direction = isTop ? -1 : 1;
      ctx.lineWidth = 1.5;
      for (const [depth, opacity] of [[unit * 0.035, 0.22], [unit * 0.08, 0.12]]) {
        ctx.beginPath();
        this.addSmoothPath(ctx, points, depth * direction);
        ctx.strokeStyle = css(NEON_VIOLET, opacity);
        ctx.stroke();
      }

      // Neon rim with additive glow.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const shading = ctx.createLinearGradient(0, 0, this.w, 0);
      shading.addColorStop(0, css(NEON_CYAN));
      shading.addColorStop(0.5, css(NEON_VIOLET));
      shading.addColorStop(1, css(NEON_CYAN));
      ctx.strokeStyle = shading;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.addSmoothPath(ctx, points, 0);
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  // MARK: Obstacles

  drawObstacles(ctx) {
    const unit = this._unit, m = this.model;
    const pulse = 0.85 + 0.15 * Math.sin(m.time * 4);
    for (const o of m.obstacles) {
      const x = this.screenX(o.x), y = this.screenY(o.y), w = o.w * unit, h = o.h * unit;
      if (!(x + w > -20 && x < this.w + 20)) continue;
      const radius = Math.min(w * 0.3, 10);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = css(HOT_PINK);
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.globalAlpha = 0.18 * pulse;
      ctx.lineWidth = 16;
      ctx.stroke();
      ctx.globalAlpha = 0.35 * pulse;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();

      const body = ctx.createLinearGradient(x, y, x + w, y + h);
      body.addColorStop(0, css(HOT_PINK));
      body.addColorStop(0.5, rgba(0.55, 0.1, 0.45));
      body.addColorStop(1, css(HOT_ORANGE));
      ctx.fillStyle = body;
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.fill();

      // Glassy core and highlight strip.
      const dx = w * 0.22, dy = Math.min(8, h * 0.1);
      const ix = x + dx, iy = y + dy, iw = w - dx * 2, ih = h - dy * 2;
      const core = ctx.createLinearGradient(ix, 0, ix + iw, 0);
      core.addColorStop(0, 'rgba(255,255,255,0.35)');
      core.addColorStop(1, 'rgba(255,255,255,0.02)');
      ctx.fillStyle = core;
      roundRectPath(ctx, ix, iy, iw, ih, iw * 0.4);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.stroke();
    }
  }

  // MARK: Particles

  /** Exhaust (smoke and flame) or impact (spark and debris) particles, in spawn order. */
  drawParticles(ctx, exhaust) {
    const unit = this._unit, m = this.model;
    const hero = this.skin.id === 'hero';
    ctx.save();
    for (const p of m.particles) {
      const isExhaust = p.kind === ParticleKind.smoke || p.kind === ParticleKind.flame;
      if (isExhaust !== exhaust) continue;
      const cx = this.screenX(p.x), cy = this.screenY(p.y);
      const t = 1 - p.life / p.maxLife;

      if (hero && isExhaust) {
        // The hero has no jetpack: his flight leaves gold sparkles and faint
        // air streaks instead of fire and smoke.
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (p.kind === ParticleKind.flame) {
          const s = p.size * 0.5 * (1 - t) * unit;
          ctx.moveTo(cx - s, cy);
          ctx.lineTo(cx + s, cy);
          ctx.moveTo(cx, cy - s);
          ctx.lineTo(cx, cy + s);
          ctx.strokeStyle = css(HeroPalette.gold, 1 - t);
          ctx.lineWidth = Math.max(1, s * 0.35);
        } else {
          const length = (0.03 + t * 0.05) * unit;
          ctx.moveTo(cx - length, cy);
          ctx.lineTo(cx, cy);
          ctx.strokeStyle = rgba(1, 1, 1, (1 - t) * 0.25);
          ctx.lineWidth = 1.2;
        }
        ctx.stroke();
        continue;
      }

      switch (p.kind) {
        case ParticleKind.smoke: {
          const s = (p.size + t * 0.03 * GameModel.effectScale) * unit;
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = rgba(0.75, 0.78, 0.95, (1 - t) * 0.22);
          ellipsePath(ctx, cx - s / 2, cy - s / 2, s, s);
          ctx.fill();
          break;
        }
        case ParticleKind.flame: {
          const s = p.size * (1 - t * 0.7) * unit;
          const color = t < 0.3 ? [1, 0.95, 0.7] : t < 0.6 ? HOT_ORANGE : [0.9, 0.2, 0.3];
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = css(color, 1 - t);
          ellipsePath(ctx, cx - s / 2, cy - s / 2, s, s);
          ctx.fill();
          break;
        }
        case ParticleKind.spark: {
          const s = p.size * unit;
          ctx.globalCompositeOperation = 'lighter';
          ctx.beginPath();
          ctx.moveTo(cx - p.vx * unit * 0.03, cy - p.vy * unit * 0.03);
          ctx.lineTo(cx, cy);
          ctx.strokeStyle = rgba(1, 0.85 - t * 0.5, 0.4, 1 - t);
          ctx.lineWidth = s;
          ctx.lineCap = 'round';
          ctx.stroke();
          break;
        }
        case ParticleKind.debris: {
          const s = p.size * unit;
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.translate(cx, cy);
          ctx.rotate(p.spin * m.time);
          ctx.globalAlpha = 1 - t * t;
          ctx.fillStyle = t < 0.5 ? rgba(0.6, 0.65, 0.75) : css(HOT_ORANGE);
          roundRectPath(ctx, -s / 2, -s / 2, s, s * 0.7, 1.5);
          ctx.fill();
          ctx.restore();
          break;
        }
      }
    }
    ctx.restore();
  }

  // MARK: Player

  drawPlayer(ctx) {
    const m = this.model;
    const u = GameModel.spriteUnit * this._unit;
    const x = this.screenX(m.playerWorldX), y = this.screenY(m.playerY);
    const has3D = typeof PilotSprite3D !== 'undefined';

    if (m.controlMode === 'steer') {
      // Portrait: he climbs up the screen, so show the 3D model from behind.
      // The world here is drawn a quarter turn counterclockwise; undo that
      // locally so he stands upright on screen.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 2);
      // From behind he's only shoulder-width wide, so he's drawn larger than
      // the side view; the portrait hitbox matches this size.
      const drawn = has3D && PilotSprite3D.drawBackView(ctx, 0, 0, GameModel.backViewHeight * u, m.tilt, m.time, this.skin);
      if (!drawn) {
        // No 3D sprite available: show the flat side-view pilot climbing upward.
        ctx.rotate(-Math.PI / 2 + m.tilt);
        ctx.scale(u, u);
        drawPilot2D(ctx, this.skin, m.time, true);
      }
      ctx.restore();
      return;
    }

    // Landscape: the 3D model from the side, tilting as he climbs and dives.
    // (Falls back to the flat 2D sprite if the render isn't available.)
    if (has3D && PilotSprite3D.drawSideView(ctx, x, y, 37 * u, m.tilt, m.time, m.isThrusting, this.skin)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(m.tilt);
    ctx.scale(u, u);
    drawPilot2D(ctx, this.skin, m.time, m.isThrusting);
    ctx.restore();
  }

  // MARK: Post

  drawVignette(ctx) {
    const cx = this.w / 2, cy = this.h / 2;
    const radius = Math.hypot(this.w, this.h) / 2;
    const g = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius);
    g.addColorStop(0, CLEAR);
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }
}

/** Crystal shards: (angle, length scale). */
GameRenderer.shards = [[-0.45, 0.7], [0.0, 1.0], [0.4, 0.8]];

/** Dust motes drifting through the cave air (identical every launch). */
GameRenderer.motes = (() => {
  const generator = new SeededGenerator(7);
  const motes = [];
  for (let i = 0; i < 70; i++) {
    const x = generator.halfOpen(0, 1);
    const y = generator.halfOpen(0, 1);
    const size = generator.closed(1.0, 2.6);
    const phase = generator.halfOpen(0, TAU);
    motes.push({ x, y, size, phase });
  }
  return motes;
})();
