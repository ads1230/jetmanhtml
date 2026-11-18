'use strict';

// The game simulation (port of GameModel.swift). All positions are in
// normalized "world" units where the playfield height is 1 and the visible
// width equals `aspect`. Pure math: stepped once per frame by the app.

/** Visual effect particle kinds. */
const ParticleKind = { flame: 'flame', smoke: 'smoke', spark: 'spark', debris: 'debris' };

class GameModel {
  constructor() {
    this.phase = 'ready'; // 'ready' | 'playing' | 'crashed'
    this.aspect = 1.6;
    /**
     * The pilot's distance from the left edge of the view, in world units.
     * Eased (not snapped) during a run so a view that changes shape doesn't
     * teleport the pilot into a wall.
     */
    this.playerOffset = 1.6 * GameModel.playerScreenFraction;
    this.cameraX = 0;
    this.distance = 0;
    this.playerY = 0.5;
    this.velocity = 0;
    /** Seconds remaining on the jetpack's visible flame after a flap. */
    this.flameTimer = 0;
    /** Vertical slices of the cave: { top, bottom }. */
    this.columns = [];
    this.firstColumnIndex = 0;
    /** Floating blocks: { x, y, w, h }. */
    this.obstacles = [];
    this.particles = [];
    this.time = 0;
    this.crashTime = 0;
    this.shake = 0;
    this.best = Math.max(0, Math.trunc(Number(Store.get(GameModel.bestKey, 0)) || 0));
    this.isNewBest = false;
    /** Increments on every crash, so observers can react once per finished run. */
    this.crashCount = 0;
    /** Increments on every flap, so the view can play a sound / haptic per flap. */
    this.flapCount = 0;

    /** Chosen in Settings; scales speed and the lane beside each block. */
    this.difficultyLevel = Difficulty.normal;
    /** 'flap' (landscape, tap to flap) or 'steer' (portrait, hold a side to steer). */
    this.controlMode = 'flap';
    /** -1 steering left (toward the top wall in world space), 0 straight, 1 right. */
    this.steerDirection = 0;

    this.lastTime = null;
    this.nextObstacleX = Infinity;
    this.calmUntilX = Infinity;
    this.caveCenter = 0.5;
    this.caveDrift = 0;

    this.reset();
  }

  // MARK: Derived values

  get playerScreenX() { return this.playerOffset; }
  get playerWorldX() { return this.cameraX + this.playerOffset; }
  /** Climbs ~30 points per second, like the original's counter. */
  get score() { return Math.trunc(this.distance * 28); }
  /**
   * 0 at the start of a run, ramping to 1 after ~1.5 minutes. Only makes the
   * tunnel wind more; speed and spacing stay constant like the original.
   */
  get difficulty() { return Math.min(this.distance / 100, 1); }
  get isThrusting() { return this.flameTimer > 0; }

  /** Nose-up right after a flap, diving nose-down as the fall speeds up. */
  get tilt() {
    if (this.controlMode === 'flap') return Math.max(-0.4, Math.min(0.6, this.velocity * 0.55));
    // Steering: bank gently toward the side he's moving to.
    return this.velocity * 0.35;
  }

  /** Forward speed for the current mode, in playfield units per second. */
  get forwardSpeed() {
    const base = this.controlMode === 'steer'
      ? GameModel.scrollSpeed * GameModel.steerForwardSpeedMultiplier
      : GameModel.scrollSpeed;
    return base * this.difficultyLevel.speedMultiplier;
  }

  get timeSinceCrash() { return this.time - this.crashTime; }
  get canRestart() { return this.phase === 'crashed' && this.timeSinceCrash > 0.7; }

  // MARK: Control modes

  /** Switches control mode, starting over at "Get Ready" if it changed (e.g. the device rotated mid-run). */
  setControlMode(mode) {
    if (mode === this.controlMode) return;
    this.controlMode = mode;
    this.steerDirection = 0;
    this.reset();
  }

  /** Steering input for 'steer' mode. Pressing a side also starts or restarts a run, like a flap does in landscape. */
  steer(direction) {
    this.steerDirection = direction;
    if (direction === 0) return;
    if (this.phase === 'ready') {
      this.startRun();
    } else if (this.phase === 'crashed' && this.canRestart) {
      this.reset();
      this.startRun();
      this.steerDirection = direction;
    }
  }

  // MARK: Input

