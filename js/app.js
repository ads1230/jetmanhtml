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
let activeScreen = 'game';
/** Where the last run placed on the scoreboard, if it made it. */
let lastRank = null;
/** Size of the whole view in CSS pixels. */
const view = { w: 1, h: 1, dpr: 1 };

// MARK: HUD state

/**
 * The small slice of game state the overlays depend on. The DOM is only
 * touched when one of these values changes, not on every frame.
 */
let hud = {
  phase: 'ready', score: 0, best: model.best, isNewBest: false, showGameOver: false,
  canRestart: false, crashCount: 0, flapCount: 0, isSteering: false,
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
    isSteering: model.controlMode === 'steer',
  };
  const prev = hud;
  hud = next;
  if (next.flapCount !== prev.flapCount) onFlap();
  if (next.crashCount !== prev.crashCount) onCrash();
  if (next.phase !== prev.phase) onPhaseChange();
  updateGameOverlay(prev, next);
}

// MARK: Events from the model

function onFlap() {
  if (typeof sound !== 'undefined') sound.play('flap');
  haptic('light');
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

/** Haptics: a light tap per flap and a heavier bump on a crash (where the browser can vibrate). */
function haptic(weight) {
  if (!Settings.haptics || !canVibrate()) return;
  try {
    navigator.vibrate(weight === 'heavy' ? 35 : 8);
  } catch (e) {
    // Vibration can be blocked; ignore.
  }
}

function canVibrate() {
  return typeof navigator.vibrate === 'function' && matchMedia('(pointer: coarse)').matches;
}

// MARK: In-game overlays

const readyTitle = new PanelTitle('GET READY');
$('ready-title').appendChild(readyTitle.canvas);
const gameOverTitle = new PanelTitle('GAME OVER');
$('game-over-title').appendChild(gameOverTitle.canvas);

/** Shows or hides an overlay element, dropping keyboard focus from anything it hides. */
function setShown(element, shown) {
  if (!shown && element.contains(document.activeElement)) document.activeElement.blur();
  element.classList.toggle('is-hidden', !shown);
}

/** Touch screens get "Tap" wording; keyboards and mice get "Click or press Space". */
function usesTouchWording() {
  return matchMedia('(hover: none) and (pointer: coarse)').matches;
}

function promptText(steering) {
  if (usesTouchWording()) return steering ? 'Hold left or right to fly' : 'Tap to fly';
  return steering ? 'Hold ← or → to fly' : 'Click or press Space to fly';
}

function howToPlayText(steering) {
  if (usesTouchWording()) {
    return steering
      ? 'Hold left or right to steer as you climb.\nDodge the walls and blocks.'
      : 'Tap to fire the jetpack.\nDodge the walls and blocks.';
  }
  return steering
    ? 'Hold ← or → to steer as you climb.\nDodge the walls and blocks.'
    : 'Click or press Space to fire the jetpack.\nDodge the walls and blocks.';
}

function updateReadyText() {
  $('prompt').textContent = promptText(hud.isSteering);
  $('how-to').textContent = howToPlayText(hud.isSteering);
  // In portrait the pilot sits low on screen; keep the prompt above him.
  $('ready-card').style.setProperty('--ready-bottom', hud.isSteering ? `${Math.round(view.h * 0.38)}px` : '40px');
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
  if (force || prev.isSteering !== next.isSteering || (next.phase === 'ready' && prev.phase !== 'ready')) {
    updateReadyText();
  }
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

// MARK: Navigation

function startGame() {
  model.resetToReady();
  showScreen('game');
}

function goToMenu() {
  model.resetToReady();
  // The menu arrives in the next stage; until then, start over at Get Ready.
  showScreen('game');
}

function showScreen(name) {
  activeScreen = name;
  setShown($('game-screen'), name === 'game');
}

$('menu-button').addEventListener('click', (e) => {
  if (e.detail > 0) e.currentTarget.blur();
  goToMenu();
});
$('again-button').addEventListener('click', (e) => {
  if (e.detail > 0) e.currentTarget.blur();
  model.resetToReady();
});

// MARK: Input

/** Pointers currently held, for steering: pointerId → x. */
const heldPointers = new Map();
let steeringPointer = null;

/** Whether an event target is a control or panel that handles its own input. */
function isInteractive(target) {
  return target instanceof Element && !!target.closest('button, input, select, label, .panel, .alert');
}

function steerToward(x) {
  model.steer(x < view.w / 2 ? -1 : 1);
}

// Landscape: flap on press (not release), like Flappy Bird.
// Portrait: hold the left or right half of the screen to steer.
appEl.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (isInteractive(e.target)) return;
  if (activeScreen !== 'game') return;
  e.preventDefault();
  if (hud.isSteering) {
    heldPointers.set(e.pointerId, e.clientX);
    steeringPointer = e.pointerId;
    steerToward(e.clientX);
  } else {
    model.flap();
  }
});

