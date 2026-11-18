'use strict';

// Screens, overlays, input and the frame loop (port of ContentView.swift).

Settings.load();

const model = new GameModel();
const renderer = new GameRenderer();
const scoreboard = new Scoreboard();

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const appEl = document.getElementById('app');
const $ = (id) => document.getElementById(id);

/** 'menu' or 'game'. */
let activeScreen = 'menu';
/** Where the last run placed on the scoreboard, if it made it. */
let lastRank = null;
let showsScoreboard = false;
let showsSettings = false;
let confirmsReset = false;
/** Size of the whole view in CSS pixels. */
const view = { w: 1, h: 1, dpr: 1 };

// MARK: HUD state

/**
 * The small slice of game state the overlays depend on. The DOM is only
 * touched when one of these values changes, not on every frame.
 */
let hud = {
  phase: 'ready', score: 0, best: model.best, isNewBest: false, showGameOver: false,
  canRestart: false, crashCount: 0, flapCount: 0,
  /** 'flap', 'steer' (portrait) or 'glide'. Steering means either of the last two. */
  controlMode: 'flap', isSteering: false, isPortrait: false,
  powerUps: [], powerUpKey: '', pickupCount: 0, shieldBreakCount: 0, shotCount: 0, blastCount: 0,
};

function syncHUD() {
  const next = {
    phase: model.phase,
    score: model.score,
    best: model.best,
    isNewBest: model.isNewBest,
    showGameOver: model.phase === 'crashed' && model.timeSinceCrash > 0.5,
    canRestart: model.canRestart,
    crashCount: model.crashCount,
    flapCount: model.flapCount,
    controlMode: model.controlMode,
    isSteering: model.controlMode !== 'flap',
    isPortrait: model.controlMode === 'steer',
    powerUps: model.activePowerUps,
    pickupCount: model.pickupCount,
    shieldBreakCount: model.shieldBreakCount,
    shotCount: model.shotCount,
    blastCount: model.blastCount,
  };
  next.powerUpKey = next.powerUps.map((p) => `${p.kind}:${p.secondsLeft === null ? '' : p.secondsLeft}`).join('|');
  const prev = hud;
  hud = next;
  if (next.flapCount !== prev.flapCount) onFlap();
  if (next.pickupCount !== prev.pickupCount) onPickup();
  if (next.shieldBreakCount !== prev.shieldBreakCount) onShieldBreak();
  if (next.shotCount !== prev.shotCount) playSound('laser');
  if (next.blastCount !== prev.blastCount) playSound('shieldBreak');
  if (next.crashCount !== prev.crashCount) onCrash();
  if (next.phase !== prev.phase) onPhaseChange();
  updateGameOverlay(prev, next);
}

// MARK: Events from the model

function playSound(effect) {
  if (typeof sound !== 'undefined') sound.play(effect);
}

function onFlap() {
  playSound('flap');
  haptic('light');
}

function onPickup() {
  playSound('powerUp');
  haptic('medium');
}

function onShieldBreak() {
  playSound('shieldBreak');
  haptic('shield');
}

function onCrash() {
  if (typeof sound !== 'undefined') {
    sound.play('crash');
    if (hud.isNewBest) setTimeout(() => sound.play('highScore'), 450);
  }
  haptic('heavy');
  // Record each finished run once, when the model reports a crash.
  lastRank = scoreboard.record(hud.score, Settings.skin);
}

function onPhaseChange() {
  if (hud.phase === 'playing') {
    lastRank = null;
    // Steering runs have no flaps, so mark the start with a chirp.
    if (hud.isSteering && typeof sound !== 'undefined') sound.play('start');
  }
}

/** Haptics (where the browser can vibrate): a light tap per flap, a medium one per pickup, heavier bumps for a shield break and a crash. */
const HAPTIC_MS = { light: 8, medium: 15, shield: 25, heavy: 35 };

function haptic(weight) {
  if (!Settings.haptics || !canVibrate()) return;
  try {
    navigator.vibrate(HAPTIC_MS[weight] || 8);
  } catch (e) {
    // Vibration can be blocked; ignore.
  }
}

function canVibrate() {
  return typeof navigator.vibrate === 'function' && matchMedia('(pointer: coarse)').matches;
}

/** Shows or hides an element, dropping keyboard focus from anything it hides. */
function setShown(element, shown) {
  if (!shown && element.contains(document.activeElement)) document.activeElement.blur();
  element.classList.toggle('is-hidden', !shown);
}