  /** A tap/click/key press: one jetpack burst, Flappy Bird style. */
  flap() {
    // In steering mode a flap key just starts or restarts the run.
    if (this.controlMode === 'steer') {
      if (this.phase === 'ready') {
        this.startRun();
      } else if (this.phase === 'crashed' && this.canRestart) {
        this.reset();
        this.startRun();
      }
      return;
    }
    switch (this.phase) {
      case 'ready':
        this.startRun();
        this.applyFlap();
        break;
      case 'crashed':
        if (this.canRestart) {
          this.reset();
          this.startRun();
          this.applyFlap();
        }
        break;
      case 'playing':
        this.applyFlap();
        break;
    }
  }

  applyFlap() {
    this.flapCount += 1;
    // Like Flappy Bird, a flap replaces the current velocity outright.
    this.velocity = -GameModel.flapVelocity;
    this.flameTimer = 0.16;
    this.emitBurst();
  }

  // MARK: Lifecycle

  /** Clears the saved best score (Settings → Reset Scores). */
  resetBest() {
    this.best = 0;
    this.isNewBest = false;
    Store.remove(GameModel.bestKey);
  }

  /** Returns to the ready state with a fresh cave (menu and "Play Again"). */
  resetToReady() {
    this.reset();
  }

  reset() {
    this.phase = 'ready';
    this.cameraX = 0;
    this.distance = 0;
    this.playerY = 0.5;
    this.velocity = 0;
    this.flameTimer = 0;
    this.columns = [];
    this.firstColumnIndex = 0;
    this.obstacles = [];
    this.caveCenter = 0.5;
    this.caveDrift = 0;
    this.calmUntilX = Infinity;
    this.nextObstacleX = Infinity;
    this.isNewBest = false;
    this.ensureColumns();
  }

  startRun() {
    this.phase = 'playing';
    this.distance = 0;
    // Columns already generated stay calm; give a little more calm cave
    // before the walls start winding.
    this.calmUntilX = this.cameraX + this.aspect + 0.5;
    this.nextObstacleX = this.cameraX + this.aspect + 0.3;
  }

  crash() {
    this.phase = 'crashed';
    this.crashTime = this.time;
    this.crashCount += 1;
    this.shake = 1;
    this.flameTimer = 0;
    const cx = this.playerWorldX, cy = this.playerY;
    for (let i = 0; i < 70; i++) {
      const angle = random(0, TAU);
      const power = random(0.2, 1.3);
      this.particles.push({
        x: cx, y: cy, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power,
        life: random(0.4, 1.1), maxLife: 1.1, size: random(0.004, 0.009), kind: ParticleKind.spark, spin: 0,
      });
    }
    for (let i = 0; i < 14; i++) {
      const angle = random(0, TAU);
      const power = random(0.2, 0.7);
      this.particles.push({
        x: cx, y: cy, vx: Math.cos(angle) * power, vy: Math.sin(angle) * power - 0.4,
        life: random(0.9, 1.6), maxLife: 1.6, size: random(0.008, 0.016), kind: ParticleKind.debris,
        spin: random(-12, 12),
      });
    }
    for (let i = 0; i < 18; i++) {
      this.particles.push({
        x: cx + random(-0.02, 0.02), y: cy + random(-0.02, 0.02), vx: random(-0.15, 0.15), vy: random(-0.2, 0.05),
        life: random(0.8, 1.5), maxLife: 1.5, size: random(0.02, 0.04), kind: ParticleKind.smoke, spin: 0,
      });
    }
    if (this.score > this.best) {
      this.best = this.score;
      this.isNewBest = true;
      Store.set(GameModel.bestKey, this.best);
    }
  }

  // MARK: Simulation

