/* ============================================================
   ROYAL SMASH! — Neon Physics Engine (Verlet + impulse solver)
   ============================================================ */
(function (RS) {
  'use strict';

  const GRAV = 1500;          // px/s^2
  const ITER = 6;             // normal iterations
  const ANISO = 6;            // friction iterations

  /* ---------- tiny seeded RNG ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- geometry helpers ---------- */
  function polyArea(c) {
    let a = 0;
    for (let i = 0; i < c.length; i++) {
      const p = c[i], q = c[(i + 1) % c.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  }
  function polyMassProps(c, density) {
    const area = polyArea(c);
    let cx = 0, cy = 0, I = 0;
    for (let i = 0; i < c.length; i++) {
      const p = c[i], q = c[(i + 1) % c.length];
      const cross = p.x * q.y - q.x * p.y;
      cx += (p.x + q.x) * cross;
      cy += (p.y + q.y) * cross;
      I += cross * (p.x * p.x + p.x * q.x + q.x * q.x +
                    p.y * p.y + p.y * q.y + q.y * q.y);
    }
    cx /= 6 * area; cy /= 6 * area;
    const mass = Math.abs(area) * density;
    I = Math.abs(I) * density / 12 - mass * (cx * cx + cy * cy);
    if (I < mass * 4) I = mass * 4;
    return { area, mass, I, com: { x: cx, y: cy } };
  }
  function worldVerts(b) {
    const s = Math.sin(b.a), c = Math.cos(b.a), out = [];
    for (const v of b.v) out.push({ x: b.p.x + c * v.x - s * v.y, y: b.p.y + s * v.x + c * v.y });
    return out;
  }
  function project(verts, ax, ay) {
    let mn = Infinity, mx = -Infinity;
    for (const v of verts) {
      const d = v.x * ax + v.y * ay;
      if (d < mn) mn = d; if (d > mx) mx = d;
    }
    return [mn, mx];
  }
  // returns {nx,ny,depth} with normal pointing A->B, or null if separated
  function satTest(pa, pb, dx, dy) {
    let best = null;
    for (const poly of [pa, pb]) {
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const p = poly[i], q = poly[(i + 1) % n];
        let nx = q.y - p.y, ny = -(q.x - p.x);
        const len = Math.hypot(nx, ny) || 1;
        nx /= len; ny /= len;
        const [a1, a2] = project(pa, nx, ny);
        const [b1, b2] = project(pb, nx, ny);
        const ov = Math.min(a2, b2) - Math.max(a1, b1);
        if (ov <= 0) return null;
        if (!best || ov < best.depth) best = { nx, ny, depth: ov };
      }
    }
    if (best.nx * dx + best.ny * dy < 0) { best.nx = -best.nx; best.ny = -best.ny; }
    return best;
  }
  function clipSegment(p1, p2, nx, ny, cv) {
    const out = [];
    const d1 = p1.x * nx + p1.y * ny - cv;
    const d2 = p2.x * nx + p2.y * ny - cv;
    if (d1 <= 0) out.push(p1);
    if (d2 <= 0) out.push(p2);
    if (d1 * d2 < 0 && Math.abs(d1 - d2) > 1e-9) {
      const t = d1 / (d1 - d2);
      out.push({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t });
    }
    return out;
  }
  // reference face on refPoly whose outward normal ~ (rnx,rny); incident clipping on incPoly
  function contactSet(refPoly, incPoly, rnx, rny) {
    const n = refPoly.length;
    let ri = 0, bestD = -2;
    for (let i = 0; i < n; i++) {
      const p = refPoly[i], q = refPoly[(i + 1) % n];
      let ex = q.x - p.x, ey = q.y - p.y;
      const l = Math.hypot(ex, ey) || 1;
      const ox = ey / l, oy = -ex / l; // outward (poly is CCW in screen coords? test both)
      const d = Math.max(ox * rnx + oy * rny, -ox * rnx - oy * rny);
      if (d > bestD) { bestD = d; ri = i; }
    }
    const refA = refPoly[ri], refB = refPoly[(ri + 1) % n];
    let tangent = { x: refB.x - refA.x, y: refB.y - refA.y };
    const tl = Math.hypot(tangent.x, tangent.y) || 1;
    tangent.x /= tl; tangent.y /= tl;
    const rt = -(tangent.x * refA.x + tangent.y * refA.y);
    const rb = (tangent.x * refB.x + tangent.y * refB.y);
    const lo = Math.min(rt, rb), hi = Math.max(rt, rb);
    // incident face = most anti-parallel to ref normal
    const m = incPoly.length;
    let ii = 0, minDot = Infinity;
    for (let i = 0; i < m; i++) {
      const p = incPoly[i], q = incPoly[(i + 1) % m];
      let ex = q.x - p.x, ey = q.y - p.y;
      const el = Math.hypot(ex, ey) || 1;
      ex /= el; ey /= el;
      const d = ex * rnx + ey * rny;
      if (d < minDot) { minDot = d; ii = i; }
    }
    let pts = [incPoly[ii], incPoly[(ii + 1) % m]];
    if (pts.length < 2) return pts;
    pts = clipSegment(pts[0], pts[1], tangent.x, tangent.y, lo);
    if (pts.length < 2) return pts;
    pts = clipSegment(pts[0], pts[1], tangent.x, tangent.y, hi);
    return pts.slice(0, 2);
  }

  /* ---------- shapes ---------- */
  function boxShape(w, h) {
    const hw = w / 2, hh = h / 2;
    return [{ x: -hw, y: hh }, { x: hw, y: hh }, { x: hw, y: -hh }, { x: -hw, y: -hh }];
  }
  function ngon(r, n, rot) {
    const v = [];
    for (let i = 0; i < n; i++) {
      const a = rot + i * Math.PI * 2 / n;
      v.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    return v;
  }

  /* ---------- body factory ---------- */
  let _id = 1;
  function makeBody(o) {
    const isCircle = o.type === 'orb' || o.type === 'ball' || o.type === 'jar' || o.type === 'coin';
    let props;
    if (isCircle) {                       // true circle: exact inertia
      const r = o.v[0] ? Math.hypot(o.v[0].x, o.v[0].y) : (o.size || 20);
      const area = Math.PI * r * r;
      const mass = area * (o.density || 1);
      props = { area, mass, I: 0.5 * mass * r * r, com: { x: 0, y: 0 } };
    } else {
      props = polyMassProps(o.v, o.density || 1);
    }
    const v = o.v.map(p => ({ x: p.x - props.com.x, y: p.y - props.com.y }));
    const stat = !!o.static;
    const invM = stat ? 0 : 1 / props.mass;
    const invI = stat ? 0 : 1 / props.I;
    const body = {
      id: _id++, type: o.type, color: o.color, glow: o.glow, mat: o.mat || 'stone',
      v, a: o.angle || 0, angVel: 0,
      p: { x: o.x + props.com.x, y: o.y + props.com.y },
      pp: { x: o.x + props.com.x, y: o.y + props.com.y },
      f: { x: 0, y: 0 },
      kinematic: !!o.kinematic,
      mass: stat ? Infinity : props.mass, invM, invI,
      restitution: o.restitution ?? 0.1,
      friction: o.friction ?? 0.6,
      hp: o.hp ?? 1, maxHp: o.maxHp ?? o.hp ?? 1,
      size: o.size ?? Math.max(...v.map(q => Math.hypot(q.x, q.y))),
      static: stat, alive: true, scored: false,
      smashable: !!(o.smashable && !stat),
      flash: 0, wobble: 0,
      isBall: o.type === 'ball', isCoin: o.type === 'coin', isCrown: o.type === 'crown',
      baseY: o.y,
    };
    return body;
  }

  /* ---------- velocity helpers ---------- */
  function velAt(b, r) {
    const vx = (b.p.x - b.pp.x), vy = (b.p.y - b.pp.y);
    return { x: vx - b.angVel * r.y, y: vy + b.angVel * r.x };
  }
  function applyImp(b, r, ix, iy) {
    if (b.static) return;
    b.pp.x += ix * b.invM; b.pp.y += iy * b.invM;
    b.angVel += (r.x * iy - r.y * ix) * b.invI;
  }

  /* ---------- world ---------- */
  class World {
    constructor(w, h) { this.w = w; this.h = h; this.bodies = []; }
    add(b) { this.bodies.push(b); return b; }
    removeDead() { this.bodies = this.bodies.filter(b => b.alive); }

    step(dt, damageCb) {
      dt = Math.min(dt, 1 / 40);
      // fixed substeps: verlet velocity stays in px/step units (stable at any fps)
      let n = Math.max(1, Math.ceil(dt * 60));
      n = Math.min(n, 3);
      for (let s = 0; s < n; s++) this._subStep(1 / 60, damageCb);
    }

    _subStep(dt, damageCb) {
      const bs = this.bodies;
      for (const b of bs) {
        if (b.static || !b.alive) continue;
        if (!isFinite(b.p.x) || !isFinite(b.p.y)) { b.p.x = 640; b.p.y = -100; b.pp.x = b.p.x; b.pp.y = b.p.y; b.angVel = 0; }
        if (b._vx !== undefined) {          // deferred launch velocity (px/s)
          b.pp.x = b.p.x - b._vx * dt; b.pp.y = b.p.y - b._vy * dt;
          delete b._vx; delete b._vy;
        }
        if (b.kinematic) {            // scripted motion (falling chandelier)
          const vx = b.vx * dt, vy = b.vy * dt;
          b.pp.x = b.p.x - vx; b.pp.y = b.p.y - vy;   // consistent verlet velocity
          b.p.x += vx; b.p.y += vy;
          b.a += b.spin * dt;
          continue;
        }
        b.angVel *= 0.998;
        let vx = (b.p.x - b.pp.x), vy = (b.p.y - b.pp.y);   // px per step
        vx *= 0.9985; vy *= 0.9985;
        // clamp per-step velocity to keep the solver stable (~2700 px/s)
        const maxV = 45;
        const vl = Math.hypot(vx, vy);
        if (vl > maxV) { vx *= maxV / vl; vy *= maxV / vl; }
        b.pp.x = b.p.x; b.pp.y = b.p.y;
        b.p.x += vx + b.f.x * b.invM * dt * dt;
        b.p.y += vy + (b.f.y * b.invM + GRAV) * dt * dt;
        b.a += b.angVel * dt;
        if (Math.abs(b.angVel) > 30) b.angVel = Math.sign(b.angVel) * 30;
        b.f.x = 0; b.f.y = 0;
      }
      const manifolds = [];
      for (let i = 0; i < bs.length; i++) {
        const A = bs[i]; if (!A.alive) continue;
        for (let j = i + 1; j < bs.length; j++) {
          const B = bs[j]; if (!B.alive) continue;
          if (A.static && B.static) continue;
          const ra = A.size + 3, rb = B.size + 3;
          const dx = B.p.x - A.p.x, dy = B.p.y - A.p.y;
          if (dx * dx + dy * dy > (ra + rb) * (ra + rb)) continue;
          const pa = worldVerts(A), pb = worldVerts(B);
          const sat = satTest(pa, pb, dx, dy);
          if (!sat) continue;
          const { nx, ny, depth } = sat;
          // pick reference body: the one whose edge normal aligns with (nx,ny) from it
          const fa = faceAlign(pa, nx, ny), fb = faceAlign(pb, -nx, -ny);
          let refPoly, incPoly, rnx, rny;
          if (fa >= fb) { refPoly = pa; incPoly = pb; rnx = nx; rny = ny; }
          else { refPoly = pb; incPoly = pa; rnx = -nx; rny = -ny; }
          const pts = contactSet(refPoly, incPoly, rnx, rny);
          if (!pts.length) continue;
          manifolds.push({ A, B, nx, ny, depth, pts });
        }
      }
      // record approach speed before solving (for damage/events)
      for (const m of manifolds) m.approach = relSpeed(m);
      for (let it = 0; it < ITER; it++) {
        for (const m of manifolds) solveNormal(m, it === 0);
      }
      for (let it = 0; it < ANISO; it++) {
        for (const m of manifolds) solveFriction(m);
      }
      if (damageCb) for (const m of manifolds) damageCb(m);
      return manifolds;
    }

    /* ---- game-object helpers used by the game layer ---- */
    smash(b, amount) {
      if (!b.alive || b.static && !b.smashable) return;
      b.hp -= amount;
      b.flash = 1;
      if (b.hp <= 0) { b.alive = false; }
    }
    spawnBall(x, y, vx, vy, r) {
      const b = RS.makeBody({
        type: 'ball', x, y, v: ngon(r, 12, 0), density: 6, size: r + 2,
        restitution: 0.35, friction: 0.5, hp: Infinity, mat: 'metal',
        color: '#eef7ff', glow: '#7df9ff',
      });
      // verlet velocity per step (dt unknown here; game steps at fixed dt)
      b._vx = vx; b._vy = vy;
      b.spinV = -vx / (r * 3);
      this.add(b);
      return b;
    }
    makeStatic(type, x, y, w, h, angle, o) {
      o = o || {};
      const b = RS.makeBody(Object.assign({
        type, x, y, angle, static: true,
        v: type === 'orb' || type === 'ball' ? ngon(w / 2, 12, 0) : boxShape(w, h),
        size: Math.max(w, h) / 2, color: o.color, glow: o.glow, mat: o.mat || 'neon',
      }));
      this.add(b);
      return b;
    }
    /* falling chandelier: kinematic spike plank */
    dropChandelier(x, y) {
      const b = RS.makeBody({
        type: 'chandelier', x, y, v: boxShape(140, 26), static: true, kinematic: true,
        vx: 0, vy: 300, spin: 0, size: 82, hp: Infinity,
        color: '#ffd54a', glow: '#ffb02e', mat: 'gold',
      });
      b.triggerX = x; b.triggerY = y;
      this.add(b);
      return b;
    }
  }

  function faceAlign(poly, nx, ny) {
    const n = poly.length;
    let best = -2;
    for (let i = 0; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      let ex = q.x - p.x, ey = q.y - p.y;
      const l = Math.hypot(ex, ey) || 1;
      const ox = ey / l, oy = -ex / l;
      best = Math.max(best, ox * nx + oy * ny, -ox * nx - oy * ny);
    }
    return best;
  }

  function relSpeed(m) {
    const A = m.A, B = m.B;
    const pt = m.pts[0];
    const rA = { x: pt.x - A.p.x, y: pt.y - A.p.y };
    const rB = { x: pt.x - B.p.x, y: pt.y - B.p.y };
    const va = velAt(A, rA), vb = velAt(B, rB);
    // per-step displacement -> px/s (step dt ~1/60..1/40; use nominal 1/60)
    return -(((vb.x - va.x) * m.nx + (vb.y - va.y) * m.ny)) * 60;
  }

  function solveNormal(m, first) {
    const A = m.A, B = m.B, nx = m.nx, ny = m.ny;
    const e = first ? Math.min(A.restitution, B.restitution) : 0;
    let sumJ = 0;
    for (const pt of m.pts) {
      const rA = { x: pt.x - A.p.x, y: pt.y - A.p.y };
      const rB = { x: pt.x - B.p.x, y: pt.y - B.p.y };
      const va = velAt(A, rA), vb = velAt(B, rB);
      const vn = (vb.x - va.x) * nx + (vb.y - va.y) * ny;
      const rAn = rA.x * ny - rA.y * nx, rBn = rB.x * ny - rB.y * nx;
      const k = A.invM + B.invM + rAn * rAn * A.invI + rBn * rBn * B.invI;
      let j = (-(1 + e) * vn) / k / m.pts.length;
      if (j < 0) j = 0;
      sumJ += j;
      applyImp(A, rA, -nx * j, -ny * j);
      applyImp(B, rB, nx * j, ny * j);
    }
    m.lastJn = sumJ;
    if (first) {
      const corr = Math.max(m.depth - 0.4, 0) / (A.invM + B.invM) / m.pts.length * 0.55;
      for (const pt of m.pts) {
        if (A.invM > 0) { A.p.x -= nx * corr * A.invM; A.p.y -= ny * corr * A.invM; }
        if (B.invM > 0) { B.p.x += nx * corr * B.invM; B.p.y += ny * corr * B.invM; }
      }
    }
  }

  function solveFriction(m) {
    const A = m.A, B = m.B, nx = m.nx, ny = m.ny;
    const tx = -ny, ty = nx;
    const mu = Math.sqrt(Math.max(0, A.friction * B.friction));
    for (const pt of m.pts) {
      const rA = { x: pt.x - A.p.x, y: pt.y - A.p.y };
      const rB = { x: pt.x - B.p.x, y: pt.y - B.p.y };
      const va = velAt(A, rA), vb = velAt(B, rB);
      const vt = (vb.x - va.x) * tx + (vb.y - va.y) * ty;
      const rAt = rA.x * ty - rA.y * tx, rBt = rB.x * ty - rB.y * tx;
      const k = A.invM + B.invM + rAt * rAt * A.invI + rBt * rBt * B.invI;
      let jt = -vt / k / m.pts.length;
      const max = mu * Math.abs(m.lastJn || 0) / m.pts.length + 0.02;
      jt = Math.max(-max, Math.min(max, jt));
      applyImp(A, rA, -tx * jt, -ty * jt);
      applyImp(B, rB, tx * jt, ty * jt);
    }
  }

  RS.mulberry32 = mulberry32;
  RS.boxShape = boxShape;
  RS.ngon = ngon;
  RS.polyMassProps = polyMassProps;
  RS.makeBody = makeBody;
  RS.World = World;
  RS.worldVerts = worldVerts;
  RS.GRAV = GRAV;
})(window.RS = window.RS || {});
