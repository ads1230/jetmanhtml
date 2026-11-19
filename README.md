# Jetman (HTML5)

A web port of [Jetman](https://github.com/ads1230/jetman), the SwiftUI neon cave flyer. It's plain `index.html`, `style.css` and JavaScript: Canvas 2D for all drawing (including a small software 3D renderer for the pilots), Web Audio for sound and `localStorage` for scores and settings. There are no frameworks, no build step and no image or audio assets.

## Play

Open `index.html` in a browser. It works straight from disk (`file://`) or from any static host, such as GitHub Pages.

- **Landscape (Flap):** click, tap or press Space (or ↑ / Enter) to fire the jetpack and flap through the cave, Flappy Bird style.
- **Landscape (Glide):** no gravity. Move up or down at a steady speed with ↑ / ↓, by holding the top or bottom half of the screen, or by swiping.
- **Portrait:** the same cave turned a quarter turn. The pilot climbs on his own; steer with ← / →, by holding the left or right half of the screen, or by swiping.
- **Touch steering:** with **Hold**, he moves toward whichever half of the screen you're pressing. With **Swipe**, he moves the way you swipe, while your finger moves, and sliding back reverses him. Portrait and Glide each have their own choice: portrait starts on Hold and Glide on Swipe. The Get Ready capsule just says "Tap to start". On touch screens, the Get Ready screen in Glide and portrait shows an animated hint for the chosen controls: a sliding finger for Swipe, or the two screen halves lighting up in turn for Hold.
- **Menu:** pick one of seven pilots (Navy, Stealth, Pink, Mecha, Vanguard, Joker, Hero) with the swatches or ← / →, then Play. The trophy opens the local top-5 board and the gear opens Settings.
- **Esc** closes panels and returns to the menu between runs.

### Speed and levels

- Runs start at 85% of each mode's speed and get a notch faster every 10 seconds of play (Slow-Mo stretches the wait), up to 12 notches, about 1.56× the tuned speed after two minutes. A **SPEED UP** banner marks each notch. Portrait climbs at 1.4 playfield units a second on Normal before the ramp.
- Points also move you through levels: level 2 at 500 points, then each level needs 300 more than the one before (500, 800, 1100…). The cave stays the same; its colors, scenery and drifting motes crossfade over 1.6 seconds, with a chirp and a **LEVEL** banner naming the new look:
  1. **Crystal Cave:** the original violet cave with cyan and pink crystals.
  2. **Battle Station:** a grey space-station interior with plated walls, conduits, towering superstructure, red warning lights and armoured blocks.
  3. **Magma Core:** red rock, orange light and rising embers.
  4. **Frost Moon:** icy blue with falling snow.
  5. **Toxic Planet:** green and violet, with lime motes drifting up.

  After level 5 the looks repeat.

### Power-ups

One power-up floats in the gap after a block every 10 to 15 blocks, and only one is in play at a time. Active ones show as chips under the score, with the seconds left.

- **Shield:** absorbs the next hit. A block it hits is destroyed, or you're nudged off the wall, followed by a short blinking grace period.
- **Mini Blocks** (8 s): blocks shrink.
- **Slow-Mo** (6 s): the cave scrolls slower.
- **Double Score** (8 s): points count twice as fast.
- **Ghost Walls** (10 s): the walls fade out and can't hurt you. They flicker back as a warning before it ends.
- **Ray Gun** (8 s): auto-fires laser bolts that blow up blocks.
- **Brake:** instantly knocks the speed back down two notches, with a **BRAKE** banner. It only turns up once you're three notches up, and three times as often from six notches.

### Settings

The settings match the app:

- Game mode: Auto, Landscape or Portrait.
- Landscape controls: Flap or Glide. Hidden when the game is locked to portrait.
- Glide controls and Portrait controls: Hold or Swipe for each steering mode. Each row only shows when its mode can come up, and only on touch screens, just as the app leaves them out on the Mac. Rows slide in and out as you change the game mode.
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
| `js/levelthemes.js` | Speed ramp and level pacing, and the five level looks (colors, scenery style, motes) | `LevelThemes.swift` |
| `js/model.js` | Simulation: physics, cave generation, blocks, collisions, power-ups, speed ramp, levels, particles, scoring, Flap/Glide/portrait control modes | `GameModel.swift` |
| `js/renderer.js` | Draws the backdrop (cave or station scenery in the level's colors), walls, blocks, power-ups, bolts, shield, particles and pilot into the canvas | `GameRenderer.swift` |
| `js/pilot2d.js` | Flat 2D pilots for every skin (fallback if 3D sprites can't be made) | `GameRenderer.swift` (2D sprites) |
| `js/pilot3d.js` | Software 3D renderer: pilot meshes per skin, menu turntable, cached in-game side/back sprites | `PilotTurntableView.swift` |
| `js/logo.js` | Riveted two-tone panel lettering for JETMAN, GET READY, GAME OVER and HIGH SCORES | `JetmanLogo.swift` |
| `js/icons.js` | Inline SVG stand-ins for the SF Symbols the app uses | — |
| `js/scoreboard.js` | Local top-5 scores | `Scoreboard.swift` |
| `js/sound.js` | Flap, start, crash, high-score, power-up, shield-break and laser sounds synthesized at startup | `SoundEngine.swift` |
| `js/controlsdemo.js` | Animated touch steering hint on the Get Ready screen (Swipe and Hold) | `ControlsDemo.swift` |
| `js/app.js` | Screens, HUD, power-up chips and run banners, hold/swipe/keyboard input, menu layout choice and the frame loop | `ContentView.swift` |

## Porting notes

- The simulation is a line-for-line port: the same world units (playfield 1 tall, cave opening 0.72), gravity, flap and fall speeds, scroll speed, block sizes and spacing, lane clearance, hitboxes, difficulty multipliers and particle counts. Scores, best score and the board are stored under the app's own keys (`jetman.best`, `jetman.scoreboard`, `jetman.settings.*`, `jetman.skin`).
- Scenery placement uses bit-exact ports of the app's 64-bit hash and SplitMix64 generator, so stalactites, crystals and dust motes are laid out the same way.
- SwiftUI's `.plusLighter` blending maps to Canvas `globalCompositeOperation = "lighter"`. Portrait mode draws the landscape world rotated −90°, like the app.
- The 3D pilots use the same meshes, camera, lights, shading and painter's-algorithm sorting as the Swift renderer. The menu turntable renders every frame; in game, each skin's side and back views are rendered once to an offscreen canvas and then rotated, with live 2D flames on top.
- The main menu picks the first of the app's four layouts that fits the window, like `ViewThatFits`. The scoreboard switches to its compact layout on short screens.
- Power-ups, Glide and swipe steering follow the app's code exactly: the spawn rules, timers, easing, shield grace, Ghost Walls push-back, Ray Gun fire rate, the 6 px swipe threshold, 0.25 s swipe hold and 1.3× swipe speed.
- The speed ramp, Brake and levels do too: the notch timing and easing, steering that speeds up by half as much as the cave, the level thresholds, the smoothstep crossfade between looks and the run banners' wording, timing and sizes.
- Sounds use the same synthesis (filtered noise, sine sweeps, the C-E-G-C arpeggio) and the same six-voice pool. Browsers only allow audio after the first tap, click or key press.

### Performance

Browsers that draw canvases on the CPU, Safari among them, pay for every pixel of every gradient each frame. So the web version draws the same picture more cheaply:

- The back wall's gradient is drawn as 128 thin solid bands (neighbours differ by at most one colour level), and the vignette is a CSS layer over the canvas. Together they were about half the cost of a frame.
- The panel lettering caches the parts that never change and redraws only the seam glow, blinking lights and shine.
- Each in-game pilot sprite is resampled once to its on-screen size, so each frame only rotates it.
- The 3D renderer grows each face by 0.3 units to hide seams between faces, instead of outlining every face with a hairline. That made the menu turntable about 2.5× cheaper to draw.
- The game canvas draws at up to 2× the page's resolution. If more than one frame in ten runs slower than 40 fps, it steps down (as far as 0.75×) until frames keep up, separately for the menu and the game; on the menu the turntable first drops to 30 fps. On a 120 Hz display that keeps missing frames, drawing holds a steady 60 fps instead.

### Differences from the app

- Game Center is not included: no sign-in, global leaderboards or score submission. Difficulty and reset text no longer mention it.
- Liquid Glass is approximated with CSS `backdrop-filter`, and SF Symbols (including the power-up icons) with simple inline SVGs.
- Haptics use `navigator.vibrate`, so they only work in browsers that support it (not iOS Safari).
- On-screen prompts say "Tap…" on touch screens and "Click or press Space…" elsewhere, matching the app's iOS and macOS wording.
- On slower devices the cave may be drawn below the screen's full resolution, and the menu turntable may turn at 30 fps (see Performance).

## Hosting on GitHub Pages

In the repository's Settings → Pages, choose "Deploy from a branch", pick `main` and the `/ (root)` folder. GitHub Pages needs a public repository unless your plan includes Pages for private ones.