/** Wires a button, dropping focus after mouse/touch clicks so Space keeps flying instead of re-pressing it. */
function onClick(element, action) {
  element.addEventListener('click', (e) => {
    if (e.detail > 0) element.blur();
    action(e);
  });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// MARK: Main menu

const logoTitle = new PanelTitle('JETMAN', 'Jetman');
$('logo').appendChild(logoTitle.canvas);

const swatchButtons = SKIN_IDS.map((id) => {
  const skin = PilotSkin[id];
  const button = element('button', 'swatch-button');
  button.type = 'button';
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-label', skin.name);
  button.title = skin.name;
  const swatch = element('span', 'swatch');
  swatch.style.background = skinSwatch(skin);
  button.appendChild(swatch);
  onClick(button, () => selectSkin(id));
  $('swatches').appendChild(button);
  return button;
});

function updateSkinPicker(animated) {
  SKIN_IDS.forEach((id, i) => {
    const selected = id === Settings.skin;
    swatchButtons[i].setAttribute('aria-checked', String(selected));
    swatchButtons[i].tabIndex = selected ? 0 : -1;
  });
  const name = $('skin-name');
  name.textContent = PilotSkin[Settings.skin].name.toUpperCase();
  if (animated) {
    name.classList.remove('changed');
    void name.offsetWidth; // restart the fade
    name.classList.add('changed');
  }
}

function selectSkin(id) {
  if (id === Settings.skin) return;
  Settings.set('skin', id);
  updateSkinPicker(true);
  warmSprites();
}

/** Renders the chosen pilot's in-game sprites shortly after it's picked, so the first frame in game doesn't stall. */
let warmTimer = 0;
function warmSprites() {
  if (typeof PilotSprite3D === 'undefined') return;
  clearTimeout(warmTimer);
  warmTimer = setTimeout(() => PilotSprite3D.warm(PilotSkin[Settings.skin]), 150);
}

/** Left/right arrows cycle the pilot's colors on the menu. */
function cycleSkin(step) {
  const index = Math.max(0, SKIN_IDS.indexOf(Settings.skin));
  selectSkin(SKIN_IDS[(index + step + SKIN_IDS.length) % SKIN_IDS.length]);
}

// Arrow keys move between swatches when one has focus (radio group behavior).
$('swatches').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  e.stopPropagation();
  cycleSkin(e.key === 'ArrowLeft' ? -1 : 1);
  swatchButtons[SKIN_IDS.indexOf(Settings.skin)].focus();
});

/**
 * Picks the first layout that fits both ways: stacked when there's room, side
 * by side on short screens, and compact versions of each for small displays
 * (SwiftUI ViewThatFits; the last one is used if none fit).
 */
function layoutMenu() {
  const area = $('menu-area');
  const content = $('menu-content');
  const availableW = area.clientWidth - 48;
  const availableH = area.clientHeight - 48;
  for (let layout = 1; layout <= 4; layout++) {
    content.className = `menu-content layout-${layout}`;
    if (content.offsetWidth <= availableW + 0.5 && content.offsetHeight <= availableH + 0.5) return;
  }
}

/** The 3D pilot slowly turning on the menu (falls back to the flat pilot if the 3D renderer isn't loaded). */
const turntableCanvas = $('turntable-canvas');
const turntableCtx = turntableCanvas.getContext('2d');
let turntableStart = performance.now() / 1000;

function renderTurntable(now) {
  const w = turntableCanvas.clientWidth, h = turntableCanvas.clientHeight;
  if (w === 0 || h === 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (turntableCanvas.width !== pw || turntableCanvas.height !== ph) {
    turntableCanvas.width = pw;
    turntableCanvas.height = ph;
  }
  const c = turntableCtx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, pw, ph);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const t = now - turntableStart;
  if (typeof PilotTurntable !== 'undefined') {
    PilotTurntable.draw(c, w, h, t, PilotSkin[Settings.skin]);
    return;
  }
  // Flat preview: the 2D pilot bobbing in place.
  c.save();
  c.translate(w / 2, h / 2 + Math.sin(t * 1.6) * h * 0.02);
  c.rotate(Math.sin(t * 0.8) * 0.12);
  const u = Math.min(w / 52, h / 40);
  c.scale(u, u);
  drawPilot2D(c, PilotSkin[Settings.skin], t, true);
  c.restore();
}

onClick($('play-button'), () => startGame());
onClick($('scoreboard-button'), () => openScoreboard());
onClick($('settings-button'), () => openSettings());

// MARK: In-game overlays

const readyTitle = new PanelTitle('GET READY');
$('ready-title').appendChild(readyTitle.canvas);
const gameOverTitle = new PanelTitle('GAME OVER');
$('game-over-title').appendChild(gameOverTitle.canvas);

/** Touch screens get "Tap" wording; keyboards and mice get "Click or press Space". */
function usesTouchWording() {
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}

/** Hold or swipe for the steering mode being played (portrait and Glide each have their own setting). */
function steerControls() {
  return hud.isPortrait ? Settings.portraitControls : Settings.glideControls;
}

/**
 * The pulsing call to action on the Get Ready screen. The controls are
 * explained by the text under the title (and the touch demo), so this just
 * says how to begin.
 */
function promptText() {
  return usesTouchWording() ? 'Tap to start' : 'Click or press Space to start';
}

