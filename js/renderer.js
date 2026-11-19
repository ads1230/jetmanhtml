'use strict';

// Draws a GameModel into a Canvas 2D context (port of GameRenderer.swift).
// SwiftUI's `.plusLighter` blend maps to `globalCompositeOperation = 'lighter'`.

// Fixed colors for the pilot and his effects; the cave, scenery and blocks
// take their colors from the level's theme (`model.palette`).
const NEON_CYAN = [0.31, 0.96, 1.0];
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

  /** This level's colors (blended during a level change). */
  get palette() { return this.model.palette; }

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
    // Ghost Walls fades the cave walls, flickering back as a warning before it ends.
    let wallVisibility = model.wallOpacity;
    const ghostRemaining = model.powerUpTimers.get('ghostWalls');
    if (ghostRemaining !== undefined && ghostRemaining < PowerUpTuning.ghostWallsWarning) {
      wallVisibility = Math.trunc(model.time * 10) % 2 === 0 ? 0.7 : 0.15;
    }
    this.drawCave(ctx, wallVisibility);
    this.drawObstacles(ctx);
    this.drawPickups(ctx);
    this.drawBolts(ctx);
    if (this.showsPlayer) {
      this.drawParticles(ctx, true);
      if (model.phase !== 'crashed') {
        // Blink during the grace period after the shield absorbs a hit.
        const blinking = model.invulnerableTimer > 0 && Math.trunc(model.time * 14) % 2 === 0;
        if (!blinking) this.drawPlayer(ctx);
        if (model.hasShield) this.drawShield(ctx);
      }
    }
    this.drawParticles(ctx, false);
    ctx.restore();

    this.drawVignette(ctx);
  }

  // MARK: Background

  drawBackdrop(ctx) {
    const { w, h } = this;
    const palette = this.palette;
    // Back wall: darkest at the top and bottom, faintly lit in the middle.
    const wall = ctx.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, css(palette.backEdge));
    wall.addColorStop(0.5, css(palette.backMiddle));
    wall.addColorStop(1, css(palette.backEdge));
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);

    // Scenery for the level's style; two styles crossfade during a level change.
    for (const scenery of ['cave', 'station']) {
      const weight = this.model.sceneryWeights[scenery] || 0;
      if (!(weight > 0.001)) continue;
      ctx.save();
      ctx.globalAlpha = weight;
      if (scenery === 'cave') this.drawCaveScenery(ctx);
      else this.drawStationScenery(ctx);
      ctx.restore();
    }

    // Drifting motes catching the light (dust, embers, snow or sparks).
    const m = this.model;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tile = Math.max(w, 1);
    for (const mote of GameRenderer.motes) {
      let x = (mote.x * tile - m.cameraX * this._unit * 0.5 + Math.sin(m.time * 0.4 + mote.phase) * 12) % tile;
      if (x < 0) x += tile;
      let y = (mote.y * h - m.moteDrift) % h;
      if (y < 0) y += h;
      const alpha = 0.25 + 0.2 * Math.sin(m.time * 1.5 + mote.phase);
      const s = mote.size;
      ctx.fillStyle = css(palette.mote, alpha);
      ellipsePath(ctx, x - s / 2, y - s / 2, s, s);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Rock texture, light shafts, and far and near layers of stalactites and stalagmites. */
  drawCaveScenery(ctx) {
    this.drawWallPatches(ctx);
    this.drawLightShafts(ctx);
    const { far, near } = this.palette;
    this.drawFormations(ctx, 0.15, 0.16, 0.38, true, far, 11, false);
    this.drawFormations(ctx, 0.15, 0.19, 0.34, false, far, 23, false);
    this.drawFormations(ctx, 0.35, 0.27, 0.32, true, near, 37, true);
    this.drawFormations(ctx, 0.35, 0.3, 0.3, false, near, 41, true);
  }

  // MARK: Station scenery

  /** Plated far wall, conduits, and towering superstructure with warning lights. */
  drawStationScenery(ctx) {
    this.drawStationPanels(ctx);
    this.drawStationConduits(ctx);
    this.drawStationTowers(ctx, true, 51);
    this.drawStationTowers(ctx, false, 61);
  }

  /** The far wall: a grid of plating panels, some recessed, some with lit window strips. */
  drawStationPanels(ctx) {
    const unit = this._unit, m = this.model, palette = this.palette;
    const parallax = 0.12;
    const spacing = 0.3;
    const offset = m.cameraX * parallax;
    const first = Math.floor(offset / spacing) - 1;
    const count = Math.trunc(this.w / unit / spacing) + 3;
    const rows = [0.04, 0.3, 0.5, 0.7, 0.96];
    for (let k = 0; k <= count; k++) {
      const i = first + k;
      const x = (i * spacing - offset) * unit;
      const width = spacing * unit;
      for (let row = 0; row < rows.length - 1; row++) {
        const top = this.screenY(rows[row]), bottom = this.screenY(rows[row + 1]);
        const px = x + 2, py = top + 2, pw = width - 4, ph = bottom - top - 4;
        const shade = sceneryHash(i * 7 + row, 71);
        ctx.fillStyle = css(palette.patch, 0.16 + 0.3 * shade);
        ctx.fillRect(px, py, pw, ph);
        if (shade > 0.55) {
          ctx.strokeStyle = css(palette.detail, 0.12);
          ctx.lineWidth = 1;
          ctx.strokeRect(px + pw * 0.18, py + ph * 0.22, pw * 0.64, ph * 0.56);
        }
        if (sceneryHash(i * 7 + row, 73) > 0.78) {
          const flicker = 0.7 + 0.3 * Math.sin(m.time * 1.3 + (i + row));
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = css(palette.lightB, 0.35 * flicker);
          ctx.fillRect(px + pw * 0.15, py + ph / 2 - 1.5, pw * 0.7, 3);
          ctx.restore();
        }
      }
    }
  }

  /** Two long pipes running along the station, with joints. */
  drawStationConduits(ctx) {
    const unit = this._unit, palette = this.palette;
    const parallax = 0.22;
    const spacing = 0.25;
    const offset = this.model.cameraX * parallax;
    const first = Math.floor(offset / spacing) - 1;
    const count = Math.trunc(this.w / unit / spacing) + 3;
    const thickness = 0.018 * unit;
    for (const level of [0.19, 0.81]) {
      const y = this.screenY(level);
      ctx.fillStyle = css(palette.far);
      ctx.fillRect(-10, y - thickness / 2, this.w + 20, thickness);
      ctx.fillStyle = css(palette.detail, 0.18);
      ctx.fillRect(-10, y - thickness / 2, this.w + 20, 1);
      ctx.fillStyle = css(palette.near);
      for (let k = 0; k <= count; k++) {
        const x = ((first + k) * spacing - offset) * unit;
        ctx.fillRect(x - thickness * 0.4, y - thickness, thickness * 0.8, thickness * 2);
      }
    }
  }

  /** Blocky towers and antennae from the top or bottom, with blinking lights at their tips. */
  drawStationTowers(ctx, fromTop, seed) {
    const unit = this._unit, m = this.model, palette = this.palette;
    const parallax = 0.35;
    const spacing = 0.24;
    const offset = m.cameraX * parallax;
    const first = Math.floor(offset / spacing) - 1;
    const count = Math.trunc(this.w / unit / spacing) + 3;
    const direction = fromTop ? 1 : -1;
    const base = fromTop ? this.screenY(0.04) : this.screenY(0.96);
    const edge = fromTop ? -20 : this.h + 20;
    const span = (x, width, y0, length) => {
      const y1 = y0 + length * direction;
      ctx.rect(x - width / 2, Math.min(y0, y1), width, Math.abs(y1 - y0));
    };

    ctx.beginPath();
    ctx.rect(-20, Math.min(base, edge), this.w + 40, Math.abs(base - edge));
    const tips = [];
    for (let k = 0; k <= count; k++) {
      const i = first + k;
      if (!(sceneryHash(i, seed) > 0.2)) continue;
      const cx = (i * spacing - offset + (sceneryHash(i, seed + 1) - 0.5) * spacing * 0.3) * unit;
      const width = spacing * unit * (0.35 + sceneryHash(i, seed + 2) * 0.4);
      const length = unit * (0.06 + sceneryHash(i, seed + 3) * 0.2);
      span(cx, width, base - 2 * direction, length);
      // A narrower cap on top, and sometimes an antenna.
      const capLength = length * 0.2;
      span(cx, width * 0.55, base + length * direction, capLength);
      let tip = base + (length + capLength) * direction;
      if (sceneryHash(i, seed + 4) > 0.6) {
        const mast = unit * 0.06;
        span(cx, Math.max(1.5, unit * 0.004), tip, mast);
        tip += mast * direction;
      }
      tips.push([cx, tip, i]);
    }
    ctx.fillStyle = css(palette.near);
    ctx.fill();
    ctx.strokeStyle = css(palette.detail, 0.1);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const r = Math.max(2, unit * 0.007);
    for (const [tx, ty, i] of tips) {
      if (!(sceneryHash(i, seed + 5) > 0.35)) continue;
      const blink = 0.3 + 0.7 * Math.max(0, Math.sin(m.time * 2.6 + i * 1.7));
      const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, r * 3);
      g.addColorStop(0, css(palette.lightA, 0.45 * blink));
      g.addColorStop(1, CLEAR);
      ctx.fillStyle = g;
      ellipsePath(ctx, tx - r * 3, ty - r * 3, r * 6, r * 6);
      ctx.fill();
      ctx.fillStyle = css(palette.lightA, blink);
      ellipsePath(ctx, tx - r / 2, ty - r / 2, r, r);
      ctx.fill();
    }
    ctx.restore();
  }

  // MARK: Cave scenery

  drawWallPatches(ctx) {
    const unit = this._unit;
    const parallax = 0.06;
    const spacing = 0.22;
    const offset = this.model.cameraX * parallax;
    const first = Math.floor(offset / spacing) - 1;
    const count = Math.trunc(this.w / unit / spacing) + 3;
    const tint = css(this.palette.patch, 0.5);
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
      g.addColorStop(0, css(this.palette.shaft, 0.16 * flicker));
      g.addColorStop(1, css(this.palette.shaft, 0));
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
    ctx.strokeStyle = css(this.palette.detail, 0.08);
    ctx.lineWidth = 1;
    ctx.stroke();

    for (const [x, y, scale, i] of crystalSpots) {
      this.drawCrystalCluster(ctx, x, y, scale, !fromTop,
        sceneryHash(i, seed + 6) > 0.5 ? this.palette.lightA : this.palette.lightB);
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

  /** The ceiling and floor; `visibility` fades them (Ghost Walls). */
  drawCave(ctx, visibility = 1) {
    if (!(visibility > 0.001)) return;
    const pad = 40;
    const unit = this._unit, m = this.model, palette = this.palette;
    const caveWeight = m.sceneryWeights.cave || 0;
    const stationWeight = m.sceneryWeights.station || 0;
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
      rock.addColorStop(0, css(palette.wallLight));
      rock.addColorStop(1, css(palette.wallDark));
      ctx.save();
      ctx.globalAlpha = visibility;
      ctx.fillStyle = rock;
      ctx.fill();

      // Inner strata lines for depth (cave levels)...
      const direction = isTop ? -1 : 1;
      if (caveWeight > 0.001) {
        ctx.lineWidth = 1.5;
        for (const [depth, opacity] of [[unit * 0.035, 0.22], [unit * 0.08, 0.12]]) {
          ctx.beginPath();
          this.addSmoothPath(ctx, points, depth * direction);
          ctx.strokeStyle = css(palette.detail, opacity * caveWeight);
          ctx.stroke();
        }
      }
      // ...or hull plating seams and a strip of running lights (station).
      if (stationWeight > 0.001) {
        ctx.beginPath();
        points.forEach((point, k) => {
          if ((m.firstColumnIndex + k) % 3 !== 0) return;
          ctx.moveTo(point[0], point[1]);
          ctx.lineTo(point[0], outerY);
        });
        ctx.strokeStyle = css(palette.detail, 0.22 * stationWeight);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.beginPath();
        this.addSmoothPath(ctx, points, unit * 0.03 * direction);
        ctx.strokeStyle = css(palette.detail, 0.3 * stationWeight);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const dash = unit * 0.02;
        ctx.setLineDash([dash, dash * 1.6]);
        ctx.lineDashOffset = m.cameraX * unit;
        ctx.beginPath();
        this.addSmoothPath(ctx, points, unit * 0.055 * direction);
        ctx.strokeStyle = css(palette.rimB, 0.5 * stationWeight);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // Neon rim with additive glow.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const shading = ctx.createLinearGradient(0, 0, this.w, 0);
      shading.addColorStop(0, css(palette.rimA));
      shading.addColorStop(0.5, css(palette.rimB));
      shading.addColorStop(1, css(palette.rimA));
      ctx.strokeStyle = shading;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      this.addSmoothPath(ctx, points, 0);
      ctx.globalAlpha = 0.12 * visibility;
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.globalAlpha = 0.3 * visibility;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.globalAlpha = visibility;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  // MARK: Obstacles

  drawObstacles(ctx) {
    const unit = this._unit, m = this.model, palette = this.palette;
    const pulse = 0.85 + 0.15 * Math.sin(m.time * 4);
    const caveWeight = m.sceneryWeights.cave || 0;
    const stationWeight = m.sceneryWeights.station || 0;
    for (const obstacle of m.obstacles) {
      const o = m.effectiveRect(obstacle);
      const x = this.screenX(o.x), y = this.screenY(o.y), w = o.w * unit, h = o.h * unit;
      if (!(x + w > -20 && x < this.w + 20)) continue;
      const radius = Math.min(w * 0.3, 10);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = css(palette.blockGlow);
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.globalAlpha = 0.18 * pulse;
      ctx.lineWidth = 16;
      ctx.stroke();
      ctx.globalAlpha = 0.35 * pulse;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.restore();

      const body = ctx.createLinearGradient(x, y, x + w, y + h);
      body.addColorStop(0, css(palette.blockA));
      body.addColorStop(0.5, css(palette.blockB));
      body.addColorStop(1, css(palette.blockC));
      ctx.fillStyle = body;
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.fill();

      // Glassy core and highlight strip (cave levels).
      if (caveWeight > 0.001) {
        const dx = w * 0.22, dy = Math.min(8, h * 0.1);
        const ix = x + dx, iy = y + dy, iw = w - dx * 2, ih = h - dy * 2;
        const core = ctx.createLinearGradient(ix, 0, ix + iw, 0);
        core.addColorStop(0, rgba(1, 1, 1, 0.35 * caveWeight));
        core.addColorStop(1, rgba(1, 1, 1, 0.02 * caveWeight));
        ctx.fillStyle = core;
        roundRectPath(ctx, ix, iy, iw, ih, iw * 0.4);
        ctx.fill();
      }
      // Armoured plating with dark bands and a warning light (station).
      if (stationWeight > 0.001) {
        const band = h * 0.08;
        ctx.fillStyle = rgba(0, 0, 0, 0.35 * stationWeight);
        for (const by of [y + h * 0.18, y + h - h * 0.18 - band]) ctx.fillRect(x + 2, by, w - 4, band);
        const r = Math.min(w * 0.14, 5);
        const lx = x + w / 2, ly = y + h / 2;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = stationWeight * pulse;
        const halo = ctx.createRadialGradient(lx, ly, 0, lx, ly, r * 2.5);
        halo.addColorStop(0, css(palette.lightA, 0.6));
        halo.addColorStop(1, CLEAR);
        ctx.fillStyle = halo;
        ellipsePath(ctx, lx - r * 2.5, ly - r * 2.5, r * 5, r * 5);
        ctx.fill();
        ctx.fillStyle = css(palette.lightA);
        ellipsePath(ctx, lx - r / 2, ly - r / 2, r, r);
        ctx.fill();
        ctx.restore();
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1.2;
      roundRectPath(ctx, x, y, w, h, radius);
      ctx.stroke();
    }
  }

  // MARK: Power-ups

  /** Glowing orbs with an icon, bobbing gently in the cave. */
  drawPickups(ctx) {
    const m = this.model;
    const r = PowerUpTuning.radius * this._unit;
    m.pickups.forEach((pickup, index) => {
      const bob = Math.sin(m.time * 3 + index) * r * 0.15;
      const cx = this.screenX(pickup.x), cy = this.screenY(pickup.y) + bob;
      if (!(cx > -r * 3 && cx < this.w + r * 3)) return;
      const kind = PowerUpKind[pickup.kind];
      const color = kind.color;
      const pulse = 0.8 + 0.2 * Math.sin(m.time * 5 + index);

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.2);
      glow.addColorStop(0, css(color, 0.45 * pulse));
      glow.addColorStop(1, CLEAR);
      ctx.fillStyle = glow;
      ellipsePath(ctx, cx - r * 2.2, cy - r * 2.2, r * 4.4, r * 4.4);
      ctx.fill();
      ctx.restore();

      const orb = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx - r * 0.3, cy - r * 0.3, r * 1.3);
      orb.addColorStop(0, css(color, 0.95));
      orb.addColorStop(1, css(color, 0.35));
      ctx.fillStyle = orb;
      ellipsePath(ctx, cx - r, cy - r, r * 2, r * 2);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(1, 1, 1, 0.8 * pulse);
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.stroke();
      ctx.restore();

      // Icon, kept upright on screen in portrait (where the world is rotated).
      ctx.save();
      ctx.translate(cx, cy);
      if (m.controlMode === 'steer') ctx.rotate(Math.PI / 2);
      if (kind.icon) {
        drawPowerUpIcon(ctx, kind.icon, r * 1.1, '#fff');
      } else {
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${r * 0.95}px ${GameRenderer.roundedFont}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×2', 0, r * 0.04);
      }
      ctx.restore();
    });
  }

  /** Ray Gun bolts: short glowing streaks flying forward. */
  drawBolts(ctx) {
    const m = this.model;
    if (m.bolts.length === 0) return;
    const unit = this._unit;
    const color = PowerUpKind.rayGun.color;
    const length = 0.07 * unit;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const strokes = [[css(color, 0.35), Math.max(6, unit * 0.022)], [css(color), Math.max(3, unit * 0.01)],
      ['#fff', Math.max(1, unit * 0.004)]];
    for (const bolt of m.bolts) {
      const hx = this.screenX(bolt.x), hy = this.screenY(bolt.y);
      for (const [style, width] of strokes) {
        ctx.beginPath();
        ctx.moveTo(hx - length, hy);
        ctx.lineTo(hx, hy);
        ctx.strokeStyle = style;
        ctx.lineWidth = width;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** A glowing bubble around the pilot while the shield is up. */
  drawShield(ctx) {
    const m = this.model;
    const u = GameModel.spriteUnit * this._unit;
    const radius = (m.controlMode === 'steer' ? 32 : 25) * u;
    const cx = this.screenX(m.playerWorldX), cy = this.screenY(m.playerY);
    const pulse = 0.75 + 0.25 * Math.sin(m.time * 6);
    const color = PowerUpKind.shield.color;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fill = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    fill.addColorStop(0, CLEAR);
    fill.addColorStop(0.5, css(color, 0.08));
    fill.addColorStop(1, css(color, 0.3 * pulse));
    ctx.fillStyle = fill;
    ellipsePath(ctx, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.fill();
    ctx.strokeStyle = css(color, 0.9 * pulse);
    ctx.lineWidth = Math.max(1.5, radius * 0.06);
    ctx.stroke();
    ctx.strokeStyle = css(color, 0.25);
    ctx.lineWidth = Math.max(4, radius * 0.2);
    ctx.stroke();
    ctx.restore();
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

/** SwiftUI's rounded system font, for the "×2" pickup label. */
GameRenderer.roundedFont = 'ui-rounded, "SF Pro Rounded", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

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
