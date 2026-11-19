'use strict';

// Collectible power-ups that float in the open gaps between blocks (port of
// PowerUps.swift).

/** Power-up kinds, in the app's order (also the order of the HUD chips). */
const POWER_UP_IDS = ['shield', 'miniBlocks', 'slowMotion', 'doubleScore', 'ghostWalls', 'rayGun', 'brake'];

/**
 * Each kind's name, how long it lasts in seconds (the shield lasts until
 * used, and the brake acts instantly), its icon (Double Score shows "×2" text
 * instead) and color.
 */
const PowerUpKind = {
  /** Absorbs the next hit (block destroyed, or nudged off the wall). */
  shield: { name: 'Shield', duration: null, icon: 'shield', color: [0.31, 0.96, 1.0] },
  /** Shrinks every block for a while. */
  miniBlocks: { name: 'Mini Blocks', duration: 8, icon: 'shrink', color: [1.0, 0.36, 0.78] },
  /** Slows the cave's scroll for a while. */
  slowMotion: { name: 'Slow-Mo', duration: 6, icon: 'tortoise', color: [1.0, 0.86, 0.25] },
  /** Points count twice as fast for a while. */
  doubleScore: { name: 'Double Score', duration: 8, icon: null, color: [1.0, 0.55, 0.2] },
  /** The cave walls fade out and can't hurt you for a while. */
  ghostWalls: { name: 'Ghost Walls', duration: 10, icon: 'squareDashed', color: [0.45, 1.0, 0.55] },
  /** Auto-fires laser bolts that blow up blocks for a while. */
  rayGun: { name: 'Ray Gun', duration: 8, icon: 'bolt', color: [1.0, 0.32, 0.32] },
  /** Instantly knocks the speed back down a couple of notches. */
  brake: { name: 'Brake', duration: null, icon: 'gauge', color: [0.42, 0.62, 1.0] },
};
for (const id of POWER_UP_IDS) PowerUpKind[id].id = id;

const PowerUpTuning = {
  /** One power-up every this many blocks (inclusive range), counted only while no power-up is in play. */
  blocksBetween: [10, 15],
  /** Pickup radius, in playfield units. */
  radius: 0.034,
  /** Block size while Mini Blocks is active (height; width shrinks half as much). */
  miniBlockScale: 0.5,
  /** Scroll speed while Slow-Mo is active. */
  slowMotionScale: 0.65,
  /** Invulnerable flicker after the shield absorbs a hit, in seconds. */
  shieldGraceTime: 1.2,
  /** Grace period when Ghost Walls ends, so a pilot inside the rock isn't killed the instant the walls return. */
  ghostWallsGraceTime: 0.8,
  /** Ghost Walls flickers back this many seconds before it ends, as a warning. */
  ghostWallsWarning: 1.5,
  /** Ray Gun: seconds between shots, and bolt speed relative to the cave. */
  rayGunFireInterval: 0.32,
  boltSpeed: 2.6,
};

