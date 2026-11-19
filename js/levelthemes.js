'use strict';

// Pacing for the speed ramp, and the look of each level (port of
// LevelThemes.swift). The cave is the same on every level; only its colors
// and background scenery change.

const LevelTuning = {
  /**
   * Points needed to finish level 1; each later level needs `levelGrowth`
   * more than the one before (500, 800, 1100...), so levels last longer even
   * as the speed ramp brings points in faster.
   */
  firstLevelPoints: 500,
  levelGrowth: 300,

  /** The level (0-based) reached at a score: same cave, new scenery. */
  level(score) {
    let level = 0;
    let threshold = this.firstLevelPoints;
    while (score >= threshold) {
      level += 1;
      threshold += this.firstLevelPoints + this.levelGrowth * level;
    }
    return level;
  },

  /** Seconds of play between speed notches (Slow-Mo stretches this). */
  secondsPerNotch: 10,
  /** Runs start at this fraction of each mode's tuned speed, reaching it after ~30 s of notches. */
  startSpeed: 0.85,
  /** Each notch adds this fraction of the starting speed. */
  notchStep: 0.07,
  /** Top speed: 0.85 x 1.84 ≈ 1.56x the tuned speed, after two minutes. */
  maxNotches: 12,
  /** Brake: notches knocked off when collected... */
  brakeNotches: 2,
  /** ...and only offered once he's at least this many notches up. */
  brakeMinimumNotch: 3,
  /** Seconds to crossfade from one level's look to the next. */
  themeTransition: 1.6,
};

/** Color keys of a theme, all blended during a level change. */
const THEME_COLOR_KEYS = ['backEdge', 'backMiddle', 'patch', 'shaft', 'far', 'near', 'lightA', 'lightB', 'mote',
  'wallLight', 'wallDark', 'detail', 'rimA', 'rimB', 'blockA', 'blockB', 'blockC', 'blockGlow'];

/**
 * The look of one level. `scenery` is 'cave' (stalactites, stalagmites,
 * crystals and light shafts) or 'station' (metal wall panels, superstructure
 * towers and running lights). Colors are [r, g, b]:
 * - backEdge / backMiddle: the back wall, darkest at the top and bottom.
 * - patch: soft patches on the back wall (cave) or wall panels (station).
 * - far / near: background silhouettes. lightA / lightB: crystal tints or running lights.
 * - mote and moteSpeed: drifting motes, in points per second (negative falls, like snow).
 * - wallLight / wallDark / detail / rimA / rimB: the cave walls and their neon rim.
 * - blockA / blockB / blockC / blockGlow: block gradient and outer glow.
 */
