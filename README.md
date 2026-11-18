# Jetman (HTML5)

A web port of [Jetman](https://github.com/ads1230/jetman), the SwiftUI neon cave flyer. It's plain `index.html`, `style.css` and JavaScript: Canvas 2D for all drawing (including a small software 3D renderer for the pilots), Web Audio for sound and `localStorage` for scores and settings. There are no frameworks, no build step and no image or audio assets.

## Play

Open `index.html` in a browser. It works straight from disk (`file://`) or from any static host, such as GitHub Pages.

- **Landscape:** click, tap or press Space (or ↑ / Enter) to fire the jetpack and flap through the cave, Flappy Bird style.
- **Portrait:** the same cave turned a quarter turn. The pilot climbs on his own; hold the left or right half of the screen (or ← / →) to steer.
- **Menu:** pick one of seven pilots (Navy, Stealth, Pink, Mecha, Vanguard, Joker, Hero) with the swatches or ← / →, then Play. The trophy opens the local top-5 board and the gear opens Settings.
- **Esc** closes panels and returns to the menu between runs.

Settings match the app: game mode (Auto / Landscape / Portrait), difficulty (Easy / Normal / Hard), sound effects and volume, haptics (only shown where the browser can vibrate, like Android Chrome), screen shake and Reset Scores.

## Files

| File | What it does | Ported from |
|---|---|---|
| `index.html` | Page shell: game canvas and the menu, HUD, scoreboard, settings and alert overlays | `ContentView.swift` (views) |
| `style.css` | Liquid Glass style overlays, menu layouts, arcade scoreboard, settings controls | `ContentView.swift` (styling) |
| `js/util.js` | Math and color helpers, path shapes, the scenery hash and seeded RNG, `localStorage` wrapper | `GameRenderer.swift` (`hash`, `SeededGenerator`) |
| `js/skins.js` | Pilot skins, palettes and menu swatches | `PilotSkin.swift` |
| `js/settings.js` | Settings keys, mode lock and difficulty tuning | `GameSettings.swift` |
| `js/model.js` | Simulation: physics, cave generation, blocks, collisions, particles, scoring, control modes | `GameModel.swift` |
| `js/renderer.js` | Draws the cave backdrop, walls, blocks, particles and pilot into the canvas | `GameRenderer.swift` |
| `js/pilot2d.js` | Flat 2D pilots for every skin (fallback if 3D sprites can't be made) | `GameRenderer.swift` (2D sprites) |
| `js/pilot3d.js` | Software 3D renderer: pilot meshes per skin, menu turntable, cached in-game side/back sprites | `PilotTurntableView.swift` |
| `js/logo.js` | Riveted two-tone panel lettering for JETMAN, GET READY, GAME OVER and HIGH SCORES | `JetmanLogo.swift` |
| `js/icons.js` | Inline SVG stand-ins for the SF Symbols the app uses | — |
| `js/scoreboard.js` | Local top-5 scores | `Scoreboard.swift` |
| `js/sound.js` | Flap, start, crash and high-score sounds synthesized at startup | `SoundEngine.swift` |
| `js/app.js` | Screens, HUD, input, menu layout choice and the frame loop | `ContentView.swift` |

## Porting notes

- The simulation is a line-for-line port: the same world units (playfield 1 tall, cave opening 0.72), gravity, flap and fall speeds, scroll speed, block sizes and spacing, lane clearance, hitboxes, difficulty multipliers and particle counts. Scores, best score and the board are stored under the app's own keys (`jetman.best`, `jetman.scoreboard`, `jetman.settings.*`, `jetman.skin`).
- Scenery placement uses bit-exact ports of the app's 64-bit hash and SplitMix64 generator, so stalactites, crystals and dust motes are laid out the same way.
- SwiftUI's `.plusLighter` blending maps to Canvas `globalCompositeOperation = "lighter"`. Portrait mode draws the landscape world rotated −90°, like the app.
- The 3D pilots use the same meshes, camera, lights, shading and painter's-algorithm sorting as the Swift renderer. The menu turntable renders every frame; in game, each skin's side and back views are rendered once to an offscreen canvas and then rotated, with live 2D flames on top.
- The main menu picks the first of the app's four layouts that fits the window, like `ViewThatFits`. The scoreboard switches to its compact layout on short screens.
- Sounds use the same synthesis (filtered noise, sine sweeps, the C-E-G-C arpeggio) and the same six-voice pool. Browsers only allow audio after the first tap, click or key press.

### Differences from the app

- Game Center is not included: no sign-in, global leaderboards or score submission. Difficulty and reset text no longer mention it.
- Liquid Glass is approximated with CSS `backdrop-filter`, and SF Symbols with simple inline SVGs.
- Haptics use `navigator.vibrate`, so they only work in browsers that support it (not iOS Safari).
- On-screen prompts say "Tap…" on touch screens and "Click or press Space…" elsewhere, matching the app's iOS and macOS wording.

## Hosting on GitHub Pages

In the repository's Settings → Pages, choose "Deploy from a branch", pick `main` and the `/ (root)` folder. GitHub Pages needs a public repository unless your plan includes Pages for private ones.
