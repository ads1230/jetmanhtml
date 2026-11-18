'use strict';

// Inline SVG stand-ins for the SF Symbols the app uses. Each takes the
// surrounding text color (currentColor) and is sized by CSS.

const Icons = (() => {
  const stroke = (d, width = 2) =>
    `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

  /** Four-point sparkle centered at (cx, cy). */
  const sparkle = (cx, cy, r) =>
    `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;

  /** Gear with eight rounded teeth and a hole in the middle. */
  const gear = (() => {
    const teeth = 8, outer = 10.4, inner = 7.9, hole = 3.4;
    let d = '';
    for (let k = 0; k < teeth; k++) {
      const a = (k / teeth) * TAU;
      const half = TAU / teeth / 2;
      const pts = [[inner, a - half * 0.95], [outer, a - half * 0.5], [outer, a + half * 0.5], [inner, a + half * 0.95]];
      for (const [r, angle] of pts) {
        const x = (12 + Math.cos(angle) * r).toFixed(2), y = (12 + Math.sin(angle) * r).toFixed(2);
        d += (d ? 'L' : 'M') + x + ' ' + y;
      }
    }
    d += 'Z';
    d += `M${12 + hole} 12a${hole} ${hole} 0 1 0 ${-hole * 2} 0a${hole} ${hole} 0 1 0 ${hole * 2} 0Z`;
    return `<path d="${d}" fill-rule="evenodd" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>`;
  })();

  const paths = {
    play: '<path d="M7.5 4.6v14.8a1.1 1.1 0 0 0 1.68.93l11.7-7.4a1.1 1.1 0 0 0 0-1.86L9.18 3.67A1.1 1.1 0 0 0 7.5 4.6z"/>',
    xmark: stroke('M6.5 6.5l11 11M17.5 6.5l-11 11', 2.6),
    trophy: '<path d="M7 3h10v6.6a5 5 0 0 1-10 0z"/>' +
      stroke('M7 5.4H4.4c0 2.9 1.4 4.6 3.6 4.9M17 5.4h2.6c0 2.9-1.4 4.6-3.6 4.9', 1.8) +
      '<rect x="10.9" y="14.2" width="2.2" height="3.6"/><rect x="7.4" y="17.6" width="9.2" height="3.2" rx="1.1"/>',
    gear,
    flame: '<path d="M12.3 2.2c.5 3 2.5 4.6 4 6.6 1.3 1.7 2.2 3.5 2.2 5.6 0 4-2.9 7.1-6.5 7.1s-6.5-3.1-6.5-7.1' +
      'c0-2.6 1.3-4.6 2.8-6.1.1 1.7.9 3 2.1 3.7-.4-3.9 1.1-7 1.9-9.8z"/>',
    crown: '<path d="M3.2 7.6l4.5 4.1L12 4.9l4.3 6.8 4.5-4.1-1.9 10H5.1z"/><rect x="5.1" y="18.6" width="13.8" height="2.2" rx="1.1"/>',
    house: '<path d="M12 2.9l9.3 7.9-1.3 1.5-1.4-1.2V20a1.1 1.1 0 0 1-1.1 1.1h-3.9v-6.3h-3.2v6.3H6.5A1.1 1.1 0 0 1 5.4 20v-8.9' +
      'l-1.4 1.2-1.3-1.5z"/>',
    arrowClockwise: stroke('M19 12a7 7 0 1 1-7-7', 2.3) + '<path d="M11.2 1.6L16.4 5l-5.2 3.4z"/>',
    sparkles: `<path d="${sparkle(9.5, 13.5, 7.5)}${sparkle(18.3, 5.6, 3.6)}${sparkle(18.6, 18.4, 2.6)}"/>`,
    speaker: '<path d="M2.6 8.4h4.1l5.8-4.9v17l-5.8-4.9H2.6a1.1 1.1 0 0 1-1.1-1.1V9.5a1.1 1.1 0 0 1 1.1-1.1z"/>',
    speakerWave: '<path d="M1.3 8.6h3.6L10 4.1v15.8l-5.1-4.5H1.3a.9.9 0 0 1-.9-.9V9.5a.9.9 0 0 1 .9-.9z"/>' +
      stroke('M13.4 9.2a4 4 0 0 1 0 5.6M16.5 6.5a7.8 7.8 0 0 1 0 11M19.6 3.8a11.6 11.6 0 0 1 0 16.4', 1.9),
    trash: stroke('M4.5 6.5h15M9.5 6.5V4.6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.9M6.5 6.5l.9 12.7a1.6 1.6 0 0 0 1.6 1.5h6' +
      'a1.6 1.6 0 0 0 1.6-1.5l.9-12.7M10 10.5v6.5M14 10.5v6.5', 1.7),
  };

  /** Markup for an icon by name. */
  function svg(name, className = 'icon') {
    return `<svg class="${className}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${paths[name]}</svg>`;
  }

  return { svg };
})();
