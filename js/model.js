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
    /**
     * 'flap' (landscape: tap to flap against gravity), 'steer' (portrait: the
     * world is shown rotated so the pilot climbs at a constant speed; hold
     * left or right to steer) or 'glide' (landscape with portrait-style
     * controls: no gravity; move up or down at a constant speed).
     */
    this.controlMode = 'flap';
    /** -1 steering left (toward the top wall in world space), 0 straight, 1 right. */
    this.steerDirection = 0;
    /** When swipe steering lapses back to straight if no new input arrives (model time), or null. */
    this.steerExpiry = null;
    /** Scales the sideways speed for the current input (swipes move faster). */
    this.steerSpeedScale = 1;

    // Power-up state.
    /** Power-ups floating in the cave: { x, y, kind }. */
    this.pickups = [];
    this.hasShield = false;
    /** Seconds of invulnerability left after the shield absorbs a hit. */
    this.invulnerableTimer = 0;
    /** Seconds left for each timed power-up in effect, by kind. */
    this.powerUpTimers = new Map();
    /** 1 = normal blocks; eases toward `miniBlockScale` during Mini Blocks. */
    this.blockScale = 1;
    /** 1 = normal speed; eases toward `slowMotionScale` during Slow-Mo. */
    this.timeScale = 1;
    /** Increments on every pickup / shield break, so the view can play sounds and haptics. */
    this.pickupCount = 0;
    this.shieldBreakCount = 0;
    /** Ray Gun bolts in flight: { x, y }. */
    this.bolts = [];
    /** Increments on every Ray Gun shot and every block it destroys. */
    this.shotCount = 0;
    this.blastCount = 0;
    /** 1 = walls fully visible; eases toward faint while Ghost Walls is active. */
    this.wallOpacity = 1;
    this.fireCooldown = 0;
    this.points = 0;
    this.blocksUntilPickup = blocksUntilNextPickup();

    // Speed ramp and levels.
    /** Speed notches gained this run; each makes the cave `LevelTuning.notchStep` faster. */
    this.speedNotch = 0;
    /** Seconds played toward the next notch. */
    this.notchProgress = 0;
    /** Speed multiplier from the notches, eased so changes don't jolt. */
    this.rampScale = LevelTuning.startSpeed;
    /** Increments each time a Brake is collected, for the HUD. */
    this.brakeCount = 0;
    /** Current level (its look comes from `LevelTheme.forLevel`). */
    this.level = 0;
    this.previousLevel = 0;
    this.levelChangeTime = -Infinity;
    /** This frame's level look, crossfading after a level change. */
    this.palette = LevelTheme.forLevel(0);
    /** How much of each scenery style to draw (they crossfade too): { cave, station }. */
    this.sceneryWeights = { cave: 1, station: 0 };
    /** Accumulated mote drift in points, so changing speed doesn't make them jump. */
    this.moteDrift = 0;

    this.lastTime = null;
    this.nextObstacleX = Infinity;
    this.calmUntilX = Infinity;
    /** No new blocks (and a straight cave) until this time: the level-change run-in. */
    this.obstacleHoldUntil = -Infinity;

    // Pause.
    /** Frozen mid-run (pause button, or the page losing focus). */
    this.isPaused = false;
    /** Seconds left on the countdown after Resume (null when not counting); play stays frozen until it ends. */
    this.resumeCountdown = null;
    this.caveCenter = 0.5;
    this.caveDrift = 0;

    this.reset();
  }

  // MARK: Derived values

  get playerScreenX() { return this.playerOffset; }
  get playerWorldX() { return this.cameraX + this.playerOffset; }
  /** Climbs ~30 points per second, like the original's counter (twice as fast with Double Score). */
  get score() { return Math.trunc(this.points); }

  // MARK: Power-ups

  isActive(kind) {
    return kind === 'shield' ? this.hasShield : (this.powerUpTimers.get(kind) || 0) > 0;
  }

  /** Power-ups in effect, for the HUD: { kind, secondsLeft } (seconds rounded up; null for the shield). */
  get activePowerUps() {
    const active = [];
    for (const kind of POWER_UP_IDS) {
      if (kind === 'shield') {
        if (this.hasShield) active.push({ kind, secondsLeft: null });
        continue;
      }
      const remaining = this.powerUpTimers.get(kind);
      if (remaining > 0) active.push({ kind, secondsLeft: Math.ceil(remaining) });
    }
    return active;
  }

  /** An obstacle's rect as currently drawn and collided with (shrunk by Mini Blocks): { x, y, w, h }. */
  effectiveRect(o) {
    const w = o.w * (0.5 + 0.5 * this.blockScale);
    const h = o.h * this.blockScale;
    return { x: o.x + o.w / 2 - w / 2, y: o.y + o.h / 2 - h / 2, w, h };
  }
  /**
   * 0 at the start of a run, ramping to 1 after ~1.5 minutes. Only makes the
   * tunnel wind more; speed and spacing stay constant like the original.
   */
  get difficulty() { return Math.min(this.distance / 100, 1); }
  get isThrusting() { return this.flameTimer > 0; }

  /** Nose-up right after a flap, diving nose-down as the fall speeds up. */
  get tilt() {
    if (this.controlMode === 'flap') return Math.max(-0.4, Math.min(0.6, this.velocity * 0.55));
    // Gliding: a slight pitch toward the way he's moving. Steering: bank
    // gently toward the side he's moving to.
    return this.velocity * 0.35;
  }

  /** Steering controls (portrait or landscape glide) rather than flapping. */
  get usesSteering() { return this.controlMode !== 'flap'; }

  /** Forward speed for the current mode, in playfield units per second. */
  get forwardSpeed() {
    const base = this.controlMode === 'steer' ? GameModel.steerForwardSpeed
      : this.controlMode === 'glide' ? GameModel.glideForwardSpeed
        : GameModel.scrollSpeed;
    return base * this.difficultyLevel.speedMultiplier * this.timeScale * this.rampScale;
  }

  // MARK: Speed ramp and levels

  /** Adds a notch every few seconds of play and eases toward its speed. */
  updateSpeedRamp(dt) {
    if (this.speedNotch < LevelTuning.maxNotches) {
      this.notchProgress += dt * this.timeScale;
      if (this.notchProgress >= LevelTuning.secondsPerNotch) {
        this.notchProgress = 0;
        this.speedNotch += 1;
      }
    }
    const target = LevelTuning.startSpeed * (1 + this.speedNotch * LevelTuning.notchStep);
    this.rampScale += (target - this.rampScale) * Math.min(1, dt * 1.5);
  }

  /** Brake power-up: knock a couple of notches off the speed. */
  brake() {
    this.speedNotch = Math.max(0, this.speedNotch - LevelTuning.brakeNotches);
    this.notchProgress = 0;
    this.brakeCount += 1;
  }

  /** Shows a level's look straight away (for previews and tests). */
  previewLevel(level) {
    this.level = level;
    this.previousLevel = level;
    this.levelChangeTime = -Infinity;
    this.palette = LevelTheme.forLevel(level);
    this.sceneryWeights = { cave: 0, station: 0 };
    this.sceneryWeights[this.palette.scenery] = 1;
  }

  /** Moves to the next level as the score passes each threshold. */
  updateLevel() {
    const level = LevelTuning.level(this.score);
    if (level === this.level) return;
    this.previousLevel = this.level;
    this.level = level;
    this.levelChangeTime = this.time;
    // A clear, calm run-in: drop blocks not yet on screen, and hold new ones
    // back until the level banner has gone (plus its fade-out).
    this.obstacles = this.obstacles.filter((o) => !(o.x > this.cameraX + this.aspect));
    this.obstacleHoldUntil = this.time + LevelTuning.levelBannerDuration + 0.3;
  }

  /** Blends the palette and scenery from the previous level's look while a transition is in progress. */
  updatePalette(dt) {
    const t = Math.min(1, Math.max(0, (this.time - this.levelChangeTime) / LevelTuning.themeTransition));
    const to = LevelTheme.forLevel(this.level);
    const weights = { cave: 0, station: 0 };
    if (t >= 1) {
      this.palette = to;
      weights[to.scenery] = 1;
    } else {
      const from = LevelTheme.forLevel(this.previousLevel);
      const eased = t * t * (3 - 2 * t);
      this.palette = LevelTheme.mix(from, to, eased);
      weights[from.scenery] += 1 - eased;
      weights[to.scenery] += eased;
    }
    this.sceneryWeights = weights;
    this.moteDrift += this.palette.moteSpeed * dt;
  }

  get timeSinceCrash() { return this.time - this.crashTime; }
  get canRestart() { return this.phase === 'crashed' && this.timeSinceCrash > 0.7; }

  // MARK: Pause

  pause() {
    if (this.phase !== 'playing') return;
    this.isPaused = true;
    this.resumeCountdown = null;
    this.steerDirection = 0;
    this.steerExpiry = null;
  }

  /** Starts the countdown back into play. */
  resume() {
    if (!this.isPaused || this.resumeCountdown !== null) return;
    this.resumeCountdown = GameModel.resumeCountdownLength;
  }

  // MARK: Control modes

  /** Switches control mode, starting over at "Get Ready" if it changed (e.g. the device rotated mid-run). */
  setControlMode(mode) {
    if (mode === this.controlMode) return;
    this.controlMode = mode;
    this.steerDirection = 0;
    this.reset();
  }

  /**
   * Steering input for the steering modes. Pressing a side also starts or
   * restarts a run, like a flap does in landscape. `expiresAfter` (swipe
   * controls): steering stops on its own if no new input arrives within this
   * many seconds, so he only moves while the finger is moving; null steers
   * until told otherwise (hold controls and keys). `speedScale` multiplies
   * the sideways speed for this input.
   */
  steer(direction, expiresAfter = null, speedScale = 1) {
    if (this.isPaused) {
      this.steerDirection = 0;
      this.steerExpiry = null;
      return;
    }
    this.steerDirection = direction;
    this.steerExpiry = direction === 0 || expiresAfter === null ? null : this.time + expiresAfter;
    this.steerSpeedScale = speedScale;
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
    if (this.isPaused) return;
    // In steering mode a flap key just starts or restarts the run.
    if (this.usesSteering) {
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
    this.pickups = [];
    this.hasShield = false;
    this.invulnerableTimer = 0;
    this.powerUpTimers = new Map();
    this.blockScale = 1;
    this.timeScale = 1;
    this.speedNotch = 0;
    this.notchProgress = 0;
    this.isPaused = false;
    this.resumeCountdown = null;
    this.rampScale = LevelTuning.startSpeed;
    this.level = 0;
    this.previousLevel = 0;
    this.levelChangeTime = -Infinity;
    this.bolts = [];
    this.wallOpacity = 1;
    this.fireCooldown = 0;
    this.points = 0;
    this.blocksUntilPickup = blocksUntilNextPickup();
    this.caveCenter = 0.5;
    this.caveDrift = 0;
    this.calmUntilX = Infinity;
    this.nextObstacleX = Infinity;
    this.obstacleHoldUntil = -Infinity;
    this.isNewBest = false;
    this.ensureColumns();
  }

  startRun() {
    this.phase = 'playing';
    this.distance = 0;
    this.points = 0;
    // Columns already generated stay calm; give a little more calm cave
    // before the walls start winding.
    this.calmUntilX = this.cameraX + this.aspect + 0.5 + GameModel.startRunIn;
    this.nextObstacleX = this.cameraX + this.aspect + 0.3 + GameModel.startRunIn;
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
    if (this.isPaused) {
      // Frozen; only the resume countdown runs.
      if (this.resumeCountdown !== null) {
        if (this.resumeCountdown - dt <= 0) {
          this.isPaused = false;
          this.resumeCountdown = null;
        } else {
          this.resumeCountdown -= dt;
        }
      }
      return;
    }
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
      this.points += this.forwardSpeed * dt * 28 * (this.isActive('doubleScore') ? 2 : 1);
      this.updatePowerUps(dt);
      this.updateSpeedRamp(dt);
      this.updateLevel();

      if (this.controlMode === 'flap') {
        this.velocity = Math.min(GameModel.maxFall, this.velocity + GameModel.gravity * dt);
        this.flameTimer = Math.max(0, this.flameTimer - dt);
      } else {
        if (this.steerExpiry !== null && this.time > this.steerExpiry) {
          this.steerDirection = 0;
          this.steerExpiry = null;
        }
        // Constant climb with no gravity; sideways at a steady speed while
        // steering. Ease toward that speed (about a tenth of a second) instead
        // of snapping, so starts, stops, reversals and the tilt that follows
        // them stay smooth. The jetpack burns steadily.
        // Sideways speed keeps up (partly) as the cave speeds up.
        const rampGain = this.rampScale / LevelTuning.startSpeed - 1;
        const targetVelocity = this.steerDirection * GameModel.steerSpeed * this.steerSpeedScale * (1 + rampGain * 0.5);
        this.velocity += (targetVelocity - this.velocity) * Math.min(1, dt * GameModel.steerResponsiveness);
        this.flameTimer = 0.1;
      }
      this.playerY += this.velocity * dt;
      if (this.isActive('ghostWalls')) this.keepOnPlayfield();

      this.ensureColumns();
      this.spawnObstacles();
      const cutoff = this.cameraX - 0.2;
      this.obstacles = this.obstacles.filter((o) => o.x + o.w >= cutoff);
      this.pickups = this.pickups.filter((p) => p.x >= cutoff);
      this.emitExhaust(dt);

      this.collectPickups();
      const hit = this.collision();
      if (hit) {
        if (this.invulnerableTimer > 0) {
          // Grace period after the shield breaks: blocks pass harmlessly, but
          // walls still push him back inside.
          if (hit.wall) this.pushOffWall();
        } else if (this.hasShield) {
          this.breakShield(hit);
        } else {
          this.crash();
        }
      }
    }

    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.updatePalette(dt);
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
    if (this.time < this.obstacleHoldUntil) {
      // Keep the next block, and the winding, just out of view.
      this.nextObstacleX = Math.max(this.nextObstacleX, this.cameraX + this.aspect + 0.3);
      this.calmUntilX = Math.max(this.calmUntilX, this.cameraX + this.aspect + 0.6);
      return;
    }
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
        this.spawnPickupIfDue(this.nextObstacleX + width);
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

  /** The pilot's collision capsule in world space: [a, b, radius]. */
  hitCapsule() {
    const steering = this.controlMode === 'steer';
    const start = steering ? GameModel.backHitboxStart : GameModel.hitboxStart;
    const end = steering ? GameModel.backHitboxEnd : GameModel.hitboxEnd;
    return [this.worldPoint(start[0], start[1]), this.worldPoint(end[0], end[1]),
      (steering ? GameModel.backHitboxRadius : GameModel.hitboxRadius) * GameModel.spriteUnit];
  }

  /**
   * Tests the tilted body capsule by sampling circles along its length.
   * Returns { wall: true }, { obstacle: index } or null.
   */
  collision() {
    const [a, b, r] = this.hitCapsule();
    const ghostWalls = this.isActive('ghostWalls');
    const samples = 8;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;

      const bounds = this.caveBounds(x);
      if (!ghostWalls && (y - r < bounds[0] || y + r > bounds[1])) return { wall: true };
      for (let index = 0; index < this.obstacles.length; index++) {
        const o = this.effectiveRect(this.obstacles[index]);
        const cx = Math.max(o.x, Math.min(x, o.x + o.w));
        const cy = Math.max(o.y, Math.min(y, o.y + o.h));
        if (Math.hypot(x - cx, y - cy) < r) return { obstacle: index };
      }
    }
    return null;
  }

  // MARK: Power-ups

  updatePowerUps(dt) {
    const hadGhostWalls = this.isActive('ghostWalls');
    for (const [kind, remaining] of [...this.powerUpTimers]) {
      if (remaining - dt <= 0) this.powerUpTimers.delete(kind);
      else this.powerUpTimers.set(kind, remaining - dt);
    }
    if (hadGhostWalls && !this.isActive('ghostWalls')) {
      // The walls are back: if he's inside the rock, put him back in the cave
      // with a moment's grace.
      const bounds = this.caveBounds(this.playerWorldX);
      const r = this.hitCapsule()[2];
      if (this.playerY - r < bounds[0] || this.playerY + r > bounds[1]) {
        this.pushOffWall();
        this.invulnerableTimer = Math.max(this.invulnerableTimer, PowerUpTuning.ghostWallsGraceTime);
      }
    }
    const targetOpacity = this.isActive('ghostWalls') ? 0.12 : 1;
    this.wallOpacity += (targetOpacity - this.wallOpacity) * Math.min(1, dt * 5);
    this.updateRayGun(dt);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    // Ease block size and speed in and out rather than snapping.
    const targetScale = this.isActive('miniBlocks') ? PowerUpTuning.miniBlockScale : 1;
    this.blockScale += (targetScale - this.blockScale) * Math.min(1, dt * 4);
    const targetSpeed = this.isActive('slowMotion') ? PowerUpTuning.slowMotionScale : 1;
    this.timeScale += (targetSpeed - this.timeScale) * Math.min(1, dt * 3);
  }

  /** Stops the pilot leaving the playfield (only matters while the walls are ghosts). */
  keepOnPlayfield() {
    const r = this.hitCapsule()[2];
    if (this.playerY < r) {
      this.playerY = r;
      this.velocity = Math.max(this.velocity, 0);
    } else if (this.playerY > 1 - r) {
      this.playerY = 1 - r;
      this.velocity = Math.min(this.velocity, 0);
    }
  }

  /** Fires bolts forward while the Ray Gun is active; bolts destroy the first block they touch. */
  updateRayGun(dt) {
    this.fireCooldown -= dt;
    if (this.isActive('rayGun') && this.fireCooldown <= 0) {
      this.fireCooldown = PowerUpTuning.rayGunFireInterval;
      // From his front: the helmet in the side view, the top of his head from behind.
      const muzzle = this.controlMode === 'steer' ? this.worldPoint(22, 0) : this.worldPoint(18, -2);
      this.bolts.push({ x: muzzle[0], y: muzzle[1] });
      this.shotCount += 1;
    }
    const step = (this.forwardSpeed + PowerUpTuning.boltSpeed) * dt;
    const remaining = [];
    for (const bolt of this.bolts) {
      bolt.x += step;
      if (!(bolt.x < this.cameraX + this.aspect + 0.3)) continue;
      const index = this.obstacles.findIndex((o) => {
        const r = this.effectiveRect(o);
        return bolt.x >= r.x - 0.01 && bolt.x < r.x + r.w + 0.01 && bolt.y >= r.y - 0.01 && bolt.y < r.y + r.h + 0.01;
      });
      if (index >= 0) {
        const r = this.effectiveRect(this.obstacles[index]);
        this.burst(r.x + r.w / 2, r.y + r.h / 2, 36, 0.3, 1.0);
        this.obstacles.splice(index, 1);
        this.blastCount += 1;
        continue;
      }
      remaining.push(bolt);
    }
    this.bolts = remaining;
  }

  /** Places a power-up in the clear gap after a block, every few blocks. */
  spawnPickupIfDue(blockEndX) {
    // Up to two power-ups at once (a shield still held counts), and only one
    // floating in the cave at a time. Blocks count toward the next one while
    // there's room for it.
    const active = this.activePowerUps.map((p) => p.kind);
    if (active.length >= PowerUpTuning.maxActive || this.pickups.length > 0) return;
    this.blocksUntilPickup -= 1;
    if (this.blocksUntilPickup > 0) return;
    this.blocksUntilPickup = blocksUntilNextPickup();
    const x = blockEndX + (GameModel.obstacleSpacing - GameModel.obstacleWidth) / 2;
    const bounds = this.caveBounds(x);
    // Brake is only offered once he's going fast, and more often the faster he goes.
    // A second power-up is always a different kind from the first.
    const kinds = POWER_UP_IDS.filter((k) => k !== 'brake' && !active.includes(k));
    if (this.speedNotch >= LevelTuning.brakeMinimumNotch) {
      for (let i = 0; i < (this.speedNotch >= 6 ? 3 : 1); i++) kinds.push('brake');
    }
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this.pickups.push({ x, y: (bounds[0] + bounds[1]) / 2, kind });
  }

  collectPickups() {
    const [a, b, r] = this.hitCapsule();
    const abx = b[0] - a[0], aby = b[1] - a[1];
    const lengthSquared = Math.max(abx * abx + aby * aby, 1e-9);
    this.pickups = this.pickups.filter((pickup) => {
      // Distance from the pickup to the nearest point on the capsule's spine.
      const t = Math.max(0, Math.min(1, ((pickup.x - a[0]) * abx + (pickup.y - a[1]) * aby) / lengthSquared));
      const nx = a[0] + abx * t, ny = a[1] + aby * t;
      if (!(Math.hypot(pickup.x - nx, pickup.y - ny) < r + PowerUpTuning.radius)) return true;
      this.apply(pickup);
      return false;
    });
  }

  apply(pickup) {
    const duration = PowerUpKind[pickup.kind].duration;
    if (pickup.kind === 'shield') this.hasShield = true;
    else if (pickup.kind === 'brake') this.brake();
    else if (duration !== null) this.powerUpTimers.set(pickup.kind, duration);
    this.pickupCount += 1;
    this.burst(pickup.x, pickup.y, 24, 0.2, 0.6);
  }

  /** The shield absorbs a hit: destroy the block, or push off the wall. */
  breakShield(hit) {
    this.hasShield = false;
    this.invulnerableTimer = PowerUpTuning.shieldGraceTime;
    this.shieldBreakCount += 1;
    this.shake = 0.45;
    if (hit.wall) {
      this.burst(this.playerWorldX, this.playerY, 30, 0.3, 0.9);
      this.pushOffWall();
    } else {
      const r = this.effectiveRect(this.obstacles[hit.obstacle]);
      this.burst(r.x + r.w / 2, r.y + r.h / 2, 40, 0.3, 1.0);
      this.obstacles.splice(hit.obstacle, 1);
    }
  }

  /** Moves the pilot back inside the cave and sends him toward its middle. */
  pushOffWall() {
    const bounds = this.caveBounds(this.playerWorldX);
    const margin = this.hitCapsule()[2] * 1.6;
    this.playerY = Math.max(bounds[0] + margin, Math.min(bounds[1] - margin, this.playerY));
    const towardCenter = this.playerY < (bounds[0] + bounds[1]) / 2 ? 1 : -1;
    if (this.controlMode === 'flap') this.velocity = towardCenter > 0 ? 0.3 : -GameModel.flapVelocity;
    else this.velocity = 0;
  }

  burst(x, y, count, minPower, maxPower) {
    for (let i = 0; i < count; i++) {
      const angle = random(0, TAU);
      const speed = random(minPower, maxPower);
      this.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life: random(0.3, 0.8), maxLife: 0.8, size: random(0.004, 0.008), kind: ParticleKind.spark, spin: 0,
      });
    }
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
/** Clear, calm cave before the first block of a run... */
GameModel.startRunIn = 1.6;
/** Seconds of countdown after Resume before play continues. */
GameModel.resumeCountdownLength = 3.0;
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
/** How quickly steering eases to its target speed (higher = snappier). */
GameModel.steerResponsiveness = 12.0;
/**
 * Portrait climbs a little faster than landscape scrolls, since steering
 * sideways is easier than flapping against gravity: 1.4 playfield units per
 * second on Normal (landscape Normal is 1.08), before the speed ramp.
 */
GameModel.steerForwardSpeed = 1.4;
GameModel.steerForwardSpeedMultiplier = GameModel.steerForwardSpeed / GameModel.scrollSpeed;
/**
 * Landscape glide's forward speed on Normal: faster than flapping (1.08) and
 * portrait (1.4), since its wide view shows more of the cave ahead.
 */
GameModel.glideForwardSpeed = 1.45;

GameModel.bestKey = 'jetman.best';
