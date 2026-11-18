# Jetman (HTML5)

A web port of [Jetman](https://github.com/ads1230/jetman), the SwiftUI neon cave flyer. It's plain `index.html`, `style.css` and JavaScript: Canvas 2D for all drawing (including a small software 3D renderer for the pilots), Web Audio for sound and `localStorage` for scores and settings. There are no frameworks, no build step and no image or audio assets.

## Play

Open `index.html` in a browser. It works straight from disk (`file://`) or from any static host, such as GitHub Pages.

- **Landscape (Flap):** click, tap or press Space (or ↑ / Enter) to fire the jetpack and flap through the cave, Flappy Bird style.
- **Landscape (Glide):** no gravity. Move up or down at a steady speed with ↑ / ↓, by holding the top or bottom half of the screen, or by swiping.
- **Portrait:** the same cave turned a quarter turn. The pilot climbs on his own; steer with ← / →, by holding the left or right half of the screen, or by swiping.
- **Swipe steering** (the default on touch screens): swipe toward where you want to go and he moves while your finger moves; slide back to reverse. **Hold** steering moves toward whichever half of the screen you're pressing.
- **Menu:** pick one of seven pilots (Navy, Stealth, Pink, Mecha, Vanguard, Joker, Hero) with the swatches or ← / →, then Play. The trophy opens the local top-5 board and the gear opens Settings.
- **Esc** closes panels and returns to the menu between runs.

### Power-ups

One power-up floats in the gap after a block every 10 to 15 blocks, and only one is in play at a time. Active ones show as chips under the score, with the seconds left.

- **Shield:** absorbs the next hit. A block it hits is destroyed, or you're nudged off the wall, followed by a short blinking grace period.
- **Mini Blocks** (8 s): blocks shrink.
- **Slow-Mo** (6 s): the cave scrolls slower.
- **Double Score** (8 s): points count twice as fast.
- **Ghost Walls** (10 s): the walls fade out and can't hurt you. They flicker back as a warning before it ends.
- **Ray Gun** (8 s): auto-fires laser bolts that blow up blocks.

### Settings

The settings match the app:

- Game mode: Auto, Landscape or Portrait.
- Landscape controls: Flap or Glide.
- Steering controls: Hold or Swipe. This only shows on touch screens, just as the app hides it on the Mac.
- Difficulty: Easy, Normal or Hard.
- Sound effects and volume.
- Haptics, only shown where the browser can vibrate, like Android Chrome.
- Screen shake.
- Reset Scores.

## Files

| File | What it does | Ported from |
|---|---|---|
| `index.html` | Page shell: game canvas and the menu, HUD, scoreboard, settings and alert overlays | `ContentView.swift` (views) |
| `style.css` | Liquid Glass style overlays, menu layouts, arcade scoreboard, settings controls | `ContentView.swift` (styling) |
| `js/util.js` | Math and color helpers, path shapes, the scenery hash and seeded RNG, `localStorage` wrapper | `GameRenderer.swift` (`hash`, `SeededGenerator`) |
| `js/skins.js` | Pilot skins, palettes and menu swatches | `PilotSkin.swift` |
| `js/settings.js` | Settings keys, mode lock and difficulty tuning | `GameSettings.swift` |
| `js/powerups.js` | Power-up kinds, durations, colors, tuning and their icons | `PowerUps.swift` |
| `js/model.js` | Simulation: physics, cave generation, blocks, collisions, power-ups, particles, scoring, Flap/Glide/portrait control modes | `GameModel.swift` |
| `js/renderer.js` | Draws the cave backdrop, walls, blocks, power-ups, bolts, shield, particles and pilot into the canvas | `GameRenderer.swift` |
| `js/pilot2d.js` | Flat 2D pilots for every skin (fallback if 3D sprites can't be made) | `GameRenderer.swift` (2D sprites) |
| `js/pilot3d.js` | Software 3D renderer: pilot meshes per skin, menu turntable, cached in-game side/back sprites | `PilotTurntableView.swift` |
| `js/logo.js` | Riveted two-tone panel lettering for JETMAN, GET READY, GAME OVER and HIGH SCORES | `JetmanLogo.swift` |
| `js/icons.js` | Inline SVG stand-ins for the SF Symbols the app uses | — |
| `js/scoreboard.js` | Local top-5 scores | `Scoreboard.swift` |
| `js/sound.js` | Flap, start, crash, high-score, power-up, shield-break and laser sounds synthesized at startup | `SoundEngine.swift` |
| `js/app.js` | Screens, HUD and power-up chips, hold/swipe/keyboard input, menu layout choice and the frame loop | `ContentView.swift` |

## Porting notes

- The simulation is a line-for-line port: the same world units (playfield 1 tall, cave opening 0.72), gravity, flap and fall speeds, scroll speed, block sizes and spacing, lane clearance, hitboxes, difficulty multipliers and particle counts. Scores, best score and the board are stored under the app's own keys (`jetman.best`, `jetman.scoreboard`, `jetman.settings.*`, `jetman.skin`).
- Scenery placement uses bit-exact ports of the app's 64-bit hash and SplitMix64 generator, so stalactites, crystals and dust motes are laid out the same way.
- SwiftUI's `.plusLighter` blending maps to Canvas `globalCompositeOperation = "lighter"`. Portrait mode draws the landscape world rotated −90°, like the app.
- The 3D pilots use the same meshes, camera, lights, shading and painter's-algorithm sorting as the Swift renderer. The menu turntable renders every frame; in game, each skin's side and back views are rendered once to an offscreen canvas and then rotated, with live 2D flames on top.
- The main menu picks the first of the app's four layouts that fits the window, like `ViewThatFits`. The scoreboard switches to its compact layout on short screens.
- Power-ups, Glide and swipe steering follow the app's code exactly: the spawn rules, timers, easing, shield grace, Ghost Walls push-back, Ray Gun fire rate, the 6 px swipe threshold, 0.25 s swipe hold and 1.3× swipe speed.
- Sounds use the same synthesis (filtered noise, sine sweeps, the C-E-G-C arpeggio) and the same six-voice pool. Browsers only allow audio after the first tap, click or key press.

### Differences from the app

- Game Center is not included: no sign-in, global leaderboards or score submission. Difficulty and reset text no longer mention it.
- Liquid Glass is approximated with CSS `backdrop-filter`, and SF Symbols (including the power-up icons) with simple inline SVGs.
- Haptics use `navigator.vibrate`, so they only work in browsers that support it (not iOS Safari).
- On-screen prompts say "Tap…" on touch screens and "Click or press Space…" elsewhere, matching the app's iOS and macOS wording.

## Hosting on GitHub Pages

In the repository's Settings → Pages, choose "Deploy from a branch", pick `main` and the `/ (root)` folder. GitHub Pages needs a public repository unless your plan includes Pages for private ones.
