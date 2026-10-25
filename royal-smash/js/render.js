/* ============================================================
   ROYAL SMASH! — Neon Renderer (canvas 2D, glow style)
   Design space: 1280x720. Everything drawn with neon strokes,
   additive glow layers, particles and a synthwave backdrop.
   ============================================================ */
(function (RS) {
  'use strict';

  const DW = 1280, DH = 720;

  /* ---------- color utils ---------- */
  function hexRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    const [r, g, b] = hexRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  function mix(h1, h2, t) {
    const a = hexRgb(h1), b = hexRgb(h2);
    const m = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  }

  /* ---------- offscreen buffers ---------- */
  let sceneBuf = null, glowBuf = null, tmpCv = null;
  function ensureBuffers() {
    if (!sceneBuf) {
      sceneBuf = document.createElement('canvas');
      glowBuf = document.createElement('canvas');
      sceneBuf.width = glowBuf.width = DW;
      sceneBuf.height = glowBuf.height = DH;
    }
  }

  /* ---------- path helpers ---------- */
  function polyPath(ctx, verts) {
    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------- object styling ---------- */
  function bodyColors(b, theme) {
    const P = theme.pal;
    switch (b.type) {
      case 'crate': return { line: P[0], fill: rgba(P[0], 0.10), inner: P[0] };
      case 'plank': return { line: P[1], fill: rgba(P[1], 0.10), inner: P[1] };
      case 'stone': return { line: '#9d7bff', fill: 'rgba(157,123,255,0.09)', inner: '#cbb4ff' };
      case 'jar':   return { line: '#5ad7ff', fill: 'rgba(90,215,255,0.10)', inner: '#eaffff' };
      case 'orb':   return { line: '#7dff6a', fill: 'rgba(125,255,106,0.12)', inner: '#eaffe8' };
      case 'coin':  return { line: '#ffd54a', fill: 'rgba(255,213,74,0.14)', inner: '#fff3c4' };
      case 'crown': return { line: '#ffd54a', fill: 'rgba(255,213,74,0.12)', inner: '#ffe9a0' };
      case 'ball':  return { line: '#eef7ff', fill: 'rgba(125,249,255,0.25)', inner: '#7df9ff' };
      case 'chandelier': return { line: '#ffb02e', fill: 'rgba(255,176,46,0.15)', inner: '#ffd54a' };
      default:      return { line: P[2], fill: rgba(P[2], 0.1), inner: P[2] };
    }
  }

  /* ---------- main draw of one body onto scene buffer ---------- */
  function drawBody(ctx, b, theme, time) {
    const c = bodyColors(b, theme);
    const verts = RS.worldVerts(b);
    const wob = b.flash > 0 ? 1 : 0;
    ctx.save();
    ctx.lineJoin = 'round';

    // subtle pulsing when idle-destroyable
    const pulse = 0.75 + 0.25 * Math.sin(time * 2 + b.id);

    if (b.type === 'coin') {
      const r = b.size;
      const sq = Math.abs(Math.cos(time * 2.2 + b.id)); // spinning coin illusion
      ctx.save();
      ctx.translate(b.p.x, b.p.y);
      ctx.scale(Math.max(0.18, sq), 1);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,213,74,0.22)'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = c.line; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.lineWidth = 2; ctx.strokeStyle = c.inner; ctx.stroke();
      ctx.restore();
      ctx.restore(); return;
    }

    if (b.type === 'crown') {
      drawCrown(ctx, b, c, time);
      ctx.restore(); return;
    }

    if (b.type === 'jar') {
      drawJar(ctx, b, c, time);
      ctx.restore(); return;
    }

    if (b.type === 'orb') {
      const r = b.size;
      const grd = ctx.createRadialGradient(b.p.x - r * .3, b.p.y - r * .3, r * .1, b.p.x, b.p.y, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(0.35, c.fill);
      grd.addColorStop(1, 'rgba(0,0,0,0.0)');
      ctx.beginPath(); ctx.arc(b.p.x, b.p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();
      ctx.lineWidth = 3.5; ctx.strokeStyle = c.line;
      ctx.globalAlpha = 0.85 + 0.15 * pulse; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.restore(); return;
    }

    // boxes: crate / stone / plank / chandelier / ball-poly fallback
    polyPath(ctx, verts);
    ctx.fillStyle = c.fill;
    ctx.fill();
    if (wob) { ctx.fillStyle = rgba('#ffffff', 0.35 * b.flash); ctx.fill(); }

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = c.line;
    ctx.stroke();

    // material detail
    if (b.type === 'crate') {
      ctx.save();
      polyPath(ctx, verts); ctx.clip();
      ctx.strokeStyle = rgba(c.inner, 0.55); ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(verts[0].x, verts[0].y); ctx.lineTo(verts[2].x, verts[2].y);
      ctx.moveTo(verts[1].x, verts[1].y); ctx.lineTo(verts[3].x, verts[3].y);
      ctx.stroke();
      ctx.restore();
      // corner rivets
      ctx.fillStyle = c.inner;
      for (const v of verts) { ctx.beginPath(); ctx.arc(v.x, v.y, 3, 0, 7); ctx.fill(); }
    } else if (b.type === 'stone') {
      ctx.save();
      polyPath(ctx, verts); ctx.clip();
      ctx.strokeStyle = rgba(c.inner, 0.4); ctx.lineWidth = 1.6;
      const cx = b.p.x, cy = b.p.y;
      ctx.beginPath();
      ctx.moveTo(cx - b.size * .5, cy - b.size * .2); ctx.lineTo(cx + b.size * .2, cy - b.size * .1);
      ctx.lineTo(cx + b.size * .5, cy + b.size * .25);
      ctx.moveTo(cx - b.size * .3, cy + b.size * .4); ctx.lineTo(cx + b.size * .1, cy + b.size * .15);
      ctx.stroke();
      ctx.restore();
    } else if (b.type === 'plank') {
      ctx.strokeStyle = rgba(c.inner, 0.5); ctx.lineWidth = 1.5;
      ctx.beginPath();
      const a = b.a, s = Math.sin(a), co = Math.cos(a);
      const L = b.size * 1.6;
      for (let k = -1; k <= 1; k += 2) {
        ctx.moveTo(b.p.x - co * L, b.p.y - s * L + k * 5);
        ctx.lineTo(b.p.x + co * L, b.p.y + s * L + k * 5);
      }
      ctx.stroke();
    } else if (b.type === 'chandelier') {
      // spikes under the bar
      ctx.fillStyle = rgba(c.inner, 0.9);
      const n = 5, bw = 140;
      for (let i = 0; i < n; i++) {
        const lx = -bw / 2 + bw * (i + 0.5) / n;
        const co = Math.cos(b.a), s = Math.sin(b.a);
        const wx = b.p.x + co * lx - s * 13, wy = b.p.y + s * lx + co * 13;
        ctx.save(); ctx.translate(wx, wy); ctx.rotate(b.a);
        ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(0, 14); ctx.closePath();
        ctx.fill(); ctx.restore();
      }
    } else if (b.static && (b.type === 'ground' || b.type === 'platform')) {
      // handled elsewhere
    }

    // damage cracks
    const dmg = 1 - b.hp / b.maxHp;
    if (dmg > 0.25 && isFinite(b.hp)) {
      ctx.save();
      polyPath(ctx, verts); ctx.clip();
      ctx.strokeStyle = rgba('#ffffff', 0.5 * dmg);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const seed = b.id * 7;
      for (let i = 0; i < 3; i++) {
        const x0 = b.p.x + Math.sin(seed + i * 3) * b.size * .6;
        const y0 = b.p.y + Math.cos(seed + i * 5) * b.size * .6;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + Math.sin(seed + i) * 18, y0 + Math.cos(seed + i) * 18);
        ctx.lineTo(x0 + Math.sin(seed + i * 2) * 26, y0 + Math.cos(seed + i * 3) * 26);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawJar(ctx, b, c, time) {
    const r = b.size;
    ctx.save();
    ctx.translate(b.p.x, b.p.y);
    ctx.rotate(b.a);
    // liquid slosh
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r - 2, 0, Math.PI * 2);
    ctx.clip();
    const lvl = Math.sin(time * 3 + b.id) * 3;
    const lg = ctx.createLinearGradient(0, 0, 0, r);
    lg.addColorStop(0, rgba(c.line, 0.35));
    lg.addColorStop(1, rgba(c.line, 0.6));
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(-r, r);
    ctx.lineTo(-r, 2 + lvl);
    for (let x = -r; x <= r; x += r / 4) ctx.quadraticCurveTo(x + r / 8, lvl - 3 + Math.sin(time * 5 + x) * 2, x + r / 4, 2 + lvl);
    ctx.lineTo(r, r); ctx.closePath();
    ctx.fill();
    ctx.restore();
    // glass shell
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.lineWidth = 3.5; ctx.strokeStyle = c.line; ctx.stroke();
    // neck
    ctx.beginPath();
    ctx.moveTo(-r * .35, -r * .92); ctx.lineTo(-r * .45, -r * 1.25);
    ctx.lineTo(r * .45, -r * 1.25); ctx.lineTo(r * .35, -r * .92);
    ctx.lineWidth = 3; ctx.stroke();
    // cork
    ctx.fillStyle = '#d8a24a';
    ctx.fillRect(-r * .38, -r * 1.42, r * .76, r * .22);
    // shine
    ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r * .72, Math.PI * 1.15, Math.PI * 1.45); ctx.stroke();
    ctx.restore();
  }

  function drawCrown(ctx, b, c, time) {
    const r = b.size;
    ctx.save();
    ctx.translate(b.p.x, b.p.y + Math.sin(time * 2.4 + b.id) * 3);
    ctx.beginPath();
    const w = r, h = r * .8;
    ctx.moveTo(-w, h * .6);
    ctx.lineTo(-w, -h * .2);
    ctx.lineTo(-w * .5, h * .1);
    ctx.lineTo(0, -h * .7);
    ctx.lineTo(w * .5, h * .1);
    ctx.lineTo(w, -h * .2);
    ctx.lineTo(w, h * .6);
    ctx.closePath();
    ctx.fillStyle = c.fill; ctx.fill();
    ctx.lineWidth = 3.5; ctx.strokeStyle = c.line; ctx.stroke();
    // jewels
    ctx.fillStyle = '#ff2d95';
    ctx.beginPath(); ctx.arc(0, h * .15, 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#00e5ff';
    ctx.beginPath(); ctx.arc(-w * .55, h * .3, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(w * .55, h * .3, 3, 0, 7); ctx.fill();
    ctx.restore();
  }

  /* ---------- background ---------- */
  function drawBackground(ctx, theme, time) {
    const P = theme.pal;
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, DH);
    sky.addColorStop(0, '#05010f');
    sky.addColorStop(0.55, mix('#0a0322', P[0], 0.10));
    sky.addColorStop(1, '#0d0524');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, DW, DH);

    // stars
    const rnd = RS.mulberry32(42);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 70; i++) {
      const x = rnd() * DW, y = rnd() * DH * 0.55;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * (0.5 + rnd()) + i));
      ctx.globalAlpha = tw * 0.8;
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

    // big neon moon
    const mx = 1050, my = 150, mr = 95;
    const moonG = ctx.createRadialGradient(mx, my, mr * .2, mx, my, mr * 2.4);
    moonG.addColorStop(0, rgba(P[0], 0.35));
    moonG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = moonG;
    ctx.beginPath(); ctx.arc(mx, my, mr * 2.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, 7);
    ctx.strokeStyle = rgba(P[0], 0.9); ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(mx, my, mr * 0.78, 0, 7);
    ctx.strokeStyle = rgba(P[1], 0.35); ctx.lineWidth = 1.5; ctx.stroke();

    // distant palace silhouette
    ctx.fillStyle = 'rgba(8,4,26,0.9)';
    const bx = 0, by = 560;
    ctx.beginPath();
    ctx.moveTo(300, 640); ctx.lineTo(300, 470); ctx.lineTo(330, 440); ctx.lineTo(360, 470); ctx.lineTo(360, 640);
    ctx.moveTo(380, 640); ctx.lineTo(380, 500); ctx.lineTo(470, 500); ctx.lineTo(470, 640);
    ctx.moveTo(430, 500); ctx.lineTo(430, 455); ctx.lineTo(455, 435); ctx.lineTo(480, 455); ctx.lineTo(480, 500);
    ctx.moveTo(1000, 640); ctx.lineTo(1000, 480); ctx.lineTo(1040, 445); ctx.lineTo(1080, 480); ctx.lineTo(1080, 640);
    ctx.fill();
    // lit windows
    ctx.fillStyle = rgba(P[2], 0.5);
    for (let i = 0; i < 5; i++) ctx.fillRect(315 + i * 4, 500 + (i % 2) * 30, 5, 9);
    ctx.fillRect(1030, 500, 6, 10); ctx.fillRect(1044, 520, 6, 10);

    // perspective grid floor
    const hy = 640;
    ctx.save();
    ctx.strokeStyle = rgba(P[1], 0.16); ctx.lineWidth = 1;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const y = hy + t * t * (DH - hy);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(DW, y); ctx.stroke();
    }
    for (let x = -DW; x <= DW * 2; x += 120) {
      ctx.beginPath();
      ctx.moveTo(DW / 2 + (x - DW / 2) * 0.25, hy);
      ctx.lineTo(x, DH);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- ground & platforms ---------- */
  function drawGround(ctx, theme) {
    const P = theme.pal;
    const gy = RS.GROUND_Y;
    ctx.fillStyle = 'rgba(6,2,18,0.96)';
    ctx.fillRect(0, gy, DW, DH - gy);
    // top neon edge
    ctx.strokeStyle = P[0]; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(DW, gy); ctx.stroke();
    ctx.strokeStyle = rgba(P[1], 0.5); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, gy + 6); ctx.lineTo(DW, gy + 6); ctx.stroke();
    // royal tile pattern
    ctx.strokeStyle = rgba(P[0], 0.14);
    for (let x = 0; x < DW; x += 64) {
      ctx.beginPath(); ctx.moveTo(x, gy + 10); ctx.lineTo(x + 32, DH); ctx.stroke();
    }
  }

  /* ---------- cannon ---------- */
  function drawCannon(ctx, G, time) {
    const P = G.theme.pal;
    const cx = G.cannon.x, cy = G.cannon.y;
    // tower pedestal
    ctx.fillStyle = 'rgba(8,3,24,0.95)';
    ctx.beginPath();
    ctx.moveTo(cx - 70, RS.GROUND_Y);
    ctx.lineTo(cx - 46, cy + 34);
    ctx.lineTo(cx + 46, cy + 34);
    ctx.lineTo(cx + 70, RS.GROUND_Y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = P[1]; ctx.lineWidth = 3; ctx.stroke();
    // decorative battlements
    ctx.fillStyle = rgba(P[1], 0.25);
    for (let i = -2; i <= 2; i++) ctx.fillRect(cx + i * 20 - 6, cy + 40, 12, 10);

    // rotating wheel base
    ctx.save();
    ctx.translate(cx, cy + 18);
    ctx.rotate(time * 0.2);
    ctx.strokeStyle = P[0]; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); ctx.stroke();
    }
    ctx.restore();

    // barrel
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(G.aimAngle);
    const bl = 86, bw = 15;
    const bg = ctx.createLinearGradient(0, -bw, bl, bw);
    bg.addColorStop(0, 'rgba(30,10,50,0.95)');
    bg.addColorStop(1, rgba(P[0], 0.35));
    ctx.fillStyle = bg;
    roundRect(ctx, -14, -bw, bl + 14, bw * 2, 8); ctx.fill();
    ctx.strokeStyle = P[0]; ctx.lineWidth = 3;
    roundRect(ctx, -14, -bw, bl + 14, bw * 2, 8); ctx.stroke();
    // muzzle ring
    ctx.strokeStyle = P[2]; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(bl - 4, 0, bw + 3, -1.2, 1.2); ctx.stroke();
    // reinforcement rings
    ctx.strokeStyle = rgba(P[1], 0.8); ctx.lineWidth = 2;
    for (const fx of [18, 44]) {
      ctx.beginPath(); ctx.moveTo(fx, -bw); ctx.lineTo(fx, bw); ctx.stroke();
    }
    // loaded ball preview
    if (G.state === 'aim' || G.state === 'loaded') {
      ctx.fillStyle = 'rgba(238,247,255,0.9)';
      ctx.beginPath(); ctx.arc(bl - 26, 0, 13, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7df9ff'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();

    // hub
    ctx.fillStyle = '#12062e';
    ctx.beginPath(); ctx.arc(cx, cy, 12, 0, 7); ctx.fill();
    ctx.strokeStyle = P[2]; ctx.lineWidth = 2.5; ctx.stroke();
  }

  /* ---------- aim guide (dotted predicted trajectory) ---------- */
  function drawAimGuide(ctx, G) {
    if (G.state !== 'aim') return;
    const P = G.theme.pal;
    const v = G.launchSpeed(), a = G.aimAngle;
    let x = G.muzzle().x, y = G.muzzle().y;
    let vx = Math.cos(a) * v, vy = Math.sin(a) * v;
    const dt = 1 / 60;
    ctx.save();
    for (let i = 0; i < 150; i++) {
      vy += RS.GRAV * dt; x += vx * dt; y += vy * dt;
      if (y > RS.GROUND_Y - 4) break;
      if (x > DW || x < 0) break;
      if (i % 5 === 0) {
        const t = i / 150;
        ctx.fillStyle = rgba(i % 10 === 0 ? P[2] : P[1], 0.85 * (1 - t));
        ctx.beginPath(); ctx.arc(x, y, 3.2 * (1 - t * .5), 0, 7); ctx.fill();
      }
    }
    // landing marker
    ctx.strokeStyle = rgba(P[2], 0.9); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, Math.min(y, RS.GROUND_Y - 4), 9 + Math.sin(performance.now() / 150) * 2, 0, 7); ctx.stroke();
    ctx.restore();
  }

  /* ---------- power arc UI near cannon ---------- */
  function drawPowerMeter(ctx, G) {
    if (G.state !== 'aim') return;
    const cx = G.cannon.x, cy = G.cannon.y - 92;
    const t = G.powerT();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(cx, cy, 26, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
    const col = t < 0.5 ? '#7dff6a' : t < 0.8 ? '#ffd54a' : '#ff2d5e';
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, 26, Math.PI * 0.8, Math.PI * 0.8 + t * Math.PI * 1.4); ctx.stroke();
    ctx.restore();
  }

  /* ---------- particles ---------- */
  function drawParticles(ctx, parts, additive) {
    for (const p of parts) {
      const life = p.t / p.life;
      if (life > 1) continue;
      const a = 1 - life;
      if (p.kind === 'spark') {
        if (!additive) continue;
        ctx.strokeStyle = rgba(p.color, a);
        ctx.lineWidth = p.size * a;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
      } else if (p.kind === 'shard') {
        if (additive) continue;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.strokeStyle = rgba(p.color, a);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(-p.s, -p.s * .6); ctx.lineTo(p.s, -p.s * .2);
        ctx.lineTo(p.s * .4, p.s * .8); ctx.closePath();
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'ring') {
        if (!additive) continue;
        ctx.strokeStyle = rgba(p.color, a * 0.9);
        ctx.lineWidth = 3 * a + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (1 - a) * p.grow, 0, 7); ctx.stroke();
      } else if (p.kind === 'text') {
        if (additive) continue;
        ctx.font = `bold ${p.size}px "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = rgba(p.color, a);
        ctx.fillText(p.txt, p.x, p.y - (1 - a) * 46);
      } else if (p.kind === 'confetti') {
        if (additive) continue;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.t * p.spin);
        ctx.fillStyle = rgba(p.color, Math.min(1, a * 1.6));
        ctx.fillRect(-p.s, -p.s / 2, p.s * 2, p.s);
        ctx.restore();
      } else if (p.kind === 'smoke') {
        if (additive) continue;
        ctx.fillStyle = rgba(p.color, a * 0.16);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + p.t * 2), 0, 7); ctx.fill();
      }
    }
  }

  /* ---------- composite ---------- */
  function present(ctx, dpr, shakeX, shakeY) {
    ensureBuffers();
    const sc = sceneBuf.getContext('2d');
    const gl = glowBuf.getContext('2d');
    // scene buffer: opaque background + solid objects (no shake inside buffer;
    // the whole composited image is shaken on the main canvas instead)
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, DW, DH);
    drawBackground(sc, G.theme, G.time);
    drawGround(sc, G.theme);
    drawScene(sc, false);
    // glow buffer: bright strokes/particles only, additive later with blur
    gl.setTransform(1, 0, 0, 1, 0, 0);
    gl.clearRect(0, 0, DW, DH);
    drawScene(gl, true);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasCSS.w, canvasCSS.h);
    ctx.save();
    ctx.translate(shakeX, shakeY);
    ctx.drawImage(sceneBuf, 0, 0, canvasCSS.w, canvasCSS.h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = 'blur(5px)';
    ctx.globalAlpha = 0.8;
    ctx.drawImage(glowBuf, 0, 0, canvasCSS.w, canvasCSS.h);
    ctx.filter = 'blur(14px)';
    ctx.globalAlpha = 0.45;
    ctx.drawImage(glowBuf, 0, 0, canvasCSS.w, canvasCSS.h);
    ctx.restore();
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  const canvasCSS = { w: DW, h: DH };
  let drawScene = () => {};
  let G = null;                       // game reference (set via setGame)

  RS.render = {
    DW, DH, hexRgb, rgba, mix,
    ensureBuffers,
    setDrawScene(fn) { drawScene = fn; },
    setGame(game) { G = game; },
    setCanvasSize(w, h) { canvasCSS.w = w; canvasCSS.h = h; },
    drawBackground, drawGround, drawBody, drawCannon, drawAimGuide,
    drawPowerMeter, drawParticles, present,
    polyPath, roundRect, bodyColors,
  };
})(window.RS = window.RS || {});