const LevelTheme = (() => {
  const crystalCave = {
    name: 'Crystal Cave', scenery: 'cave',
    backEdge: [0.03, 0.04, 0.11], backMiddle: [0.09, 0.07, 0.20],
    patch: [0.16, 0.12, 0.30], shaft: [0.62, 0.42, 1.0],
    far: [0.12, 0.09, 0.25], near: [0.07, 0.06, 0.17],
    lightA: [0.31, 0.96, 1.0], lightB: [1.0, 0.24, 0.55],
    mote: [0.31, 0.96, 1.0], moteSpeed: 6,
    wallLight: [0.11, 0.15, 0.30], wallDark: [0.03, 0.04, 0.11],
    detail: [0.62, 0.42, 1.0], rimA: [0.31, 0.96, 1.0], rimB: [0.62, 0.42, 1.0],
    blockA: [1.0, 0.24, 0.55], blockB: [0.55, 0.1, 0.45], blockC: [1.0, 0.55, 0.22],
    blockGlow: [1.0, 0.24, 0.55],
  };

  /** An original space-station interior: grey plating, towering superstructure and red warning lights. */
  const battleStation = {
    name: 'Battle Station', scenery: 'station',
    backEdge: [0.025, 0.03, 0.04], backMiddle: [0.11, 0.12, 0.14],
    patch: [0.22, 0.24, 0.27], shaft: [1.0, 0.28, 0.2],
    far: [0.15, 0.16, 0.18], near: [0.085, 0.09, 0.105],
    lightA: [1.0, 0.22, 0.18], lightB: [1.0, 0.82, 0.55],
    mote: [1.0, 0.7, 0.45], moteSpeed: 3,
    wallLight: [0.30, 0.32, 0.36], wallDark: [0.07, 0.075, 0.09],
    detail: [0.6, 0.63, 0.68], rimA: [1.0, 0.3, 0.2], rimB: [1.0, 0.62, 0.3],
    blockA: [0.62, 0.65, 0.70], blockB: [0.26, 0.28, 0.32], blockC: [0.45, 0.47, 0.52],
    blockGlow: [1.0, 0.25, 0.2],
  };

  const magmaCore = {
    name: 'Magma Core', scenery: 'cave',
    backEdge: [0.07, 0.015, 0.015], backMiddle: [0.24, 0.06, 0.03],
    patch: [0.45, 0.12, 0.04], shaft: [1.0, 0.45, 0.1],
    far: [0.22, 0.06, 0.04], near: [0.12, 0.03, 0.03],
    lightA: [1.0, 0.55, 0.1], lightB: [1.0, 0.85, 0.3],
    mote: [1.0, 0.6, 0.2], moteSpeed: 24,
    wallLight: [0.26, 0.08, 0.05], wallDark: [0.07, 0.02, 0.02],
    detail: [1.0, 0.35, 0.1], rimA: [1.0, 0.78, 0.2], rimB: [1.0, 0.28, 0.05],
    blockA: [0.25, 0.17, 0.22], blockB: [0.1, 0.06, 0.09], blockC: [1.0, 0.42, 0.1],
    blockGlow: [1.0, 0.5, 0.1],
  };

  const frostMoon = {
    name: 'Frost Moon', scenery: 'cave',
    backEdge: [0.02, 0.05, 0.10], backMiddle: [0.10, 0.20, 0.32],
    patch: [0.3, 0.45, 0.6], shaft: [0.7, 0.9, 1.0],
    far: [0.16, 0.26, 0.38], near: [0.10, 0.17, 0.27],
    lightA: [0.6, 0.95, 1.0], lightB: [0.85, 0.8, 1.0],
    mote: [1.0, 1.0, 1.0], moteSpeed: -16,
    wallLight: [0.35, 0.5, 0.65], wallDark: [0.08, 0.14, 0.24],
    detail: [0.8, 0.95, 1.0], rimA: [0.8, 1.0, 1.0], rimB: [0.45, 0.7, 1.0],
    blockA: [0.25, 0.6, 1.0], blockB: [0.1, 0.25, 0.6], blockC: [0.7, 0.95, 1.0],
    blockGlow: [0.4, 0.8, 1.0],
  };

  const toxicPlanet = {
    name: 'Toxic Planet', scenery: 'cave',
    backEdge: [0.02, 0.06, 0.03], backMiddle: [0.08, 0.18, 0.08],
    patch: [0.2, 0.4, 0.1], shaft: [0.6, 1.0, 0.3],
    far: [0.08, 0.18, 0.08], near: [0.04, 0.10, 0.05],
    lightA: [0.6, 1.0, 0.2], lightB: [0.9, 0.4, 1.0],
    mote: [0.7, 1.0, 0.3], moteSpeed: 9,
    wallLight: [0.12, 0.24, 0.10], wallDark: [0.03, 0.07, 0.03],
    detail: [0.5, 1.0, 0.3], rimA: [0.65, 1.0, 0.25], rimB: [0.85, 0.35, 1.0],
    blockA: [0.85, 0.35, 1.0], blockB: [0.35, 0.1, 0.5], blockC: [0.6, 1.0, 0.25],
    blockGlow: [0.8, 0.4, 1.0],
  };

  const all = [crystalCave, battleStation, magmaCore, frostMoon, toxicPlanet];

  return {
    all,

    /** The theme for a level number (cycles after the last). */
    forLevel(level) {
      return all[((level % all.length) + all.length) % all.length];
    },

    /** Blends every color from `a` to `b` (the scenery follows `b`; the renderer crossfades the scenery itself). */
    mix(a, b, t) {
      const theme = { name: b.name, scenery: b.scenery, moteSpeed: a.moteSpeed + (b.moteSpeed - a.moteSpeed) * t };
      for (const key of THEME_COLOR_KEYS) theme[key] = vmix(a[key], b[key], t);
      return theme;
    },
  };
})();