  /** Advances the simulation to `now` (seconds). Safe to call multiple times per frame. */
  update(now, newAspect) {
    this.aspect = Math.max(GameModel.minimumAspect, newAspect);
    const targetOffset = this.aspect * GameModel.playerScreenFraction;
    if (this.lastTime === null) {
      this.lastTime = now;
      this.ensureColumns();
      return;
    }
    const dt = Math.min(Math.max(now - this.lastTime, 0), 1 / 30);
    this.lastTime = now;
    if (!(dt > 0)) return;
    this.time += dt;

    // Glide to the new position when the view changes shape mid-run; snap otherwise.
    if (this.phase === 'playing') {
      this.playerOffset += (targetOffset - this.playerOffset) * Math.min(1, dt * 2.5);
    } else {
      this.playerOffset = targetOffset;
    }

    if (this.phase === 'ready') {
      this.cameraX += this.forwardSpeed * dt;
      this.playerY = 0.5 + Math.sin(this.time * 2.4) * 0.025;
      this.velocity = Math.cos(this.time * 2.4) * 0.06;
      this.flameTimer = 0.1;
      this.ensureColumns();
      this.emitExhaust(dt);
    } else if (this.phase === 'playing') {
      this.cameraX += this.forwardSpeed * dt;
      this.distance += this.forwardSpeed * dt;

      if (this.controlMode === 'flap') {
        this.velocity = Math.min(GameModel.maxFall, this.velocity + GameModel.gravity * dt);
        this.flameTimer = Math.max(0, this.flameTimer - dt);
      } else {
        // Constant climb with no gravity; sideways at a constant speed while
        // a side is held. The jetpack burns steadily.
        this.velocity = this.steerDirection * GameModel.steerSpeed;
        this.flameTimer = 0.1;
      }
      this.playerY += this.velocity * dt;

      this.ensureColumns();
      this.spawnObstacles();
      const cutoff = this.cameraX - 0.2;
      this.obstacles = this.obstacles.filter((o) => o.x + o.w >= cutoff);
      this.emitExhaust(dt);

      if (this.collides()) this.crash();
    }

    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.updateParticles(dt);
  }

  // MARK: Cave generation

  ensureColumns() {
    const spacing = GameModel.columnSpacing;
    while ((this.firstColumnIndex + this.columns.length) * spacing < this.cameraX + this.aspect + 0.6) {
      const x = (this.firstColumnIndex + this.columns.length) * spacing;
      this.columns.push(this.generateColumn(x));
    }
    let drop = 0;
    while (this.columns.length - drop > 2 && (this.firstColumnIndex + 1) * spacing < this.cameraX - spacing * 2) {
      drop += 1;
      this.firstColumnIndex += 1;
    }
    if (drop > 0) this.columns.splice(0, drop);
  }

  generateColumn(x) {
    const d = this.difficulty;
    const gap = GameModel.caveGap;
    if (x > this.calmUntilX) {
      // Random-walk the cave's center line for a winding tunnel.
      const maxDrift = 0.004 + 0.003 * d;
      this.caveDrift += random(-0.002, 0.002) * (1 + d);
      this.caveDrift = Math.max(-maxDrift, Math.min(maxDrift, this.caveDrift));
      this.caveCenter += this.caveDrift;
    } else {
      // Ease back toward the middle while calm.
      this.caveCenter += (0.5 - this.caveCenter) * 0.08;
      this.caveDrift *= 0.8;
    }
    const margin = 0.035;
    const lo = margin + gap / 2;
    const hi = 1 - margin - gap / 2;
    if (this.caveCenter < lo) { this.caveCenter = lo; this.caveDrift = Math.abs(this.caveDrift); }
    if (this.caveCenter > hi) { this.caveCenter = hi; this.caveDrift = -Math.abs(this.caveDrift); }

    const rough = 0.01;
    return {
      top: this.caveCenter - gap / 2 + random(-rough, rough),
      bottom: this.caveCenter + gap / 2 + random(-rough, rough),
    };
  }

  /** Interpolated ceiling/floor at a world x position: [top, bottom]. */
  caveBounds(x) {
    const cols = this.columns;
    if (cols.length === 0) return [0, 1];
    const f = x / GameModel.columnSpacing - this.firstColumnIndex;
    const i = Math.max(0, Math.min(cols.length - 1, Math.floor(f)));
    const j = Math.min(cols.length - 1, i + 1);
    const t = Math.max(0, Math.min(1, f - i));
    const a = cols[i], b = cols[j];
    return [a.top + (b.top - a.top) * t, a.bottom + (b.bottom - a.bottom) * t];
  }

