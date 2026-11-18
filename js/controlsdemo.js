'use strict';

// Animated hint on the "Get Ready" screen showing how to steer on a touch
// screen (port of ControlsDemo.swift).
//
// - Swipe: a finger slides back and forth along the steering axis, leaving a
//   trail, with chevrons at each end.
// - Hold: the two halves of the screen light up in turn, each with a finger
//   pressing it and a "HOLD" label pointing the way that side moves.

const ControlsDemo = (() => {
  const accent = [0.31, 0.96, 1.0];
  const monoFont = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

  /**
   * A hand with the index finger pointing straight up (24 x 24 box; the
   * fingertip is at TIP). Drawn tilted to point up and to the left, standing
   * in for the SF Symbol hand.point.up.left.fill.
   */
  const hand = new Path2D('M9 3.2a1.7 1.7 0 0 1 3.4 0V11h.1a1.6 1.6 0 0 1 3.2.3v.2a1.6 1.6 0 0 1 3.1.4v.4' +
    'a1.5 1.5 0 0 1 2.9.6V17c0 3.3-2.6 5.8-6 5.8h-1.5c-1.9 0-3.4-.8-4.6-2.3L5 15.3a1.6 1.6 0 0 1 2.3-2.2L9 14.6z');
  const TIP = [10.7, 1.5];
  const HAND_TILT = -0.55;

  /** CSS easeInOut (SwiftUI `.easeInOut`), a cubic Bézier with control points (0.42, 0) and (0.58, 1). */
  function easeInOut(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const curve = (t, a, b) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 20; i++) {
      t = (lo + hi) / 2;
      if (curve(t, 0.42, 0.58) < x) lo = t;
      else hi = t;
    }
    return curve(t, 0, 1);
  }

  /** Draws the hand `size` px tall with its fingertip at (x, y). */
  function drawHand(ctx, x, y, size, alpha, shadow) {
    const scale = size / 24;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(HAND_TILT);
    ctx.scale(scale, scale);
    ctx.translate(-TIP[0], -TIP[1]);
    if (shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 6;
    }
    ctx.fillStyle = rgba(1, 1, 1, alpha);
    ctx.fill(hand);
    ctx.restore();
  }

  /** A filled circle with an optional glow in the accent color. */
  function dot(ctx, x, y, diameter, alpha, glowAlpha = 0, glowRadius = 0) {
    ctx.save();
    if (glowAlpha > 0) {
      ctx.shadowColor = css(accent, glowAlpha);
      ctx.shadowBlur = glowRadius * 1.5;
    }
    ctx.fillStyle = css(accent, alpha);
    ctx.beginPath();
    ctx.arc(x, y, diameter / 2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** A bold chevron (SF chevron.up/down/left/right at title2 bold) pointing along (dx, dy). */
  function chevron(ctx, x, y, dx, dy) {
    const along = 4, across = 7;
    ctx.save();
    ctx.strokeStyle = css(accent);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - dx * along - dy * across, y - dy * along - dx * across);
    ctx.lineTo(x + dx * along, y + dy * along);
    ctx.lineTo(x - dx * along + dy * across, y - dy * along + dx * across);
    ctx.stroke();
    ctx.restore();
  }

  function swipeDemo(ctx, w, h, t, vertical) {
    // The pilot sits left of center in landscape and low in portrait, so the
    // demo goes to the right (landscape) or below him (portrait).
    const cx = vertical ? w * 0.68 : w * 0.5;
    const cy = vertical ? h * 0.52 : h * 0.88;
    const travel = vertical ? Math.min(h * 0.2, 90) : Math.min(w * 0.28, 110);
    const along = (offset) => (vertical ? [cx, cy + offset] : [cx + offset, cy]);
    // Ease-in-out sweep from one end to the other and back.
    const [fx, fy] = along(Math.sin(t * 2.2) * travel);

    // Track, with chevrons at each end.
    ctx.fillStyle = css(accent, 0.12);
    const length = travel * 2 + 10;
    roundRectPath(ctx, vertical ? cx - 5 : cx - length / 2, vertical ? cy - length / 2 : cy - 5,
      vertical ? 10 : length, vertical ? length : 10, 5);
    ctx.fill();
    const [ax, ay] = along(-travel - 26);
    const [bx, by] = along(travel + 26);
    chevron(ctx, ax, ay, vertical ? 0 : -1, vertical ? -1 : 0);
    chevron(ctx, bx, by, vertical ? 0 : 1, vertical ? 1 : 0);

    // Fading trail behind the finger.
    for (let step = 1; step < 6; step++) {
      const [x, y] = along(Math.sin(t * 2.2 - step * 0.12) * travel);
      dot(ctx, x, y, 18 - step * 2, 0.35 - step * 0.06);
    }

    // Touch point and finger.
    dot(ctx, fx, fy, 22, 0.45, 1, 8);
    drawHand(ctx, fx + 3, fy + 3, 40, 1, true);
  }

  /** An arrow (SF arrow.up/down/left/right at headline size) pointing along (dx, dy). */
  function arrow(ctx, x, y, dx, dy, style) {
    const half = 7, head = 5;
    ctx.save();
    ctx.strokeStyle = style;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - dx * half, y - dy * half);
    ctx.lineTo(x + dx * half, y + dy * half);
    ctx.moveTo(x + dx * half - dx * head - dy * head, y + dy * half - dy * head - dx * head);
    ctx.lineTo(x + dx * half, y + dy * half);
    ctx.lineTo(x + dx * half - dx * head + dy * head, y + dy * half - dy * head + dx * head);
    ctx.stroke();
    ctx.restore();
  }

  /** One half of the screen: a softly lit zone with a "HOLD" label and finger. `first` is the top half (landscape) or left half (portrait). */
  function holdZone(ctx, w, h, vertical, first, amount, press) {
    const hx = vertical ? 0 : first ? 0 : w / 2;
    const hy = vertical ? (first ? 0 : h / 2) : 0;
    const hw = vertical ? w : w / 2;
    const hh = vertical ? h / 2 : h;
    const mix = (inactive, active) => inactive + (active - inactive) * amount;

    // A gradient highlight: faint at the top of the half, building to full
    // strength at the bottom (portrait), or from the middle of the screen out
    // to the edge (landscape).
    if (amount > 0) {
      const [x0, y0, x1, y1] = vertical
        ? (first ? [0, hy + hh, 0, hy] : [0, hy, 0, hy + hh])
        : [0, 0, 0, h];
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, css(accent, 0.03 * amount));
      g.addColorStop(1, css(accent, 0.10 * amount));
      ctx.fillStyle = g;
      ctx.fillRect(hx, hy, hw, hh);
    }

    // Labels sit near the outer edge, away from the pilot and the prompt.
    const lx = vertical ? w * 0.84 : first ? w * 0.22 : w * 0.78;
    const ly = vertical ? (first ? h * 0.28 : h * 0.72) : h * 0.88;
    // The finger (56 tall) above the label (about 22 tall), 6 apart, centered on the label point.
    const fingerY = ly - 42 + 28;
    const labelY = ly + 42 - 11;

    dot(ctx, lx, fingerY, 26, mix(0.12, 0.45), amount, 10);
    drawHand(ctx, lx + 2, fingerY + 2, 36 * press, mix(0.35, 1), false);

    // "HOLD" with an arrow pointing the way this side moves.
    const color = css(accent, mix(0.4, 1));
    ctx.save();
    ctx.font = `900 17px ${monoFont}`;
    ctx.textBaseline = 'middle';
    const text = 'HOLD';
    const textWidth = ctx.measureText(text).width;
    const iconWidth = 17, gap = 6;
    const left = lx - (iconWidth + gap + textWidth) / 2;
    if (amount > 0) {
      ctx.shadowColor = css(accent, 0.8 * amount);
      ctx.shadowBlur = 9;
    }
    ctx.fillStyle = color;
    ctx.fillText(text, left + iconWidth + gap, labelY + 1);
    const [dx, dy] = vertical ? [0, first ? -1 : 1] : [first ? -1 : 1, 0];
    arrow(ctx, left + iconWidth / 2, labelY, dx, dy, color);
    ctx.restore();
  }

  function holdDemo(ctx, w, h, t, vertical) {
    // Alternate sides every 1.2 s, easing between them over half a second.
    const turn = Math.floor(t / 1.2);
    const firstActive = turn % 2 === 0;
    const local = t - turn * 1.2;
    const fade = easeInOut(local / 0.5);
    // Press bounce at the start of each turn (cut short when it ends at 0.18 s).
    const press = local < 0.18 ? 1 - 0.15 * fade : 1;
    holdZone(ctx, w, h, vertical, true, firstActive ? fade : 1 - fade, firstActive ? press : 1);
    holdZone(ctx, w, h, vertical, false, firstActive ? 1 - fade : fade, firstActive ? 1 : press);
  }

  /**
   * Draws the demo filling a w x h area at time `t` seconds. `vertical` is
   * landscape Glide (up/down); otherwise portrait (left/right).
   */
  function draw(ctx, w, h, t, vertical, controls) {
    if (controls === 'hold') holdDemo(ctx, w, h, t, vertical);
    else swipeDemo(ctx, w, h, t, vertical);
  }

  return { draw };
})();