function howToPlayText(mode) {
  const dodge = '\nDodge the walls and blocks.';
  if (!usesTouchWording()) {
    return {
      steer: 'Hold ← or → to steer as you climb.',
      glide: 'Hold ↑ or ↓ to glide up and down.',
      flap: 'Click or press Space to fire the jetpack.',
    }[mode] + dodge;
  }
  const swipe = steerControls() === 'swipe';
  if (mode === 'steer') return (swipe ? 'Swipe left or right to steer as you climb.' : 'Hold left or right to steer as you climb.') + dodge;
  if (mode === 'glide') return (swipe ? 'Swipe up or down to glide.' : 'Hold the top or bottom of the screen to glide.') + dodge;
  return 'Tap to fire the jetpack.' + dodge;
}

function updateReadyText() {
  $('prompt').textContent = promptText();
  $('how-to').textContent = howToPlayText(hud.controlMode);
  // In portrait the pilot sits low on screen; keep the prompt above him.
  $('ready-card').style.setProperty('--ready-bottom', hud.isPortrait ? `${Math.round(view.h * 0.38)}px` : '40px');
}

/** Active power-ups, shown below the score while playing: icon plus seconds left (the shield shows until used). */
function updatePowerUpChips() {
  const container = $('power-up-chips');
  const shown = hud.phase === 'playing' ? hud.powerUps : [];
  if (shown.length === 0 && hud.phase !== 'playing') {
    // The chips go with the run, all at once.
    container.textContent = '';
    return;
  }
  const chips = new Map();
  for (const chip of [...container.children]) {
    if (!chip.classList.contains('leaving')) chips.set(chip.dataset.kind, chip);
  }
  for (const [kind, chip] of chips) {
    if (shown.some((p) => p.kind === kind)) continue;
    chip.classList.add('leaving');
    chip.addEventListener('animationend', () => chip.remove(), { once: true });
    setTimeout(() => chip.remove(), 400);
  }
  for (const powerUp of shown) {
    const kind = PowerUpKind[powerUp.kind];
    let chip = chips.get(powerUp.kind);
    if (!chip) {
      chip = element('div', 'glass capsule chip');
      chip.dataset.kind = powerUp.kind;
      chip.style.setProperty('--chip-color', css(kind.color));
      chip.setAttribute('role', 'status');
      const icon = element('span', 'chip-icon');
      if (kind.icon) icon.innerHTML = powerUpIconSVG(kind.icon);
      else icon.append(element('span', 'times-two', '×2'));
      chip.append(icon, element('span', 'seconds'));
      // Keep the app's order (shield, mini blocks, slow-mo, double score, ghost walls, ray gun).
      const order = POWER_UP_IDS.indexOf(powerUp.kind);
      const before = [...container.children].find((c) => POWER_UP_IDS.indexOf(c.dataset.kind) > order);
      container.insertBefore(chip, before || null);
    }
    const seconds = chip.querySelector('.seconds');
    const text = powerUp.secondsLeft === null ? '' : `${powerUp.secondsLeft}s`;
    if (seconds.textContent !== text) {
      const counting = seconds.textContent !== '';
      seconds.textContent = text;
      seconds.hidden = text === '';
      if (counting) {
        seconds.classList.remove('tick');
        void seconds.offsetWidth; // restart the count-down animation
        seconds.classList.add('tick');
      }
    }
    chip.setAttribute('aria-label', powerUp.secondsLeft === null ? kind.name : `${kind.name}, ${powerUp.secondsLeft} seconds`);
  }
}

function updateGameOverlay(prev, next, force = false) {
  if (force || prev.phase !== next.phase) {
    setShown($('score-bar'), next.phase !== 'ready');
    setShown($('ready-card'), next.phase === 'ready');
  }
  if (force || prev.score !== next.score) $('score-value').textContent = String(next.score);
  if (force || prev.score !== next.score || prev.best !== next.best) {
    $('best-value').textContent = String(Math.max(next.best, next.score));
  }
  if (force || prev.controlMode !== next.controlMode || (next.phase === 'ready' && prev.phase !== 'ready')) {
    updateReadyText();
  }
  if (force || prev.phase !== next.phase || prev.powerUpKey !== next.powerUpKey) updatePowerUpChips();
  const gameOverShown = next.phase === 'crashed' && next.showGameOver;
  if (force || gameOverShown !== (prev.phase === 'crashed' && prev.showGameOver)) {
    if (gameOverShown) fillGameOverCard();
    setShown($('game-over'), gameOverShown);
  }
  if (force || prev.canRestart !== next.canRestart) {
    $('menu-button').disabled = !next.canRestart;
    $('again-button').disabled = !next.canRestart;
  }
}

function fillGameOverCard() {
  $('final-score').textContent = String(hud.score);
  $('rank-line').hidden = lastRank === null;
  if (lastRank !== null) $('rank-text').textContent = `#${lastRank} on the scoreboard!`;
  const bestIcon = $('best-icon');
  if (hud.isNewBest) {
    bestIcon.innerHTML = Icons.svg('sparkles');
    $('best-text').textContent = 'New best!';
  } else {
    bestIcon.innerHTML = Icons.svg('crown');
    $('best-text').textContent = `Best ${hud.best}`;
  }
}

onClick($('menu-button'), () => goToMenu());
onClick($('again-button'), () => model.resetToReady());

// MARK: Controls demo

