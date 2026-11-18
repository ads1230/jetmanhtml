'use strict';

// The flat 2D pilot (port of the fallback sprite in GameRenderer.swift).
// Drawn facing right in "sprite units" (~32 wide), flying horizontally with
// the jetpack on his back. The 3D sprites replace it when they're available.

/**
 * Draws the pilot at the origin of `ctx`, which must already be translated,
 * rotated by the tilt and scaled to sprite units.
 */
function drawPilot2D(ctx, skin, time, thrusting) {
  ctx.save();
  ctx.lineJoin = 'miter';

  // Soft rim light so the pilot pops against the dark cave.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const aura = ctx.createRadialGradient(0, -3, 2, 0, -3, 24);
  aura.addColorStop(0, css(NEON_CYAN, 0.18));
  aura.addColorStop(1, CLEAR);
  ctx.fillStyle = aura;
  ellipsePath(ctx, -24, -18, 48, 30);
  ctx.fill();
  ctx.restore();

  // Jetpack flame (drawn first so it sits behind the nozzle). The hero flies
  // on his own, so he has no jetpack or flame.
  if (skin.id !== 'hero') {
    const flicker = 0.5 + 0.5 * Math.sin(time * 60);
    const length = thrusting ? 11 + flicker * 6 : 2.5 + flicker * 1.5;
    Pilot2D.flame(ctx, -12, -7.5, length);
  }

  switch (skin.id) {
    case 'vanguard': Pilot2D.vanguard(ctx, skin, thrusting); break;
    case 'joker': Pilot2D.joker(ctx, skin, thrusting); break;
    case 'hero': Pilot2D.hero(ctx, time); break;
    case 'mecha': Pilot2D.robot(ctx, skin, thrusting); break;
    default: Pilot2D.suited(ctx, skin, thrusting); break;
  }
  ctx.restore();
}

