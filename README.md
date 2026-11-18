# Jetman (HTML5)

A web port of [Jetman](https://github.com/ads1230/jetman), the SwiftUI neon cave flyer. Plain `index.html`, `style.css` and JavaScript: Canvas 2D for drawing, Web Audio for sound, `localStorage` for scores and settings. No frameworks, no build step.

## Play

Open `index.html` in a browser. It also works from any static host, such as GitHub Pages.

- **Landscape:** click, tap or press Space (or ↑ / Enter) to fire the jetpack and flap through the cave.
- **Portrait:** the same cave turned a quarter turn. The pilot climbs on his own; hold the left or right half of the screen (or ← / →) to steer.
- Esc returns to the menu between runs.

## Status

Ported in stages:

1. Gameplay: simulation, cave renderer, input, HUD, Get Ready and Game Over cards. **Done.**
2. Menu, scoreboard and settings.
3. 3D pilots and sounds.