const demoCanvas = $('controls-demo');
const demoCtx = demoCanvas.getContext('2d');
let demoShown = false;

/**
 * Touch steering hint on the Get Ready screen in Glide and portrait: an
 * animated finger for Swipe, lit screen halves for Hold. Touch screens only,
 * like the app (which leaves it out on the Mac).
 */
function renderControlsDemo() {
  const show = activeScreen === 'game' && hud.phase === 'ready' && hud.isSteering && usesTouchWording();
  if (show !== demoShown) {
    demoShown = show;
    setShown(demoCanvas, show);
  }
  if (!show) return;
  const pw = Math.round(view.w * view.dpr), ph = Math.round(view.h * view.dpr);
  if (demoCanvas.width !== pw || demoCanvas.height !== ph) {
    demoCanvas.width = pw;
    demoCanvas.height = ph;
  }
  demoCtx.setTransform(1, 0, 0, 1, 0, 0);
  demoCtx.clearRect(0, 0, pw, ph);
  demoCtx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ControlsDemo.draw(demoCtx, view.w, view.h, Date.now() / 1000, !hud.isPortrait, steerControls());
}

// MARK: Navigation

function startGame() {
  model.resetToReady();
  showScreen('game');
}

function goToMenu() {
  model.resetToReady();
  showScreen('menu');
}

function showScreen(name) {
  const wasMenu = activeScreen === 'menu';
  activeScreen = name;
  setShown($('menu-screen'), name === 'menu');
  setShown($('game-screen'), name === 'game');
  if (name === 'menu') {
    // The menu is rebuilt each time it appears, so the turntable starts over facing front.
    if (!wasMenu) turntableStart = performance.now() / 1000;
    layoutMenu();
  }
}

// MARK: Scoreboard

const scoreboardTitle = new PanelTitle('HIGH SCORES');
$('scoreboard-title').appendChild(scoreboardTitle.canvas);

/** "1ST", "2ND", "3RD", "4TH"... */
function ordinal(n) {
  const mod100 = n % 100, mod10 = n % 10;
  let suffix = 'TH';
  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) suffix = 'ST';
    else if (mod10 === 2) suffix = 'ND';
    else if (mod10 === 3) suffix = 'RD';
  }
  return `${n}${suffix}`;
}

/** Each rank gets its own color along a rainbow, like an arcade board. */
function rankColor(rank) {
  const hues = [0.33, 0.47, 0.56, 0.63, 0.73, 0.82, 0.92, 0.99, 0.07, 0.14];
  return hsb(hues[(Math.max(rank, 1) - 1) % hues.length], 0.75, 1);
}

/** A neon glow in the text's own color, like a lit arcade screen. */
function arcadeStyle(node, rgb) {
  node.classList.add('arcade');
  node.style.setProperty('--glow', css(rgb));
  node.style.setProperty('--glow-strong', css(rgb, 0.85));
  node.style.setProperty('--glow-soft', css(rgb, 0.35));
}

function renderScoreboard() {
  const body = $('scoreboard-body');
  body.textContent = '';
  const entries = scoreboard.entries;
  if (entries.length === 0) {
    const empty = element('div', 'no-scores', 'NO SCORES YET\nFLY TO SET ONE!');
    arcadeStyle(empty, rankColor(3));
    body.appendChild(empty);
    return;
  }

  // The top score, shown large: 1ST place in arcade style.
  const best = entries[0];
  const hero = element('div', 'best-hero');
  hero.setAttribute('role', 'group');
  hero.setAttribute('aria-label', `Best score ${best.score}, ${entrySkin(best).name}`);
  const label = element('div', 'best-hero-label');
  label.append(element('span', '', ordinal(1)), element('span', '', entrySkin(best).name.toUpperCase()));
  arcadeStyle(label, rankColor(1));
  const score = element('div', 'best-hero-score', String(best.score));
  const date = element('div', 'best-hero-date',
    new Date(best.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }));
  hero.append(label, score, date);
  body.appendChild(hero);

  // The best is shown above, so the list starts at 2ND.
  if (entries.length > 1) {
    const list = element('div', 'score-list');
    entries.slice(1, Scoreboard.capacity).forEach((entry, i) => {
      const rank = i + 2;
      const row = element('div', 'score-row');
      row.setAttribute('aria-label', `${ordinal(rank)} place, ${entrySkin(entry).name}, ${entry.score}`);
      row.append(element('span', 'rank', ordinal(rank)), element('span', 'name', entrySkin(entry).name.toUpperCase()),
        element('span', 'spacer'), element('span', 'points', String(entry.score)));
      arcadeStyle(row, rankColor(rank));
      list.appendChild(row);
    });
    body.appendChild(list);
  }
}

/** Height inside an overlay's safe-area padding, for fitting its panel. */
function overlayRoom(overlay) {
  const style = getComputedStyle(overlay);
  return overlay.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
}

/**
 * Full size when it fits; a compact layout on short screens; scrolling only
 * as a last resort. Every row shares one text size: if the widest row
 * doesn't fit, the whole list steps down together.
 */