const Pilot2D = {
  fillRect(ctx, x, y, w, h, style) {
    ctx.fillStyle = style;
    ctx.fillRect(x, y, w, h);
  },

  plate(ctx, x, y, w, h, r, style) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = style;
    ctx.fill();
  },

  oval(ctx, x, y, w, h, style) {
    ellipsePath(ctx, x, y, w, h);
    ctx.fillStyle = style;
    ctx.fill();
  },

  line(ctx, x0, y0, x1, y1, width, style, cap = 'round') {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = width;
    ctx.lineCap = cap;
    ctx.strokeStyle = style;
    ctx.stroke();
  },

  vertical(ctx, y0, y1, c0, c1) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    return g;
  },

  /** The suited pilot (Navy, Stealth, Pink): flight suit, jet-fighter helmet and oxygen mask. */
  suited(ctx, skin, thrusting) {
    const navy = css(skin.suit), navyDark = css(skin.suitDark), accent = css(skin.accent);

    // Legs and boots.
    this.plate(ctx, -17, -1.5, 13, 5.5, 2.7, navyDark);
    this.plate(ctx, -20, -2, 4.5, 6.5, 1.8, accent);

    // Torso with a belt stripe.
    this.plate(ctx, -6, -4.5, 13, 9, 4, this.vertical(ctx, -4.5, 4.5, navy, navyDark));
    this.fillRect(ctx, -2, -4.5, 2, 9, accent);

    this.jetpack(ctx, skin, thrusting);

    // Arm reaching forward with a glove.
    this.line(ctx, 3, 0.5, 12, 3, 3.6, navy);
    this.oval(ctx, 11, 1.2, 3.8, 3.8, accent);

    // Jet-fighter flight helmet: shell with an accent stripe, mirrored visor,
    // side pivot knob, oxygen mask and a ribbed hose to the chest.
    const mask = css(MASK_COLOR);
    ctx.beginPath();
    ctx.moveTo(14, -0.6);
    ctx.quadraticCurveTo(10, 2.6, 5, 0.8);
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = mask;
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.setLineDash([0.5, 0.7]);
    ctx.strokeStyle = css(vscale(MASK_COLOR, 0.6));
    ctx.stroke();
    ctx.setLineDash([]);

    const shellGradient = ctx.createLinearGradient(8, -8.6, 14, 2.4);
    shellGradient.addColorStop(0, css(vmin1(vscale(skin.helmet, 1.07))));
    shellGradient.addColorStop(1, css(vscale(skin.helmet, 0.8)));
    this.oval(ctx, 5.2, -8.6, 11.8, 11, shellGradient);
    ctx.save();
    ellipsePath(ctx, 5.2, -8.6, 11.8, 11);
    ctx.clip();
    this.fillRect(ctx, 6, -9, 7, 1.5, accent);
    this.plate(ctx, 11.4, -7.4, 7, 4.4, 1.6, this.vertical(ctx, -7.4, -3, css(skin.visor.light), css(skin.visor.dark)));
    this.plate(ctx, 12.6, -6.8, 2.6, 0.8, 0.4, 'rgba(255,255,255,0.7)');
    ctx.restore();
    ellipsePath(ctx, 5.2, -8.6, 11.8, 11);
    ctx.lineWidth = 0.4;
    ctx.strokeStyle = css(vscale(skin.helmet, 0.6), 0.6);
    ctx.stroke();
    // Visor housing on top and the side pivot knob.
    this.plate(ctx, 9, -9.3, 6, 1.3, 0.65, css(vscale(skin.helmet, 0.82)));
    this.oval(ctx, 8.4, -5.6, 2.2, 2.2, css(vscale(skin.helmet, 0.65)));
    // Oxygen mask and valve.
    this.plate(ctx, 13.4, -3.4, 4.4, 3.6, 1.5, mask);
    this.oval(ctx, 16.2, -2.4, 1.8, 1.8, css(vscale(MASK_COLOR, 0.6)));
  },

  /** Vanguard: a sleek knight-style robot with white armor over a black frame, gold trim and glowing cyan strips. */
  vanguard(ctx, skin, thrusting) {
    const V = VanguardPalette;
    const armor = css(V.armor), armorShade = css(vscale(V.armor, 0.72));
    const frame = css(V.frame), gold = css(V.gold), line = css(V.line);
    const shaded = (x, y, w, h, r) => this.plate(ctx, x, y, w, h, r, this.vertical(ctx, y, y + h, armor, armorShade));
    const glow = (x, y, w, h, r) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      this.plate(ctx, x, y, w, h, r, line);
      ctx.restore();
    };

    // Legs: black thigh, white shin with gold knee and cyan strip, white foot.
    this.plate(ctx, -10, -1.5, 5.5, 5, 2, frame);
    shaded(-17.5, -2, 8.5, 6.5, 1.8);
    this.plate(ctx, -10.2, -1.6, 1.6, 5.6, 0.6, gold);
    glow(-16, 2.4, 5, 0.8, 0.4);
    shaded(-21, -2.8, 4.2, 8, 1.4);
    this.plate(ctx, -21, 3.4, 4.2, 1.8, 0.8, frame);

    // Chest: white plate, black lower frame, cyan strips, gold core.
    shaded(-6.5, -5, 14, 10, 2.6);
    this.plate(ctx, -6.5, 2.6, 14, 2.4, 1, frame);
    glow(-3, -3.6, 7, 0.7, 0.35);
    glow(-3, 0.4, 7, 0.7, 0.35);
    this.plate(ctx, 4.4, -2.2, 2.4, 2.4, 0.6, gold);

    this.jetpack(ctx, skin, thrusting);

    // Arm: white shoulder with gold rim, black joint, white gauntlet with a
    // cyan strip, black fist.
    this.line(ctx, 3, 0, 7, 1.5, 2.4, frame);
    shaded(6.5, -0.2, 7, 4.4, 1.6);
    glow(7.6, 3.0, 4.6, 0.6, 0.3);
    this.plate(ctx, 12.8, 0.3, 3.2, 3.4, 1, frame);
    shaded(-0.5, -4, 7, 4.8, 1.8);
    this.plate(ctx, -0.5, 0, 7, 0.9, 0.45, gold);

    // Head: knight-style helm. Gold blade sweeping back from the temple, white
    // shell with a crown ridge and pointed brow peak, black face plate with a
    // cyan eye, and an angular cheek guard with a vent light.
    const blade = ctx.createLinearGradient(11, -6, -3, -8.4);
    blade.addColorStop(0, gold);
    blade.addColorStop(1, css(vscale(V.gold, 0.7)));
    polygonPath(ctx, [[12, -6.8], [12, -4.4], [-3, -8.4]]);
    ctx.fillStyle = blade;
    ctx.fill();
    shaded(6, -9.2, 10, 9, 2.6);
    this.plate(ctx, 7, -10.2, 6.5, 1.4, 0.7, armor);
    this.plate(ctx, 11.6, -6.2, 4.6, 5, 1.4, frame);
    polygonPath(ctx, [[10.5, -8.6], [18.6, -7.2], [15.8, -6.2], [10.5, -6.6]]);
    ctx.fillStyle = armor;
    ctx.fill();
    ctx.lineWidth = 0.3;
    ctx.strokeStyle = armorShade;
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    polygonPath(ctx, [[12.6, -4.6], [16.2, -5.4], [16.2, -4.4], [12.6, -3.7]]);
    ctx.fillStyle = line;
    ctx.fill();
    ctx.restore();
    this.plate(ctx, 7.6, -4.6, 3.4, 4, 0.8, frame);
    glow(8.4, -3.4, 1.8, 0.6, 0.3);
    glow(8.4, -2.3, 1.8, 0.6, 0.3);
  },

  /** Joker: a playing-card jester in red, blue and yellow motley with a belled two-point hat, ruff collar and a grin. */
  joker(ctx, skin, thrusting) {
    const J = JokerPalette;
    const red = css(J.red), blue = css(J.blue), yellow = css(J.yellow), gold = css(J.gold);

    // Legs (blue) and a curled yellow boot with a toe bell.
    this.plate(ctx, -17, -1.5, 13, 5.5, 2.7, blue);
    ctx.beginPath();
    ctx.moveTo(-16, -2);
    ctx.lineTo(-16, 4.5);
    ctx.quadraticCurveTo(-22, 4.5, -22.5, -1.5);
    ctx.closePath();
    ctx.fillStyle = yellow;
    ctx.fill();
    this.oval(ctx, -23.6, -2.8, 2.4, 2.4, gold);

    // Harlequin tunic: front half blue, back half red, yellow belt and diamond.
    ctx.save();
    roundRectPath(ctx, -6, -4.5, 13, 9, 4);
    ctx.clip();
    this.fillRect(ctx, -6, -4.5, 6.5, 9, red);
    this.fillRect(ctx, 0.5, -4.5, 6.5, 9, blue);
    this.fillRect(ctx, -2, -4.5, 2, 9, yellow);
    polygonPath(ctx, [[3.5, -2.6], [5.6, 0], [3.5, 2.6], [1.4, 0]]);
    ctx.fillStyle = yellow;
    ctx.fill();
    ctx.restore();

    this.jetpack(ctx, skin, thrusting);

    // Arm (red) with a white glove.
    this.line(ctx, 3, 0.5, 12, 3, 3.6, red);
    this.oval(ctx, 11, 1.2, 3.8, 3.8, css(J.glove));

    // Ruff collar puffs.
    [-4.0, -1.6, 0.8, 3.2].forEach((y, i) => this.oval(ctx, 4.6, y - 1.5, 3, 3, [red, yellow, blue][i % 3]));

    // Head with a grin and rosy cheek.
    this.oval(ctx, 6, -7, 10.5, 10, css(SKIN_TONE));
    this.oval(ctx, 13, -4.4, 1.4, 1.8, rgba(0.1, 0.1, 0.1));
    this.oval(ctx, 11.4, -1.8, 2.4, 1.6, rgba(1, 0.55, 0.55));
    ctx.beginPath();
    ctx.moveTo(12.6, 0.4);
    ctx.quadraticCurveTo(14.8, 1.6, 16.2, -0.8);
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    ctx.strokeStyle = red;
    ctx.stroke();

    // Jester hat: split cap, yellow band, two floppy points with gold bells.
    ctx.beginPath();
    ctx.moveTo(8, -7);
    ctx.quadraticCurveTo(1, -14, -4, -9);
    ctx.quadraticCurveTo(3, -10, 10, -9.5);
    ctx.closePath();
    ctx.fillStyle = blue;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(11, -9.5);
    ctx.quadraticCurveTo(15, -17, 19, -11);
    ctx.quadraticCurveTo(16, -10, 15, -7);
    ctx.closePath();
    ctx.fillStyle = red;
    ctx.fill();
    this.oval(ctx, 6.2, -11, 9.8, 6, red);
    this.plate(ctx, 6, -6.6, 10.6, 1.6, 0.8, yellow);
    for (const [bx, by] of [[-4, -9], [19, -11]]) this.oval(ctx, bx - 1.3, by - 1.3, 2.6, 2.6, gold);
  },

  /** Hero: an original caped superhero in teal with a crimson cape, gloves and boots, gold belt and chevron emblem. */
  hero(ctx, time) {
    const H = HeroPalette;
    const suit = css(H.suit), suitDark = css(H.suitDark), cape = css(H.cape), gold = css(H.gold);

    // Cape streaming behind, rippling in the wind.
    const wave = Math.sin(time * 9) * 1.4;
    ctx.beginPath();
    ctx.moveTo(6, -4.5);
    ctx.quadraticCurveTo(-8, -9 - wave, -24, -6 + wave);
    ctx.quadraticCurveTo(-25, -2, -22, 1 - wave);
    ctx.quadraticCurveTo(-8, -3 + wave, 5, -1);
    ctx.closePath();
    const capeGradient = ctx.createLinearGradient(5, 0, -24, 0);
    capeGradient.addColorStop(0, cape);
    capeGradient.addColorStop(1, css(vscale(H.cape, 0.6)));
    ctx.fillStyle = capeGradient;
    ctx.fill();

    // Legs and crimson boots.
    this.plate(ctx, -17, -1.5, 13, 5.5, 2.7, suitDark);
    this.plate(ctx, -21, -2.2, 6.5, 7, 1.8, cape);

    // Torso with gold belt and chevron emblem.
    this.plate(ctx, -6, -4.5, 13, 9, 4, this.vertical(ctx, -4.5, 4.5, suit, suitDark));
    this.fillRect(ctx, -2, -4.5, 2, 9, gold);
    this.oval(ctx, 1.2, -2.6, 5.2, 5.2, gold);
    polygonPath(ctx, [[5.4, 0], [2.6, -1.8], [2.6, -0.8], [4, 0], [2.6, 0.8], [2.6, 1.8]]);
    ctx.fillStyle = cape;
    ctx.fill();

    // Arm with a crimson glove.
    this.line(ctx, 3, 0.5, 12, 3, 3.8, suit);
    this.oval(ctx, 11, 1.1, 4, 4, cape);

    // Head: skin, swept hair, domino mask with a white eye slit.
    this.oval(ctx, 6, -7.4, 10.5, 10.4, css(SKIN_TONE));
    ctx.save();
    ellipsePath(ctx, 6, -7.4, 10.5, 10.4);
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(5, -8);
    ctx.lineTo(17, -8);
    ctx.quadraticCurveTo(14, -4.4, 10, -4.6);
    ctx.lineTo(8.6, 1);
    ctx.lineTo(5, 1);
    ctx.closePath();
    ctx.fillStyle = css(H.hair);
    ctx.fill();
    this.plate(ctx, 11, -4.6, 7, 2.6, 1.2, css(H.mask));
    this.plate(ctx, 13.8, -4, 2, 1, 0.5, '#fff');
    ctx.restore();
  },

  /** Jetpack body, nozzle and status light, shared by every skin. */
  jetpack(ctx, skin, thrusting) {
    const body = ctx.createLinearGradient(0, -11, 0, -3.5);
    body.addColorStop(0, css(vmin1(vscale(skin.metal, 1.1))));
    body.addColorStop(1, css(vscale(skin.metal, 0.5)));
    roundRectPath(ctx, -9, -11, 12, 7.5, 2.5);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();
    this.plate(ctx, -12.5, -10, 4, 5, 1, rgba(0.22, 0.22, 0.22));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.oval(ctx, -0.8, -8.4, 2.2, 2.2, css(thrusting ? HOT_ORANGE : NEON_CYAN));
    ctx.restore();
  },

  /**
   * The mecha skin: a boxy robot painted like the logo. Sky blue to indigo
   * above the glowing white seam, pink to orange-red below it, dark navy
   * joints, and the logo's lamp colors for lights.
   */
  robot(ctx, skin, thrusting) {
    const upperLight = css(skin.helmet), upper = css(skin.suit), lower = css(skin.suitDark);
    const lowerDark = css(skin.accent), joint = css(skin.metal);
    const seam = css([0.06, 0.05, 0.16], 0.7);
    const glowFill = (draw) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      draw();
      ctx.restore();
    };
    const outline = (width) => {
      ctx.lineWidth = width;
      ctx.strokeStyle = seam;
      ctx.stroke();
    };

    // Legs: navy joint, shin armor fading pink to orange-red, orange-red feet.
    this.plate(ctx, -10, -1, 5, 4, 1.5, joint);
    const shin = ctx.createLinearGradient(-8.5, 0, -17.5, 0);
    shin.addColorStop(0, lower);
    shin.addColorStop(1, lowerDark);
    this.plate(ctx, -17.5, -2, 9, 6.5, 1.6, shin);
    this.plate(ctx, -21, -2.8, 4.5, 8, 1.2, lowerDark);
    outline(0.4);
    glowFill(() => this.plate(ctx, -10.5, 2.6, 2, 1.2, 0.5, css(LogoPalette.lampOrange)));

    // Chest: sky blue to indigo plating, pink hips below the glowing white
    // seam, and a green reactor lamp.
    this.plate(ctx, -6.5, -5, 14, 10, 2.2, this.vertical(ctx, -5, 1, upperLight, upper));
    outline(0.5);
    glowFill(() => this.fillRect(ctx, -6.5, 2.2, 14, 1, rgba(0.8, 0.98, 1)));
    this.plate(ctx, -6.5, 3.2, 14, 1.8, 0.8, lower);
    glowFill(() => this.plate(ctx, 4, -2.5, 2.6, 3, 0.8, css(LogoPalette.lampGreen)));

    this.jetpack(ctx, skin, thrusting);

    // Arm: sky-blue shoulder pad, indigo forearm armor and fist, navy joint.
    this.line(ctx, 3, 0, 7, 1.5, 2.4, joint);
    this.plate(ctx, 6.5, 0, 6.5, 4, 1.2, this.vertical(ctx, 0, 4, upperLight, upper));
    outline(0.4);
    this.plate(ctx, 12.2, 0.4, 3.4, 3.4, 1, upper);
    this.plate(ctx, 0, -3.5, 6.5, 4.5, 1.4, this.vertical(ctx, -3.5, 1, upperLight, upper));
    outline(0.4);

    // Boxy head with a glowing visor slit, jaw plate and antenna.
    this.line(ctx, 9, -9, 7, -14, 0.8, joint);
    glowFill(() => this.oval(ctx, 6, -15.2, 2.2, 2.2, css(LogoPalette.lampPink)));
    const headBottom = vmix(LogoPalette.topLight, LogoPalette.topDark, 0.45);
    this.plate(ctx, 5.5, -9.5, 11, 9.5, 2.2, this.vertical(ctx, -9.5, 0, upperLight, css(headBottom)));
    outline(0.5);
    glowFill(() => this.plate(ctx, 11, -6.8, 5.6, 2.2, 1, css(NEON_CYAN)));
    this.plate(ctx, 6.8, -6.5, 1.2, 3, 0.4, css([0.06, 0.05, 0.16], 0.8));
  },

  flame(ctx, nozzleX, nozzleY, length) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const shape = (scale) => {
      const half = 2.6 * scale;
      ctx.beginPath();
      ctx.moveTo(nozzleX, nozzleY - half);
      ctx.quadraticCurveTo(nozzleX - length * 0.5 * scale, nozzleY - half * 1.4, nozzleX - length * scale, nozzleY + 0.5);
      ctx.quadraticCurveTo(nozzleX - length * 0.5 * scale, nozzleY + half * 1.4, nozzleX, nozzleY + half);
      ctx.closePath();
    };
    shape(1);
    ctx.fillStyle = css(HOT_ORANGE, 0.85);
    ctx.fill();
    shape(0.6);
    ctx.fillStyle = rgba(1, 0.95, 0.75);
    ctx.fill();
    ctx.restore();
  },
};