  spawnObstacles() {
    while (this.nextObstacleX < this.cameraX + this.aspect + 0.3) {
      const width = GameModel.obstacleWidth;
      // The walls can slope across the block's width, so fit it inside the
      // narrowest part of the tunnel it spans, plus a margin so it never
      // touches the glowing rim.
      let top = -Infinity;
      let bottom = Infinity;
      for (let x = this.nextObstacleX; x <= this.nextObstacleX + width + GameModel.columnSpacing;
        x += GameModel.columnSpacing / 2) {
        const b = this.caveBounds(Math.min(x, this.nextObstacleX + width));
        top = Math.max(top, b[0]);
        bottom = Math.min(bottom, b[1]);
      }
      const margin = 0.04;
      const innerTop = top + margin;
      const innerBottom = bottom - margin;
      const span = innerBottom - innerTop;
      // Lane beside the obstacle is a little wider for the first few blocks
      // to ease the player in.
      const lane = GameModel.laneClearance + this.difficultyLevel.laneBonus +
        0.06 * (1 - Math.min(this.distance / (GameModel.obstacleSpacing * 4), 1));
      const preferred = Math.random() < 0.1 ? GameModel.tallObstacleHeight : GameModel.obstacleHeight;
      const height = Math.min(preferred, span - lane);
      // Skip slots already inside the view (only happens right after the
      // view widens) so blocks never pop in.
      if (height > 0.06 && this.nextObstacleX > this.cameraX + this.aspect) {
        // Floating block with at least `lane` clear above or below it.
        const offset = random(lane, Math.max(lane, span - height));
        const y = Math.random() < 0.5 ? innerTop + offset : innerBottom - offset - height;
        this.obstacles.push({ x: this.nextObstacleX, y, w: width, h: height });
      }
      this.nextObstacleX += GameModel.obstacleSpacing;
    }
  }

  // MARK: Collision

  /** World-space position of a point given in the pilot's sprite units. */
  worldPoint(lx, ly) {
    const tilt = this.tilt;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const u = GameModel.spriteUnit;
    return [this.playerWorldX + (lx * c - ly * s) * u, this.playerY + (lx * s + ly * c) * u];
  }

  /** Tests the tilted body capsule by sampling circles along its length. */
  collides() {
    const steering = this.controlMode === 'steer';
    const start = steering ? GameModel.backHitboxStart : GameModel.hitboxStart;
    const end = steering ? GameModel.backHitboxEnd : GameModel.hitboxEnd;
    const a = this.worldPoint(start[0], start[1]);
    const b = this.worldPoint(end[0], end[1]);
    const r = (steering ? GameModel.backHitboxRadius : GameModel.hitboxRadius) * GameModel.spriteUnit;
    const samples = 8;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;

      const bounds = this.caveBounds(x);
      if (y - r < bounds[0] || y + r > bounds[1]) return true;
      for (const o of this.obstacles) {
        const cx = Math.max(o.x, Math.min(x, o.x + o.w));
        const cy = Math.max(o.y, Math.min(y, o.y + o.h));
        if (Math.hypot(x - cx, y - cy) < r) return true;
      }
    }
    return false;
  }

  // MARK: Particles

  /** World-space position of the jetpack nozzle. */
  nozzlePosition() {
    // Side view (landscape): the nozzle is on his back (top of the sprite), a
    // little toward his feet. Back view (portrait): it's centered, just below
    // his middle.
    return this.controlMode === 'steer' ? this.worldPoint(-9, 0) : this.worldPoint(-8, -7);
  }

  spawnFlame(lo, hi) {
    const p = this.nozzlePosition();
    const tilt = this.tilt, c = Math.cos(tilt), s = Math.sin(tilt);
    const dx = -random(lo, hi), dy = random(0, 0.25);
    this.particles.push({
      x: p[0], y: p[1], vx: dx * c - dy * s, vy: dx * s + dy * c,
      life: random(0.1, 0.24), maxLife: 0.24, size: random(0.008, 0.015) * GameModel.effectScale,
      kind: ParticleKind.flame, spin: 0,
    });
  }

  spawnSmoke(lo, hi) {
    const p = this.nozzlePosition();
    const tilt = this.tilt, c = Math.cos(tilt), s = Math.sin(tilt);
    const dx = -random(lo, hi), dy = random(-0.03, 0.08);
    this.particles.push({
      x: p[0], y: p[1], vx: dx * c - dy * s, vy: dx * s + dy * c,
      life: random(0.6, 1.1), maxLife: 1.1, size: random(0.006, 0.011) * GameModel.effectScale,
      kind: ParticleKind.smoke, spin: 0,
    });
  }

  /** A puff of fire and smoke for each flap. */
  emitBurst() {
    for (let i = 0; i < 26; i++) this.spawnFlame(0.2, 0.55);
    for (let i = 0; i < 12; i++) this.spawnSmoke(0.05, 0.25);
  }

  /** Continuous exhaust: a pilot flame while the burst is live, plus a faint smoke trail. */
  emitExhaust(dt) {
    const flames = GameModel.count(this.isThrusting ? 90 : 0, dt);
    for (let i = 0; i < flames; i++) this.spawnFlame(0.15, 0.35);
    const smoke = GameModel.count(16, dt);
    for (let i = 0; i < smoke; i++) this.spawnSmoke(0.03, 0.12);
  }

  /** Converts an emission rate to a whole particle count for this frame. */
  static count(rate, dt) {
    const exact = rate * dt;
    return Math.trunc(exact) + (Math.random() < exact % 1 ? 1 : 0);
  }

  updateParticles(dt) {
    const ps = this.particles;
    let kept = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === ParticleKind.spark || p.kind === ParticleKind.debris) {
        p.vy += 1.8 * dt;
        p.vx *= 0.99;
      } else if (p.kind === ParticleKind.smoke) {
        p.vx *= 0.97;
        p.vy = p.vy * 0.97 - 0.05 * dt;
      }
      p.life -= dt;
      if (p.life > 0) ps[kept++] = p;
    }
    ps.length = kept;
    if (ps.length > 900) ps.splice(0, ps.length - 900);
  }
}