function fitScoreboard() {
  const panel = $('scoreboard');
  const available = overlayRoom($('scoreboard-panel')) - 24;
  panel.classList.remove('compact');
  fitScoreRows(false);
  if (panel.scrollHeight > available + 0.5) {
    panel.classList.add('compact');
    fitScoreRows(true);
  }
  const score = panel.querySelector('.best-hero-score');
  if (score) {
    // minimumScaleFactor(0.5): shrink the big number rather than overflow.
    score.style.fontSize = '';
    const base = parseFloat(getComputedStyle(score).fontSize);
    const room = score.parentElement.clientWidth;
    if (score.scrollWidth > room && room > 0) {
      score.style.fontSize = `${Math.max(base * 0.5, (base * room) / score.scrollWidth)}px`;
    }
  }
}

function fitScoreRows(compact) {
  const list = $('scoreboard').querySelector('.score-list');
  if (!list) return;
  for (const size of compact ? [17, 15, 13] : [19, 17, 15]) {
    list.style.setProperty('--row-size', `${size}px`);
    if ([...list.children].every((row) => row.scrollWidth <= row.clientWidth + 0.5)) return;
  }
}

function openScoreboard() {
  showsScoreboard = true;
  renderScoreboard();
  setShown($('scoreboard-panel'), true);
  fitScoreboard();
  $('scoreboard').scrollTop = 0;
  $('scoreboard').focus({ preventScroll: true });
}

function closeScoreboard() {
  showsScoreboard = false;
  setShown($('scoreboard-panel'), false);
}

for (const closer of $('scoreboard-panel').querySelectorAll('[data-close]')) onClick(closer, () => closeScoreboard());

// MARK: Settings

/** Builds a segmented picker (a radio group with a sliding thumb). Returns its update function. */
function segmented(container, ids, names, current, onChange) {
  container.style.setProperty('--count', String(ids.length));
  const buttons = ids.map((id, i) => {
    const button = element('button', 'segment', names[i]);
    button.type = 'button';
    button.setAttribute('role', 'radio');
    onClick(button, () => onChange(id));
    container.appendChild(button);
    return button;
  });
  container.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const index = ids.indexOf(current());
    const next = ids[Math.max(0, Math.min(ids.length - 1, index + (e.key === 'ArrowLeft' ? -1 : 1)))];
    onChange(next);
    buttons[ids.indexOf(next)].focus();
  });
  return () => {
    const index = ids.indexOf(current());
    container.style.setProperty('--index', String(index));
    buttons.forEach((button, i) => {
      button.setAttribute('aria-checked', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
    });
  };
}

const updateModePicker = segmented($('mode-picker'), MODE_LOCK_IDS, MODE_LOCK_IDS.map((id) => ModeLock[id].name),
  () => Settings.modeLock, (id) => {
    Settings.set('modeLock', id);
    updateSettingsPanel();
  });

const updateLandscapePicker = segmented($('landscape-picker'), LANDSCAPE_STYLE_IDS,
  LANDSCAPE_STYLE_IDS.map((id) => LandscapeStyle[id].name), () => Settings.landscapeStyle, (id) => {
    Settings.set('landscapeStyle', id);
    updateSettingsPanel();
  });

const updateGlidePicker = segmented($('glide-picker'), STEER_CONTROLS_IDS,
  STEER_CONTROLS_IDS.map((id) => SteerControls[id].name), () => Settings.glideControls, (id) => {
    Settings.set('glideControls', id);
    updateSettingsPanel();
    updateReadyText();
  });

const updatePortraitPicker = segmented($('portrait-picker'), STEER_CONTROLS_IDS,
  STEER_CONTROLS_IDS.map((id) => SteerControls[id].name), () => Settings.portraitControls, (id) => {
    Settings.set('portraitControls', id);
    updateSettingsPanel();
    updateReadyText();
  });

/** Shows or hides a setting that only applies to some game modes (it slides in and out). */
function setRowShown(row, shown) {
  if (!shown && row.contains(document.activeElement)) $('settings').focus({ preventScroll: true });
  row.classList.toggle('collapsed', !shown);
  row.setAttribute('aria-hidden', String(!shown));
}

