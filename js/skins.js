'use strict';

// Pilot skins and their colors, shared by the 2D and 3D renderers
// (port of PilotSkin.swift). Colors are 0...1 sRGB components.

/** The title logo's palette, which the mecha is painted in. */
const LogoPalette = {
  topLight: [0.50, 0.90, 1.0],
  topDark: [0.30, 0.32, 0.92],
  bottomLight: [1.0, 0.36, 0.62],
  bottomDark: [0.96, 0.36, 0.16],
  outline: [0.09, 0.08, 0.22],
  lampGreen: [0.2, 0.9, 0.45],
  lampCyan: [0.31, 0.96, 1.0],
  lampPink: [1.0, 0.3, 0.55],
  lampOrange: [1.0, 0.6, 0.15],

  /**
   * The logo's two-tone gradient: sky blue at `top` to indigo at `seam`,
   * then pink just below the seam to orange-red at `bottom`.
   */
  color(y, top, seam, bottom) {
    if (y >= seam) {
      return vmix(this.topDark, this.topLight, clamp((y - seam) / (top - seam), 0, 1));
    }
    return vmix(this.bottomLight, this.bottomDark, clamp((seam - y) / (seam - bottom), 0, 1));
  },
};

/** Playing-card jester: red, blue and yellow motley with gold bells. */
const JokerPalette = {
  red: [0.86, 0.14, 0.16],
  blue: [0.14, 0.34, 0.80],
  yellow: [0.98, 0.80, 0.18],
  gold: [0.95, 0.74, 0.25],
  glove: [0.96, 0.96, 0.94],
};

/** An original superhero: teal suit, crimson cape, gold emblem and belt. */
const HeroPalette = {
  suit: [0.05, 0.56, 0.62],
  suitDark: [0.03, 0.36, 0.44],
  cape: [0.80, 0.10, 0.20],
  gold: [0.96, 0.76, 0.26],
  mask: [0.08, 0.08, 0.13],
  hair: [0.20, 0.13, 0.08],
};

/** Vanguard: sleek white armor over a black frame with gold trim and glowing cyan line accents. */
const VanguardPalette = {
  armor: [0.90, 0.92, 0.95],
  frame: [0.12, 0.12, 0.15],
  gold: [0.93, 0.72, 0.26],
  line: [0.30, 0.95, 1.0],
};

const SKIN_TONE = [0.96, 0.78, 0.64];
/** Oxygen mask and hose rubber. */
const MASK_COLOR = [0.26, 0.28, 0.31];

const GOLD_VISOR = { light: [0.96, 0.78, 0.34], dark: [0.52, 0.30, 0.10] };

/** Color schemes the player can pick for the pilot on the main menu. */
const PilotSkin = {
  navy: {
    name: 'Navy',
    suit: [0.13, 0.19, 0.40], suitDark: [0.08, 0.11, 0.26], accent: [1.0, 0.55, 0.22],
    helmet: [0.93, 0.94, 0.98], metal: [0.70, 0.74, 0.82], visor: GOLD_VISOR,
  },
  black: {
    name: 'Stealth',
    suit: [0.07, 0.07, 0.08], suitDark: [0.03, 0.03, 0.04], accent: [0.17, 0.17, 0.19],
    helmet: [0.10, 0.10, 0.12], metal: [0.30, 0.31, 0.35],
    visor: { light: [0.32, 0.30, 0.42], dark: [0.06, 0.06, 0.10] },
  },
  pink: {
    name: 'Pink',
    suit: [0.93, 0.33, 0.60], suitDark: [0.68, 0.18, 0.44], accent: [1.0, 0.82, 0.90],
    helmet: [0.93, 0.94, 0.98], metal: [0.70, 0.74, 0.82], visor: GOLD_VISOR,
  },
  mecha: {
    name: 'Mecha',
    suit: LogoPalette.topDark, suitDark: LogoPalette.bottomLight, accent: LogoPalette.bottomDark,
    helmet: LogoPalette.topLight, metal: LogoPalette.outline, visor: GOLD_VISOR,
  },
  vanguard: {
    name: 'Vanguard',
    suit: VanguardPalette.armor, suitDark: VanguardPalette.frame, accent: VanguardPalette.gold,
    helmet: VanguardPalette.armor, metal: [0.32, 0.33, 0.38], visor: GOLD_VISOR,
  },
  joker: {
    name: 'Joker',
    suit: JokerPalette.red, suitDark: JokerPalette.blue, accent: JokerPalette.yellow,
    helmet: SKIN_TONE, metal: [0.72, 0.70, 0.66], visor: GOLD_VISOR,
  },
  hero: {
    name: 'Hero',
    suit: HeroPalette.suit, suitDark: HeroPalette.suitDark, accent: HeroPalette.cape,
    helmet: SKIN_TONE, metal: [0.62, 0.66, 0.72], visor: GOLD_VISOR,
  },
};

/** Menu order (PilotSkin.allCases). */
const SKIN_IDS = ['navy', 'black', 'pink', 'mecha', 'vanguard', 'joker', 'hero'];

for (const id of SKIN_IDS) {
  PilotSkin[id].id = id;
  /** Robot skins swap the suited pilot for a robot body. */
  PilotSkin[id].isRobot = id === 'mecha' || id === 'vanguard';
}

/** CSS fill for the menu swatch. The mecha swatch is split two-tone like the logo. */
function skinSwatch(skin) {
  const c = (rgb) => css(rgb);
  switch (skin.id) {
    case 'joker':
      // SwiftUI's angular gradient starts at 3 o'clock; CSS conic starts at 12.
      return `conic-gradient(from 90deg, ${c(JokerPalette.red)} 0 33.3%, ${c(JokerPalette.yellow)} 33.3% 66.7%, ` +
        `${c(JokerPalette.blue)} 66.7% 100%)`;
    case 'hero':
      return `linear-gradient(135deg, ${c(HeroPalette.suit)} 0 55%, ${c(HeroPalette.gold)} 55% 65%, ` +
        `${c(HeroPalette.cape)} 65% 100%)`;
    case 'vanguard':
      return `linear-gradient(to bottom, ${c(VanguardPalette.armor)} 0 45%, ${c(VanguardPalette.gold)} 45% 58%, ` +
        `${c(VanguardPalette.frame)} 58% 100%)`;
    case 'mecha':
      return `linear-gradient(to bottom, ${c(skin.helmet)} 0%, ${c(skin.suit)} 50%, ${c(skin.suitDark)} 50%, ` +
        `${c(skin.accent)} 100%)`;
    default:
      // `Color.gradient`: the color, a touch lighter at the top.
      return `linear-gradient(to bottom, ${c(vmix(skin.suit, [1, 1, 1], 0.14))}, ${c(skin.suit)})`;
  }
}