// MARK: Tunables

// Vertical physics mirror flappybird.io (world 2 units tall: gravity 5,
// flap 1.55, fall cap 2.2), converted to a playfield height of 1.
GameModel.columnSpacing = 0.04;
GameModel.gravity = 2.5;
GameModel.flapVelocity = 0.775;
GameModel.maxFall = 1.1;

// Layout and pace mirror the original Jetman, measured from gameplay footage
// in multiples of its cave opening (ceiling to floor).
/** Open height of the cave; constant, like the original. */
GameModel.caveGap = 0.72;
/** Original scrolls ~1.5 cave heights per second, at a constant speed. */
GameModel.scrollSpeed = 1.5 * GameModel.caveGap;
/** Original blocks are evenly spaced ~1.62 cave heights apart (~1.1 s). */
GameModel.obstacleSpacing = 1.62 * GameModel.caveGap;
/** Original blocks are ~0.13 x 0.33 cave heights, occasionally ~0.5 tall. */
GameModel.obstacleWidth = 0.13 * GameModel.caveGap;
GameModel.obstacleHeight = 0.33 * GameModel.caveGap;
GameModel.tallObstacleHeight = 0.5 * GameModel.caveGap;
/** Minimum open lane beside an obstacle so every block is passable. */
GameModel.laneClearance = 0.25;
/**
 * Size of one player-drawing unit in world units (the sprite is ~32 units
 * wide). Sized to match the original Jetman, who is ~31% of the cave opening
 * long and ~12% tall.
 */
GameModel.spriteUnit = 1.0 / 160.0;
/** Exhaust particles scale with the sprite (they were tuned at 1/400). */
GameModel.effectScale = 2.2;

/**
 * Collision capsule along the pilot's body, in sprite units: a segment from
 * the boots to the helmet with a rounded radius (slightly inside the drawn
 * outline so grazes feel fair). It tilts with the pilot.
 */
GameModel.hitboxStart = [-16, -2];
GameModel.hitboxEnd = [13, -3];
GameModel.hitboxRadius = 5.5;

/**
 * Portrait (back view) collision capsule. Seen from behind he's
 * shoulder-width wide across the cave and drawn `backViewHeight` tall, so the
 * capsule is much wider than the side-view one and runs almost his full height.
 */
GameModel.backViewHeight = 54.0;
GameModel.backHitboxStart = [-15, 0];
GameModel.backHitboxEnd = [14, 0];
GameModel.backHitboxRadius = 10.0;

/** Narrowest playfield shape before the view letterboxes (1 = square). */
GameModel.minimumAspect = 1.0;
/** Where the pilot sits across the view, as a fraction of its width. */
GameModel.playerScreenFraction = 0.28;

/** Sideways speed while steering, in playfield units per second. */
GameModel.steerSpeed = 0.75;
/**
 * Portrait climbs a little faster than landscape scrolls, since steering
 * sideways is easier than flapping against gravity: 1.3 playfield units per
 * second on Normal (landscape Normal is 1.08).
 */
GameModel.steerForwardSpeed = 1.3;
GameModel.steerForwardSpeedMultiplier = GameModel.steerForwardSpeed / GameModel.scrollSpeed;

GameModel.bestKey = 'jetman.best';