/** Touch steering only matters on touch screens (the app hides it on the Mac). */
function hasTouch() {
  return matchMedia('(any-pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

const updateDifficultyPicker = segmented($('difficulty-picker'), DIFFICULTY_IDS,
  DIFFICULTY_IDS.map((id) => Difficulty[id].name), () => Settings.difficulty, (id) => {
    Settings.set('difficulty', id);
    updateSettingsPanel();
  });

function updateSettingsPanel() {
  updateModePicker();
  updateLandscapePicker();
  updateGlidePicker();
  updatePortraitPicker();
  updateDifficultyPicker();
  $('mode-detail').textContent = ModeLock[Settings.modeLock].detail;
  $('landscape-detail').textContent = LandscapeStyle[Settings.landscapeStyle].detail;
  $('glide-detail').textContent = controlsDetail(Settings.glideControls, 'up or down');
  $('portrait-detail').textContent = controlsDetail(Settings.portraitControls, 'left or right');
  // Rows that don't apply are hidden: Landscape controls when the game can't
  // play landscape, Glide controls unless Glide can come up, Portrait controls
  // when the game can't play portrait. The touch controls only show on touch
  // screens (the app leaves them out on the Mac).
  setRowShown($('landscape-row'), Settings.modeLock !== 'portrait');
  setRowShown($('glide-row'), hasTouch() && Settings.modeLock !== 'portrait' && Settings.landscapeStyle === 'glide');
  setRowShown($('portrait-row'), hasTouch() && Settings.modeLock !== 'landscape');
  if (showsSettings) fitSettings();
  $('difficulty-detail').textContent = Difficulty[Settings.difficulty].detail;
  $('sound-toggle').checked = Settings.soundEnabled;
  const slider = $('volume-slider');
  slider.value = String(Settings.soundVolume);
  slider.style.setProperty('--fill', `${Settings.soundVolume * 100}%`);
  slider.disabled = !Settings.soundEnabled;
  $('volume-row').classList.toggle('disabled', !Settings.soundEnabled);
  // Haptics are only offered where the browser can vibrate (the app shows them on iPhone only).
  $('haptics-row').hidden = !canVibrate();
  $('haptics-toggle').checked = Settings.haptics;
  $('shake-toggle').checked = Settings.screenShake;
}

$('sound-toggle').addEventListener('change', (e) => {
  Settings.set('soundEnabled', e.target.checked);
  applySoundSettings();
  updateSettingsPanel();
});
$('volume-slider').addEventListener('input', (e) => {
  Settings.set('soundVolume', clamp(Number(e.target.value), 0, 1));
  e.target.style.setProperty('--fill', `${Settings.soundVolume * 100}%`);
  applySoundSettings();
});
// Play a sample when the slider is released.
$('volume-slider').addEventListener('change', () => {
  if (typeof sound !== 'undefined') sound.play('flap');
});
$('haptics-toggle').addEventListener('change', (e) => Settings.set('haptics', e.target.checked));
$('shake-toggle').addEventListener('change', (e) => Settings.set('screenShake', e.target.checked));

function applySoundSettings() {
  if (typeof sound === 'undefined') return;
  sound.isEnabled = Settings.soundEnabled;
  sound.volume = Settings.soundVolume;
}

/**
 * Full size when it fits; without the descriptions on shorter screens;
 * scrolling only as a last resort (SwiftUI ViewThatFits). Each layout is
 * measured on an invisible copy in its final state, so rows that are still
 * sliding in or out don't throw the choice off.
 */
function fitSettings() {
  const panel = $('settings');
  const available = overlayRoom($('settings-panel')) - 24;
  const heightFor = (compact) => {
    const copy = panel.cloneNode(true);
    for (const node of [copy, ...copy.querySelectorAll('[id]')]) node.removeAttribute('id');
    copy.classList.add('instant');
    copy.classList.toggle('compact', compact);
    copy.setAttribute('aria-hidden', 'true');
    copy.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;` +
      `width:${panel.offsetWidth}px;max-height:none;margin:0;overflow:visible;transition:none;`;
    panel.parentElement.appendChild(copy);
    const height = copy.offsetHeight;
    copy.remove();
    return height;
  };
  panel.classList.toggle('compact', heightFor(false) > available + 0.5);
}

function openSettings() {
  showsSettings = true;
  // Rows start in place when the panel opens; they only slide while it's open.
  const panel = $('settings');
  panel.classList.add('instant');
  updateSettingsPanel();
  void panel.offsetWidth;
  panel.classList.remove('instant');
  setShown($('settings-panel'), true);
  $('settings').scrollTop = 0;
  $('settings').focus({ preventScroll: true });
}

function closeSettings() {
  showsSettings = false;
  setShown($('settings-panel'), false);
}

for (const closer of $('settings-panel').querySelectorAll('[data-close]')) onClick(closer, () => closeSettings());

// MARK: Reset confirmation

let focusBeforeAlert = null;

function openResetAlert() {
  confirmsReset = true;
  focusBeforeAlert = document.activeElement;
  setShown($('reset-alert'), true);
  $('alert').focus({ preventScroll: true });
}

function closeResetAlert() {
  confirmsReset = false;
  setShown($('reset-alert'), false);
  if (focusBeforeAlert && focusBeforeAlert.isConnected && focusBeforeAlert !== document.body) {
    focusBeforeAlert.focus({ preventScroll: true });
  } else {
    $('settings').focus({ preventScroll: true });
  }
}

onClick($('reset-button'), () => openResetAlert());
onClick($('alert-cancel'), () => closeResetAlert());
onClick($('alert-reset'), () => {
  scoreboard.reset();
  model.resetBest();
  lastRank = null;
  closeResetAlert();
});

// MARK: Input

/** Pointers currently held: pointerId → { x, y, startX, startY }. */
const heldPointers = new Map();
/** The pointer that steers (the latest one pressed). */
let steeringPointer = null;

/** How far the finger must slide to count as a swipe, or to reverse one (CSS pixels). */
const SWIPE_THRESHOLD = 6;
/** How long a swipe keeps steering after the finger last moved, in seconds. */
const SWIPE_HOLD_TIME = 0.25;
/** Swipes move faster than holding, so each swipe covers more ground. */
const SWIPE_SPEED_SCALE = 1.3;

/**
 * Swipe steering: once the finger slides, its movement (not which half it's
 * on) sets the direction. `extreme` is the furthest point reached in the
 * current direction, for detecting a reversal.
 */
const swipe = { active: false, direction: 0, extreme: 0 };

function resetSwipe() {
  swipe.active = false;
  swipe.direction = 0;
  swipe.extreme = 0;
}

/** Whether an event target is a control or panel that handles its own input. */
function isInteractive(target) {
  return target instanceof Element && !!target.closest('button, input, select, label, .overlay');
}

/**
 * Steering direction for a pointer: −1 toward the top (glide) or left
 * (portrait), 1 the other way. Hold controls steer by which half of the
 * screen the finger is on. Swipe controls steer by the direction the finger
 * slides, reversing when it moves back, and don't move until it slides.
 */
function steeringDirection(p) {
  // Glide steers vertically; portrait steers horizontally.
  const position = hud.isPortrait ? p.x : p.y;
  const start = hud.isPortrait ? p.startX : p.startY;
  const extent = hud.isPortrait ? view.w : view.h;

  if (steerControls() === 'hold') return position < extent / 2 ? -1 : 1;
  if (!swipe.active) {
    // Not swiping yet: wait for the finger to slide.
    if (Math.abs(position - start) < SWIPE_THRESHOLD) return 0;
    swipe.active = true;
    swipe.direction = position < start ? -1 : 1;
    swipe.extreme = position;
  }
  if (swipe.direction < 0) {
    swipe.extreme = Math.min(swipe.extreme, position);
    if (position - swipe.extreme > SWIPE_THRESHOLD) {
      swipe.direction = 1;
      swipe.extreme = position;
    }
  } else {
    swipe.extreme = Math.max(swipe.extreme, position);
    if (swipe.extreme - position > SWIPE_THRESHOLD) {
      swipe.direction = -1;
      swipe.extreme = position;
    }
  }
  return swipe.direction;
}

/** Steers from a held pointer. Swipes only steer while the finger is moving: each movement keeps him going briefly, then he levels out. */
function steerWith(p) {
  const swiping = steerControls() === 'swipe';
  model.steer(steeringDirection(p), swiping ? SWIPE_HOLD_TIME : null, swiping ? SWIPE_SPEED_SCALE : 1);
}

// Flap: flap on press (not release), like Flappy Bird.
// Portrait and Glide: hold a half of the screen, or swipe, to steer.
appEl.addEventListener('pointerdown', (e) => {
  if (typeof sound !== 'undefined') sound.unlock();
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (isInteractive(e.target)) return;
  if (activeScreen !== 'game') return;
  e.preventDefault();
  try {
    appEl.setPointerCapture(e.pointerId);
  } catch (err) {
    // Not capturable (already released); ignore.
  }
  const wasPressed = heldPointers.size > 0;
  const p = { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY };
  heldPointers.set(e.pointerId, p);
  if (hud.isSteering) {
    steeringPointer = e.pointerId;
    resetSwipe();
    // Swipe controls don't move on a plain press, so a touch on its own starts
    // (or restarts) the run.
    if (steerControls() === 'swipe' && !wasPressed) model.flap();
    steerWith(p);
  } else {
    model.flap();
  }
});

window.addEventListener('pointermove', (e) => {
  const p = heldPointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  if (e.pointerId === steeringPointer && activeScreen === 'game' && hud.isSteering) steerWith(p);
});

function releasePointer(e) {
  if (!heldPointers.delete(e.pointerId)) return;
  if (e.pointerId !== steeringPointer) return;
  resetSwipe();
  const remaining = [...heldPointers.entries()];
  if (remaining.length > 0) {
    // Another finger still down takes over: holding keeps steering toward its
    // side; a swipe starts again from where it is.
    const [id, p] = remaining[remaining.length - 1];
    steeringPointer = id;
    p.startX = p.x;
    p.startY = p.y;
    if (hud.isSteering) {
      if (steerControls() === 'hold') steerWith(p);
      else model.steer(0);
    }
  } else {
    steeringPointer = null;
    if (hud.isSteering) model.steer(0);
  }
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);

// Touch browsers only let audio start on the end of a tap, so unlock there too.
for (const type of ['pointerup', 'touchend', 'click']) {
  window.addEventListener(type, () => {
    if (typeof sound !== 'undefined') sound.unlock();
  }, { passive: true });
}

/** Arrow keys held for steering, in the order they were pressed. */
const heldKeys = new Set();

function isFormControl(target) {
  return target instanceof Element && !!target.closest('button, input, select, textarea');
}

/** Steers toward the most recently pressed arrow that's still held (or straight if none). */
function steerFromKeys() {
  const keys = [...heldKeys];
  const last = keys[keys.length - 1];
  model.steer(last === undefined ? 0 : last === 'ArrowLeft' || last === 'ArrowUp' ? -1 : 1);
}

window.addEventListener('keydown', (e) => {
  if (typeof sound !== 'undefined') sound.unlock();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key;

  if (key === 'Escape') {
    if (confirmsReset) closeResetAlert();
    else if (showsSettings) closeSettings();
    else if (showsScoreboard) closeScoreboard();
    else if (activeScreen === 'game' && hud.phase !== 'playing') goToMenu();
    return;
  }
  if (confirmsReset) return; // The alert only answers its own buttons (and Escape).
  const inField = e.target instanceof Element && e.target.matches('input, select, textarea');

  // ↑ / ↓ glide up and down in Glide; otherwise ↑ plays or flaps like Space.
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (inField) return;
    if (hud.controlMode === 'glide' && activeScreen === 'game' && !showsSettings && !showsScoreboard) {
      e.preventDefault();
      if (e.repeat) return;
      heldKeys.delete(key);
      heldKeys.add(key);
      steerFromKeys();
      return;
    }
    if (key !== 'ArrowUp' || showsSettings || showsScoreboard) return;
    e.preventDefault();
    if (e.repeat) return;
    if (activeScreen === 'menu') startGame();
    else model.flap();
    return;
  }

  if (key === ' ' || key === 'Spacebar' || key === 'Enter') {
    // A focused control (reached with Tab) gets its own Space/Enter.
    if (isFormControl(e.target)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (showsSettings) closeSettings();
    else if (showsScoreboard) closeScoreboard();
    else if (activeScreen === 'menu') startGame();
    else model.flap();
    return;
  }

  // ← / → cycle the pilot's colors on the menu, and steer while held in portrait play.
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    if (inField) return;
    if (activeScreen === 'menu') {
      if (showsSettings || showsScoreboard) return;
      e.preventDefault();
      cycleSkin(key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (!hud.isPortrait) return;
    e.preventDefault();
    if (e.repeat) return;
    heldKeys.delete(key);
    heldKeys.add(key);
    steerFromKeys();
  }
});

window.addEventListener('keyup', (e) => {
  if (!heldKeys.delete(e.key)) return;
  if (activeScreen !== 'game' || !hud.isSteering) return;
  // If another arrow is still held, keep steering that way.
  steerFromKeys();
});

window.addEventListener('blur', () => {
  heldKeys.clear();
  heldPointers.clear();
  steeringPointer = null;
  resetSwipe();
  if (model.usesSteering) model.steer(0);
});

// Long presses shouldn't open menus or select anything mid-game.
appEl.addEventListener('contextmenu', (e) => e.preventDefault());

// MARK: Layout

function resize() {
  const w = Math.max(1, appEl.clientWidth);
  const h = Math.max(1, appEl.clientHeight);
  // Cap the backing store at 2x: the cave is mostly soft gradients and glows.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.w = w;
  view.h = h;
  view.dpr = dpr;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  if (hud.phase === 'ready') updateReadyText();
  if (activeScreen === 'menu') layoutMenu();
  if (showsScoreboard) fitScoreboard();
  if (showsSettings) fitSettings();
}

new ResizeObserver(resize).observe(appEl);
window.addEventListener('resize', resize);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);

// MARK: Frame loop

function frame(nowMs) {
  requestAnimationFrame(frame);
  const now = nowMs / 1000;

  // Portrait plays the same world rotated a quarter turn, so the pilot climbs
  // upward and steers left/right. Landscape flaps, or glides if chosen in Settings.
  const portrait = usesPortrait(Settings.modeLock, view.w, view.h);
  model.setControlMode(portrait ? 'steer' : Settings.landscapeStyle === 'glide' ? 'glide' : 'flap');
  model.difficultyLevel = Difficulty[Settings.difficulty];
  const worldW = portrait ? view.h : view.w;
  const worldH = portrait ? view.w : view.h;

  // Step the simulation once per frame, then draw it. On the menu the cave
  // keeps scrolling behind the pilot.
  model.update(now, worldW / Math.max(worldH, 1));
  syncHUD();

  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  if (portrait) {
    // World "forward" (+x) points up the screen.
    ctx.translate(0, view.h);
    ctx.rotate(-Math.PI / 2);
  }
  renderer.showsPlayer = activeScreen === 'game';
  renderer.skin = PilotSkin[Settings.skin];
  renderer.screenShake = Settings.screenShake;
  renderer.draw(ctx, model, worldW, worldH);

  if (activeScreen === 'menu') renderTurntable(now);
  renderControlsDemo();
  PanelTitle.renderAll(now);
}

// MARK: Start

for (const node of document.querySelectorAll('[data-icon]')) {
  node.innerHTML = Icons.svg(node.dataset.icon);
}
updateSkinPicker(false);
updateSettingsPanel();
applySoundSettings();
resize();
showScreen(activeScreen);
updateGameOverlay(hud, hud, true);
warmSprites();
requestAnimationFrame(frame);