window.addEventListener('pointermove', (e) => {
  if (!heldPointers.has(e.pointerId)) return;
  heldPointers.set(e.pointerId, e.clientX);
  if (e.pointerId === steeringPointer && activeScreen === 'game' && hud.isSteering) steerToward(e.clientX);
});

function releasePointer(e) {
  if (!heldPointers.delete(e.pointerId)) return;
  if (e.pointerId !== steeringPointer) return;
  // Another finger still down keeps steering toward its side.
  const remaining = [...heldPointers.entries()];
  if (remaining.length > 0 && hud.isSteering) {
    const [id, x] = remaining[remaining.length - 1];
    steeringPointer = id;
    steerToward(x);
  } else {
    steeringPointer = null;
    if (hud.isSteering) model.steer(0);
  }
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);

/** Arrow keys held for steering. */
const heldArrows = new Set();

function isFormControl(target) {
  return target instanceof Element && !!target.closest('button, input, select, textarea');
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key;
  if (key === ' ' || key === 'Spacebar' || key === 'ArrowUp' || key === 'Enter') {
    // A focused control (reached with Tab) gets its own Space/Enter.
    if ((key === ' ' || key === 'Enter') && isFormControl(e.target)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (activeScreen === 'menu') startGame();
    else model.flap();
  } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
    if (isFormControl(e.target) && e.target.matches('input, select, textarea')) return;
    const direction = key === 'ArrowLeft' ? -1 : 1;
    if (activeScreen !== 'game' || !hud.isSteering) return;
    e.preventDefault();
    heldArrows.add(direction);
    model.steer(direction);
  } else if (key === 'Escape') {
    if (activeScreen === 'game' && hud.phase !== 'playing') goToMenu();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const direction = e.key === 'ArrowLeft' ? -1 : 1;
  if (!heldArrows.delete(direction)) return;
  if (activeScreen !== 'game' || !hud.isSteering) return;
  // If the other arrow is still held, keep steering that way.
  model.steer(heldArrows.size > 0 ? [...heldArrows][heldArrows.size - 1] : 0);
});

window.addEventListener('blur', () => {
  heldArrows.clear();
  heldPointers.clear();
  steeringPointer = null;
  if (model.controlMode === 'steer') model.steer(0);
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
}

new ResizeObserver(resize).observe(appEl);
window.addEventListener('resize', resize);

// MARK: Frame loop

function frame(nowMs) {
  requestAnimationFrame(frame);
  const now = nowMs / 1000;

  // Portrait plays the same world rotated a quarter turn, so the pilot climbs
  // upward and steers left/right.
  const portrait = usesPortrait(Settings.modeLock, view.w, view.h);
  model.setControlMode(portrait ? 'steer' : 'flap');
  model.difficultyLevel = Difficulty[Settings.difficulty];
  const worldW = portrait ? view.h : view.w;
  const worldH = portrait ? view.w : view.h;

  // Step the simulation once per frame, then draw it.
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

  PanelTitle.renderAll(now);
}

// MARK: Start

for (const element of document.querySelectorAll('[data-icon]')) {
  element.innerHTML = Icons.svg(element.dataset.icon);
}
resize();
showScreen(activeScreen);
updateGameOverlay(hud, hud, true);
requestAnimationFrame(frame);