/** A random whole number of blocks until the next power-up (`blocksBetween.randomElement()`). */
function blocksUntilNextPickup() {
  const [lo, hi] = PowerUpTuning.blocksBetween;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/**
 * Icons for the pickups and HUD chips, standing in for the SF Symbols the app
 * uses (shield.fill, arrow.down.right.and.arrow.up.left, tortoise.fill,
 * square.dashed, bolt.fill, gauge.with.dots.needle.33percent). SVG path data
 * in a 24 x 24 box: a filled part, a stroked part, or both.
 */
const PowerUpIcons = {
  shield: {
    fill: 'M12 2.3l7.4 2.8c.45.17.75.6.75 1.08v5.2c0 4.9-3.2 8.9-7.9 10.4a.85.85 0 0 1-.5 0' +
      'C7.05 20.28 3.85 16.28 3.85 11.38v-5.2c0-.48.3-.91.75-1.08z',
  },
  shrink: { stroke: 'M4.5 4.5l5.5 5.5M10 4.8V10H4.8M19.5 19.5L14 14M14 19.2V14h5.2', width: 2.4 },
  tortoise: {
    fill: 'M2.6 14.4C2.9 9.9 6.6 6.6 11.3 6.6s8.4 3.3 8.7 7.8z' +
      'M19.2 11.3c.7-1.3 1.8-2 3-2 1 0 1.6.75 1.6 1.65 0 1.25-1.05 2.25-2.3 2.25h-1.6z' +
      'M4.5 14.9h3.3v2.7a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1z' +
      'M14.4 14.9h3.3v2.7a1 1 0 0 1-1 1h-1.3a1 1 0 0 1-1-1z' +
      'M2.8 13.3L.8 14.6l2.2.3z',
  },
  squareDashed: {
    stroke: 'M7.2 4h9.6A3.2 3.2 0 0 1 20 7.2v9.6a3.2 3.2 0 0 1-3.2 3.2H7.2A3.2 3.2 0 0 1 4 16.8V7.2A3.2 3.2 0 0 1 7.2 4z',
    width: 2.2,
    dash: [3.1, 2.5],
  },
  bolt: {
    fill: 'M13.7 2.2L4.8 13.3a.75.75 0 0 0 .58 1.22h5.5l-1.5 7.2c-.16.78.82 1.24 1.32.62l8.9-11.1' +
      'a.75.75 0 0 0-.58-1.22h-5.5l1.5-7.2c.16-.78-.82-1.24-1.32-.62z',
  },
  /** A gauge with dots around its dial and the needle a third of the way round. */
  gauge: {
    stroke: 'M12 2.6a9.4 9.4 0 1 1 0 18.8a9.4 9.4 0 1 1 0-18.8zM12 12L7.54 7.69',
    width: 2.1,
    fill: 'M13.80 12.00a1.8 1.8 0 1 1 -3.60 0a1.8 1.8 0 1 1 3.60 0zM7.28 15.30a1.0 1.0 0 1 1 -2.00 0a1.0 1.0 0 1 1 2.00 0' +
      'zM6.80 9.74a1.0 1.0 0 1 1 -2.00 0a1.0 1.0 0 1 1 2.00 0zM10.21 6.02a1.0 1.0 0 1 1 -2.00 0a1.0 1.0 0 1 1 2.00 0z' +
      'M15.79 6.02a1.0 1.0 0 1 1 -2.00 0a1.0 1.0 0 1 1 2.00 0zM19.20 9.74a1.0 1.0 0 1 1 -2.00 0a1.0 1.0 0 1 1 2.00 0z' +
      'M18.72 15.30a1.0 1.0 0 1 1 -2.00 0a1.0 1.0 0 1 1 2.00 0z',
  },
};

/** SVG markup for a power-up icon (HUD chips). */
function powerUpIconSVG(name) {
  const icon = PowerUpIcons[name];
  let body = '';
  if (icon.fill) body += `<path d="${icon.fill}"/>`;
  if (icon.stroke) {
    body += `<path d="${icon.stroke}" fill="none" stroke="currentColor" stroke-width="${icon.width}" stroke-linecap="round" ` +
      `stroke-linejoin="round"${icon.dash ? ` stroke-dasharray="${icon.dash.join(' ')}"` : ''}/>`;
  }
  return `<svg class="icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
}

const powerUpIconPaths = new Map();

/** Draws a power-up icon centered at the origin of `ctx`, `side` units across, in `style`. */
function drawPowerUpIcon(ctx, name, side, style) {
  const icon = PowerUpIcons[name];
  let paths = powerUpIconPaths.get(name);
  if (!paths) {
    paths = { fill: icon.fill && new Path2D(icon.fill), stroke: icon.stroke && new Path2D(icon.stroke) };
    powerUpIconPaths.set(name, paths);
  }
  ctx.save();
  ctx.scale(side / 24, side / 24);
  ctx.translate(-12, -12);
  if (paths.fill) {
    ctx.fillStyle = style;
    ctx.fill(paths.fill);
  }
  if (paths.stroke) {
    ctx.strokeStyle = style;
    ctx.lineWidth = icon.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (icon.dash) ctx.setLineDash(icon.dash);
    ctx.stroke(paths.stroke);
  }
  ctx.restore();
}
