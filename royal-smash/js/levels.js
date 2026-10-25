/* ============================================================
   ROYAL SMASH! — Level Data (12 royal arenas)
   Coordinates are in a fixed 1280x720 design space.
   Ground surface at y = 640. Cannon sits on the left tower.
   object types: crate | stone | jar | orb | plank | ball | coin | crown
   ============================================================ */
(function (RS) {
  'use strict';

  const GROUND_Y = 640;

  // palette per theme: [primary, secondary, accent]
  const THEMES = {
    magenta: ['#ff2d95', '#00e5ff', '#ffd54a'],
    cyan:    ['#00e5ff', '#b537f2', '#7dff6a'],
    violet:  ['#b537f2', '#ff2d95', '#00e5ff'],
    lime:    ['#7dff6a', '#00e5ff', '#ffd54a'],
    amber:   ['#ffb02e', '#ff2d5e', '#00e5ff'],
    ice:     ['#5ad7ff', '#b537f2', '#ffffff'],
    rose:    ['#ff5e9c', '#ffd54a', '#00e5ff'],
    gold:    ['#ffd54a', '#ff2d95', '#7dff6a'],
  };

  /* helpers to describe structures compactly ------------------- */
  function pile(x, baseY, cols, rows, type, sx, sy, gap) {
    const out = []; gap = gap || 0;
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < rows; r++)
        out.push({ t: type, x: x + c * (sx + gap), y: baseY - sy / 2 - r * (sy + gap), w: sx, h: sy });
    return out;
  }
  function column(x, baseY, n, type, w, h, gap) {
    const out = []; gap = gap || 0;
    for (let r = 0; r < n; r++) out.push({ t: type, x, y: baseY - h / 2 - r * (h + gap), w, h });
    return out;
  }
  function row(x, baseY, n, type, w, h, gap) {
    const out = []; gap = gap || 0;
    for (let c = 0; c < n; c++) out.push({ t: type, x: x + c * (w + gap), y: baseY - h / 2, w, h });
    return out;
  }
  function arc(cx, cy, r, n, type, size, a0, a1) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * i / (n - 1);
      out.push({ t: type, x: cx + Math.cos(a) * r, y: cy - Math.sin(a) * r, s: size, rot: -a });
    }
    return out;
  }

  const levels = [];

  /* L1 — First Smash: intro tower */
  levels.push({
    name: 'First Smash', theme: 'magenta', par: 2,
    objs: [
      ...column(700, GROUND_Y, 3, 'crate', 64, 64, 2),
      ...column(780, GROUND_Y, 3, 'crate', 64, 64, 2),
      { t: 'plank', x: 740, y: GROUND_Y - 64 * 3 - 64 - 8, w: 200, h: 22 },
      { t: 'jar', x: 740, y: GROUND_Y - 64 * 3 - 64 - 22 - 44, s: 44 },
      { t: 'coin', x: 740, y: GROUND_Y - 64 * 3 - 64 - 22 - 130 },
      { t: 'crown', x: 900, y: GROUND_Y - 40 },
    ],
  });

  /* L2 — Twin Towers */
  levels.push({
    name: 'Twin Towers', theme: 'cyan', par: 2,
    objs: [
      ...column(640, GROUND_Y, 4, 'stone', 56, 56, 2),
      ...column(840, GROUND_Y, 4, 'stone', 56, 56, 2),
      { t: 'plank', x: 740, y: GROUND_Y - 56 * 4 - 74, w: 320, h: 24 },
      ...row(650, GROUND_Y - 56 * 4 - 74 - 24, 4, 'crate', 60, 60, 6),
      { t: 'jar', x: 740, y: GROUND_Y - 56 * 4 - 74 - 24 - 60 - 46, s: 46 },
      { t: 'coin', x: 560, y: 300 }, { t: 'coin', x: 950, y: 260 },
      { t: 'crown', x: 1010, y: GROUND_Y - 40 },
    ],
  });

  /* L3 — Glass House (jars everywhere) */
  levels.push({
    name: 'Glass House', theme: 'violet', par: 2,
    objs: [
      ...pile(600, GROUND_Y, 2, 1, 'jar', 56, 56, 30),
      { t: 'plank', x: 658, y: GROUND_Y - 56 - 30, w: 260, h: 20 },
      ...arc(658, GROUND_Y - 56 - 30 - 20, 70, 5, 'jar', 34, Math.PI * 0.15, Math.PI * 0.85).map(o => ({ ...o, y: GROUND_Y - 56 - 50 - 20 - Math.sin(0) * 0 })),
      ...column(760, GROUND_Y, 2, 'jar', 56, 56, 4),
      { t: 'orb', x: 658, y: GROUND_Y - 56 - 30 - 20 - 60, s: 40 },
      { t: 'coin', x: 658, y: 220 }, { t: 'coin', x: 560, y: 340 }, { t: 'coin', x: 760, y: 340 },
      { t: 'crown', x: 900, y: GROUND_Y - 40 },
    ],
  });

  /* L4 — The Keep */
  levels.push({
    name: 'The Keep', theme: 'lime', par: 3,
    objs: [
      ...column(560, GROUND_Y, 5, 'stone', 52, 52, 2),
      ...column(940, GROUND_Y, 5, 'stone', 52, 52, 2),
      { t: 'plank', x: 750, y: GROUND_Y - 52 * 5 - 70, w: 470, h: 26 },
      ...pile(620, GROUND_Y - 52 * 5 - 70 - 26, 4, 1, 'crate', 58, 58, 10),
      { t: 'jar', x: 700, y: GROUND_Y - 52 * 5 - 70 - 26 - 58 - 44, s: 44 },
      { t: 'jar', x: 800, y: GROUND_Y - 52 * 5 - 70 - 26 - 58 - 44, s: 44 },
      { t: 'orb', x: 750, y: GROUND_Y - 52 * 5 - 70 - 26 - 58 - 100, s: 44 },
      { t: 'coin', x: 750, y: 170 }, { t: 'coin', x: 640, y: 250 }, { t: 'coin', x: 860, y: 250 },
      { t: 'crown', x: 1080, y: GROUND_Y - 40 },
    ],
  });

  /* L5 — seesaw */
  levels.push({
    name: 'Seesaw Court', theme: 'amber', par: 2,
    objs: [
      { t: 'stone', x: 760, y: GROUND_Y - 40, w: 80, h: 80 },
      { t: 'plank', x: 760, y: GROUND_Y - 80 - 14, w: 420, h: 22, dyn: true },
      ...column(600, GROUND_Y - 80 - 28, 2, 'crate', 56, 56, 2),
      ...column(920, GROUND_Y - 80 - 28, 2, 'crate', 56, 56, 2),
      { t: 'jar', x: 600, y: GROUND_Y - 80 - 28 - 112 - 42, s: 42 },
      { t: 'jar', x: 920, y: GROUND_Y - 80 - 28 - 112 - 42, s: 42 },
      { t: 'coin', x: 760, y: 240 },
      { t: 'crown', x: 1040, y: GROUND_Y - 40 },
    ],
  });

  /* L6 — Pyramid of Power */
  levels.push({
    name: 'Pyramid of Power', theme: 'gold', par: 3,
    objs: [
      ...row(560, GROUND_Y, 5, 'stone', 62, 62, 4),
      ...row(592, GROUND_Y - 66, 4, 'crate', 62, 62, 4),
      ...row(624, GROUND_Y - 132, 3, 'crate', 62, 62, 4),
      ...row(656, GROUND_Y - 198, 2, 'jar', 56, 56, 6),
      { t: 'orb', x: 684, y: GROUND_Y - 264 - 30, s: 46 },
      { t: 'coin', x: 500, y: 260 }, { t: 'coin', x: 870, y: 210 },
      { t: 'crown', x: 1020, y: GROUND_Y - 40 }, { t: 'crown', x: 684, y: GROUND_Y - 380 },
    ],
  });

  /* L7 — Double Decker */
  levels.push({
    name: 'Double Decker', theme: 'ice', par: 3,
    objs: [
      ...column(560, GROUND_Y, 3, 'stone', 50, 50, 2),
      ...column(760, GROUND_Y, 3, 'stone', 50, 50, 2),
      ...column(960, GROUND_Y, 3, 'stone', 50, 50, 2),
      { t: 'plank', x: 660, y: GROUND_Y - 156 - 66, w: 300, h: 22 },
      { t: 'plank', x: 860, y: GROUND_Y - 156 - 66, w: 300, h: 22 },
      ...column(660, GROUND_Y - 156 - 66 - 22, 2, 'crate', 56, 56, 2),
      ...column(860, GROUND_Y - 156 - 66 - 22, 2, 'crate', 56, 56, 2),
      { t: 'plank', x: 760, y: GROUND_Y - 156 - 66 - 22 - 116 - 12, w: 340, h: 22 },
      ...row(640, GROUND_Y - 156 - 66 - 22 - 116 - 22 - 12, 3, 'jar', 52, 52, 24),
      { t: 'coin', x: 760, y: 150 }, { t: 'coin', x: 620, y: 220 }, { t: 'coin', x: 900, y: 220 },
      { t: 'crown', x: 1090, y: GROUND_Y - 40 },
    ],
  });

  /* L8 — Orb Cascade */
  levels.push({
    name: 'Orb Cascade', theme: 'rose', par: 3,
    objs: [
      { t: 'plank', x: 560, y: 360, w: 200, h: 18, angle: 0.22, static: true },
      { t: 'plank', x: 760, y: 440, w: 200, h: 18, angle: -0.22, static: true },
      { t: 'plank', x: 960, y: 360, w: 200, h: 18, angle: 0.22, static: true },
      ...arc(760, GROUND_Y, 130, 7, 'orb', 34, Math.PI * 0.1, Math.PI * 0.9),
      ...column(600, GROUND_Y, 2, 'jar', 50, 50, 4),
      ...column(920, GROUND_Y, 2, 'jar', 50, 50, 4),
      { t: 'coin', x: 560, y: 260 }, { t: 'coin', x: 960, y: 260 }, { t: 'coin', x: 760, y: 420 },
      { t: 'crown', x: 1080, y: GROUND_Y - 40 },
    ],
  });

  /* L9 — Fortress Wall */
  levels.push({
    name: 'Fortress Wall', theme: 'magenta', par: 4,
    objs: [
      ...pile(600, GROUND_Y, 3, 6, 'stone', 46, 46, 3),
      { t: 'plank', x: 646, y: GROUND_Y - 46 * 6 - 68, w: 260, h: 22 },
      ...row(540, GROUND_Y - 46 * 6 - 68 - 22, 3, 'crate', 56, 56, 12),
      { t: 'jar', x: 760, y: GROUND_Y - 40 },
      { t: 'jar', x: 830, y: GROUND_Y - 40 },
      { t: 'orb', x: 795, y: GROUND_Y - 46 * 6 - 68 - 22 - 56 - 40, s: 40 },
      { t: 'coin', x: 900, y: 300 }, { t: 'coin', x: 950, y: 220 },
      { t: 'crown', x: 1060, y: GROUND_Y - 40 }, { t: 'crown', x: 900, y: GROUND_Y - 40 },
    ],
  });

  /* L10 — Bowls & Bottles */
  levels.push({
    name: 'Bowls & Bottles', theme: 'cyan', par: 3,
    objs: [
      ...arc(640, 470, 90, 5, 'orb', 30, Math.PI * 1.15, Math.PI * 1.85),
      ...arc(880, 470, 90, 5, 'orb', 30, Math.PI * 1.15, Math.PI * 1.85),
      { t: 'plank', x: 760, y: GROUND_Y - 120, w: 420, h: 20, static: true },
      ...column(640, GROUND_Y - 120 - 10, 2, 'jar', 52, 52, 4),
      ...column(880, GROUND_Y - 120 - 10, 2, 'jar', 52, 52, 4),
      { t: 'crate', x: 760, y: GROUND_Y - 120 - 10 - 56 },
      { t: 'coin', x: 760, y: 180 }, { t: 'coin', x: 640, y: 240 }, { t: 'coin', x: 880, y: 240 },
      { t: 'crown', x: 1050, y: GROUND_Y - 40 },
    ],
  });

  /* L11 — Grand Cathedral */
  levels.push({
    name: 'Grand Cathedral', theme: 'violet', par: 4,
    objs: [
      ...column(560, GROUND_Y, 6, 'stone', 48, 48, 3),
      ...column(1000, GROUND_Y, 6, 'stone', 48, 48, 3),
      { t: 'plank', x: 780, y: GROUND_Y - 48 * 6 - 80, w: 560, h: 26 },
      ...column(640, GROUND_Y - 48 * 6 - 80 - 26, 3, 'crate', 54, 54, 3),
      ...column(920, GROUND_Y - 48 * 6 - 80 - 26, 3, 'crate', 54, 54, 3),
      { t: 'plank', x: 780, y: GROUND_Y - 48 * 6 - 80 - 26 - 168, w: 400, h: 24 },
      ...row(660, GROUND_Y - 48 * 6 - 80 - 26 - 168 - 24, 3, 'jar', 54, 54, 20),
      { t: 'orb', x: 780, y: GROUND_Y - 48 * 6 - 80 - 26 - 168 - 24 - 54 - 40, s: 44 },
      { t: 'coin', x: 780, y: 120 }, { t: 'coin', x: 660, y: 180 }, { t: 'coin', x: 900, y: 180 },
      { t: 'crown', x: 780, y: 60 },
      { t: 'crown', x: 1120, y: GROUND_Y - 40 },
    ],
  });

  /* L12 — Royal Finale */
  levels.push({
    name: 'Royal Finale', theme: 'gold', par: 5,
    objs: [
      ...column(520, GROUND_Y, 4, 'stone', 50, 50, 3),
      ...column(700, GROUND_Y, 4, 'stone', 50, 50, 3),
      ...column(880, GROUND_Y, 4, 'stone', 50, 50, 3),
      ...column(1060, GROUND_Y, 4, 'stone', 50, 50, 3),
      { t: 'plank', x: 610, y: GROUND_Y - 212, w: 260, h: 22 },
      { t: 'plank', x: 970, y: GROUND_Y - 212, w: 260, h: 22 },
      ...row(540, GROUND_Y - 212 - 22, 2, 'jar', 54, 54, 40),
      ...row(900, GROUND_Y - 212 - 22, 2, 'jar', 54, 54, 40),
      { t: 'plank', x: 790, y: GROUND_Y - 212 - 22 - 54 - 26, w: 560, h: 24 },
      ...arc(790, GROUND_Y - 212 - 22 - 54 - 26 - 24, 110, 7, 'orb', 30, Math.PI * 0.12, Math.PI * 0.88),
      ...column(790, GROUND_Y - 212 - 22 - 54 - 26 - 24 - 110, 2, 'crate', 56, 56, 3),
      { t: 'coin', x: 790, y: 130 }, { t: 'coin', x: 640, y: 190 }, { t: 'coin', x: 940, y: 190 },
      { t: 'coin', x: 520, y: 300 }, { t: 'coin', x: 1060, y: 300 },
      { t: 'crown', x: 790, y: 60 },
      { t: 'crown', x: 1180, y: GROUND_Y - 40 },
    ],
  });

  RS.levels = levels;
  RS.GROUND_Y = GROUND_Y;
  RS.THEMES = THEMES;
})(window.RS = window.RS || {});
