'use strict';

// Player-adjustable settings, saved in localStorage under the same keys the
// app uses for @AppStorage (port of GameSettings.swift).

const SettingsKeys = {
  modeLock: 'jetman.settings.modeLock',
  difficulty: 'jetman.settings.difficulty',
  haptics: 'jetman.settings.haptics',
  screenShake: 'jetman.settings.screenShake',
  soundEnabled: 'jetman.settings.soundEnabled',
  soundVolume: 'jetman.settings.soundVolume',
  skin: 'jetman.skin',
};

/** Which way the game plays. */
const ModeLock = {
  /** Follows the screen shape: landscape flaps, portrait steers. */
  auto: {
    id: 'auto', name: 'Auto',
    detail: 'Landscape flaps, portrait steers. Follows how you hold the device.',
  },
  /** Always flap through a horizontal cave. */
  landscape: { id: 'landscape', name: 'Landscape', detail: 'Always flap through a horizontal cave.' },
  /** Always steer while climbing a vertical cave. */
  portrait: { id: 'portrait', name: 'Portrait', detail: 'Always steer while climbing a vertical cave.' },
};
const MODE_LOCK_IDS = ['auto', 'landscape', 'portrait'];

/** Whether to play the portrait (steering) mode for a view of this size. */
function usesPortrait(modeLockId, width, height) {
  switch (modeLockId) {
    case 'landscape': return false;
    case 'portrait': return true;
    default: return height > width;
  }
}

/** Scales the game's pace and the open lane beside each block. */
const Difficulty = {
  easy: {
    id: 'easy', name: 'Easy', detail: 'Slower, with wider gaps.',
    /** Multiplies the forward speed. */
    speedMultiplier: 0.85,
    /** Added to the minimum open lane beside each block (playfield units). */
    laneBonus: 0.06,
  },
  normal: { id: 'normal', name: 'Normal', detail: 'The original pace and gaps.', speedMultiplier: 1, laneBonus: 0 },
  hard: { id: 'hard', name: 'Hard', detail: 'Faster, with tighter gaps.', speedMultiplier: 1.15, laneBonus: -0.03 },
};
const DIFFICULTY_IDS = ['easy', 'normal', 'hard'];

/** Current settings, loaded from storage with the app's defaults. */
const Settings = {
  modeLock: 'auto',
  difficulty: 'normal',
  haptics: true,
  screenShake: true,
  soundEnabled: true,
  soundVolume: 0.8,
  skin: 'navy',

  load() {
    const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
    this.modeLock = pick(Store.get(SettingsKeys.modeLock, 'auto'), MODE_LOCK_IDS, 'auto');
    this.difficulty = pick(Store.get(SettingsKeys.difficulty, 'normal'), DIFFICULTY_IDS, 'normal');
    this.haptics = Store.get(SettingsKeys.haptics, true) !== false;
    this.screenShake = Store.get(SettingsKeys.screenShake, true) !== false;
    this.soundEnabled = Store.get(SettingsKeys.soundEnabled, true) !== false;
    const volume = Number(Store.get(SettingsKeys.soundVolume, 0.8));
    this.soundVolume = Number.isFinite(volume) ? clamp(volume, 0, 1) : 0.8;
    this.skin = pick(Store.get(SettingsKeys.skin, 'navy'), SKIN_IDS, 'navy');
  },

  set(name, value) {
    this[name] = value;
    Store.set(SettingsKeys[name], value);
  },
};
