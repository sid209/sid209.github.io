/* ============================================================
   ROYAL SMASH! — Game logic, input, HUD & screens
   A neon cannon-smash physics puzzler.
   ============================================================ */
(function (RS) {
  'use strict';

  const R = RS.render;
  const DW = R.DW, DH = R.DH;
  const $ = sel => document.querySelector(sel);

  /* ---------- persistence ---------- */
  const store = {
    get() { try { return JSON.parse(localStorage.getItem('royalSmashNeon') || '{}'); } catch (e) { return {}; } },
    set(s) { try { localStorage.setItem('royalSmashNeon', JSON.stringify(s)); } catch (e) {} },
  };
  let save = Object.assign({ unlocked: 1, stars: {}, coins: 0, music: true, sfx: true }, store.get());
  RS.audio.music = save.music !== false;
  RS.audio.sfx = save.sfx !== false;
  function persist() { store.set(save); }

  /* ---------- game state ---------- */
  const G = {
    world: null, theme: null, levelIdx: 0, levelDef: null,
    state: 'menu',            // menu | levels | aim | flying | settling | won | lost
    time: 0, shots: 0, maxShots: 5, score: 0, chain: 0, chainT: 0,
    aimAngle: -0.6, power: 0.72, dragging: null,
    cannon: { x: 190, y: 470 },
    parts: [], balls: [], chand: null, chandTimer: 0,
    settleT: 0, shakeMag: 0, slowmo: 1,
    totalSmashed: 0,
    bestCombo: 0, lastShotScore: 0,
    hintT: 0,
  };
  window.RSG = G;
  R.setGame(G);

  G.muzzle = () => ({
    x: G.cannon.x + Math.cos(G.aimAngle) * 88,
    y: G.cannon.y + Math.sin(G.aimAngle) * 88,
  });
  G.launchSpeed = () => 700 + G.power * 1350;
  G.powerT = () => (G.launchSpeed() - 700) / 1350;

  /* ---------- canvas sizing ---------- */
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  let dpr = 1, scale = 1, offX = 0, offY = 0;
  function resize() {
    const vw = window.innerWidth, vh = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = vw * dpr; canvas.height = vh * dpr;
    canvas.style.width = vw + 'px'; canvas.style.height = vh + 'px';
    scale = Math.min(vw / DW, vh / DH);
    offX = (vw - DW * scale) / 2; offY = (vh - DH * scale) / 2;
    R.setCanvasSize(DW, DH);
    R.ensureBuffers();
    // letterbox background handled by CSS
  }
  window.addEventListener('resize', resize);
  resize();
  function toDesign(cx, cy) {
    return { x: (cx - offX) / scale, y: (cy - offY) / scale };
  }

  /* ---------- level building ---------- */
  const MAT = {
    crate: { density: 1.1, hp: 1.0, restitution: 0.08, friction: 0.75 },
    stone: { density: 3.2, hp: 2.6, restitution: 0.04, friction: 0.8 },
    jar:   { density: 0.8, hp: 0.34, restitution: 0.12, friction: 0.6 },
    orb:   { density: 0.9, hp: 0.6, restitution: 0.5, friction: 0.4 },
    plank: { density: 1.6, hp: 1.4, restitution: 0.06, friction: 0.7 },
    coin:  { density: 0.001, hp: Infinity, restitution: 0, friction: 0 },
    crown: { density: 0.001, hp: Infinity, restitution: 0, friction: 0 },
  };

  function loadLevel(i) {
    G.levelIdx = i;
    const def = RS.levels[i];
    G.levelDef = def;
    G.theme = { pal: RS.THEMES[def.theme] || RS.THEMES.magenta };
    document.body.style.setProperty('--neon', G.theme.pal[0]);
    document.body.style.setProperty('--neon2', G.theme.pal[1]);
    const w = new RS.World(DW, DH);
    G.world = w;
    G.parts = []; G.balls = [];
    G.shots = 0; G.score = 0; G.chain = 0; G.lastShotScore = 0;
    G.state = 'aim'; G.slowmo = 1; G.shakeMag = 0; G.settleT = 0;
    G.aimAngle = -0.6; G.power = 0.72;
    G.chand = null; G.chandTimer = 0;
    // ground body
    w.add(RS.makeBody({ type: 'ground', x: DW / 2, y: RS.GROUND_Y + 100, v: RS.boxShape(DW * 3, 200), static: true, color: '#fff', mat: 'stone' }));
    let smashables = 0;
    for (const o of def.objs) {
      const m = MAT[o.t]; if (!m) continue;
      const isC = o.t === 'jar' || o.t === 'orb' || o.t === 'coin' || o.t === 'crown';
      const sz = isC ? (o.s || (o.t === 'coin' ? 20 : o.t === 'crown' ? 30 : 50)) : 0;
      const shape = isC ? RS.ngon(sz / 2 * (o.t === 'jar' ? 1.15 : 1), 12, 0)
                        : RS.boxShape(o.w, o.h);
      const b = RS.makeBody({
        type: o.t, x: o.x, y: o.y, angle: o.angle || o.rot || 0,
        v: shape, size: isC ? sz / 2 : Math.hypot(o.w / 2, o.h / 2),
        density: m.density, hp: m.hp, maxHp: m.hp,
        restitution: m.restitution, friction: m.friction,
        static: !!o.static, smashable: !o.static && o.t !== 'coin' && o.t !== 'crown',
      });
      w.add(b);
      if (b.smashable) smashables++;
      if (o.t === 'coin' || o.t === 'crown') { b.collect = true; b.r = isC ? sz / 2 : 20; }
    }
    G.totalSmashed = smashables;
    G.targetSmash = Math.max(1, Math.ceil(smashables * 0.9));
    // chandelier on later levels
    if (i >= 5) {
      const cx = 700 + (i * 137) % 350;
      G.chand = w.dropChandelier(cx, -60);
      G.chand.vx = 0; G.chand.vy = 0;
      G.chandTimer = 2.2 + (i % 3);
    }
    updateHUD();
    hideOverlay();
  }

  /* ---------- damage / smashing ---------- */
  const DMG_THRESHOLD = 3.2;   // impulse-ish units per frame-step velocity
  function damageCb(m) {
    const speed = m.approach;  // px/s (set by engine relSpeed)
    if (speed < 240) return;
    const pts = m.pts[0];
    const x = pts.x, y = pts.y;
    const pan = Math.max(-1, Math.min(1, (x - DW / 2) / (DW / 2)));
    const hitPower = speed / 900;
    G.shakeMag = Math.min(14, G.shakeMag + hitPower * 6);
    for (const b of [m.A, m.B]) {
      if (!b.alive) continue;
      if (b.smashable && speed > 240) {
        const before = b.hp;
        b.hp -= hitPower * (b.mat === 'stone' ? 0.7 : 1);
        b.flash = 1;
        if (before > 0.45 && b.hp <= 0.45 && b.hp > 0) {
          spawnSparks(x, y, b, 6);
          RS.audio.SFX.thud(hitPower * 0.5, pan);
        }
        if (b.hp <= 0) destroyBody(b, x, y, hitPower, pan);
        else RS.audio.SFX.thud(hitPower * 0.4, pan);
      } else if (b.type === 'crate' || b.type === 'plank' || b.type === 'stone') {
        b.flash = Math.max(b.flash, 0.5);
        if (speed > 500) RS.audio.SFX.thud(Math.min(0.6, hitPower * 0.5), pan);
      } else if (b.type === 'ground' && speed > 700) {
        RS.audio.SFX.thud(Math.min(0.5, hitPower * 0.4), pan);
      }
    }
    // impact sparks between any bodies
    if (speed > 520) {
      spawnSparks(x, y, m.A.smashable ? m.A : m.B, Math.min(10, speed / 120));
    }
  }

  function destroyBody(b, hx, hy, power, pan) {
    if (!b.alive) return;
    b.alive = false;
    G.chain += 1;
    G.chainT = 0.9;
    const base = b.type === 'jar' ? 150 : b.type === 'orb' ? 120 : b.type === 'stone' ? 100 : b.type === 'crate' ? 80 : b.type === 'plank' ? 90 : 60;
    const mult = Math.min(8, 1 + (G.chain - 1) * 0.5);
    const gained = Math.round(base * mult);
    G.score += gained; G.lastShotScore += gained;
    G.bestCombo = Math.max(G.bestCombo, G.chain);
    const c = R.bodyColors(b, G.theme).line;
    if (b.type === 'jar') {
      spawnGlassBurst(b.p.x, b.p.y, c, pan);
      RS.audio.SFX.glass(pan);
      puffSmoke(b.p.x, b.p.y);
    } else if (b.type === 'orb') {
      spawnPopBurst(b.p.x, b.p.y, c, pan);
      RS.audio.SFX.pop(pan);
    } else {
      spawnDebris(b, c);
      spawnRing(b.p.x, b.p.y, c);
      RS.audio.SFX.thud(0.5, pan);
      puffSmoke(b.p.x, b.p.y);
    }
    spawnText(b.p.x, b.p.y - b.size, '+' + gained, c, 20 + Math.min(14, G.chain * 2));
    if (G.chain >= 2) {
      RS.audio.SFX.chain(G.chain);
      spawnText(b.p.x, b.p.y - b.size - 26, 'CHAIN x' + G.chain, '#ffffff', 15);
    }
    // shatter nearby jars instantly (chain reaction feel)
    for (const o of G.world.bodies) {
      if (o !== b && o.alive && o.smashable && (o.type === 'jar' || o.type === 'orb')) {
        const d = Math.hypot(o.p.x - b.p.x, o.p.y - b.p.y);
        if (d < b.size + o.size + 26) o.hp -= 0.5;
      }
    }
  }

  /* ---------- particles ---------- */
  function addP(p) { G.parts.push(p); if (G.parts.length > 900) G.parts.splice(0, 100); }
  function spawnSparks(x, y, b, n) {
    const col = R.bodyColors(b, G.theme).line;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 420;
      addP({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, color: Math.random() < .3 ? '#ffffff' : col, size: 2 + Math.random() * 2.5, t: 0, life: 0.25 + Math.random() * 0.3, g: 900 });
    }
  }
  function spawnGlassBurst(x, y, col, pan) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2, sp = 100 + Math.random() * 460;
      addP({ kind: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, rot: Math.random() * 7, spin: (Math.random() - .5) * 14, s: 3 + Math.random() * 5, color: Math.random() < .5 ? col : '#eaffff', t: 0, life: 0.6 + Math.random() * 0.5, g: 1400 });
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, sp = 160 + Math.random() * 380;
      addP({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: '#aef3ff', size: 2 + Math.random() * 2, t: 0, life: 0.3 + Math.random() * 0.25, g: 700 });
    }
    spawnRing(x, y, col);
  }
  function spawnPopBurst(x, y, col, pan) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 300;
      addP({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, color: Math.random() < .4 ? '#ffffff' : col, size: 2.5 + Math.random() * 3, t: 0, life: 0.35 + Math.random() * 0.3, g: 500 });
    }
    spawnRing(x, y, col);
    spawnRing(x, y, '#ffffff');
  }
  function spawnDebris(b, col) {
    const verts = RS.worldVerts(b);
    const cx = b.p.x, cy = b.p.y;
    for (let i = 0; i < verts.length; i++) {
      const p = verts[i], q = verts[(i + 1) % verts.length];
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const dx = mx - cx, dy = my - cy;
      const l = Math.hypot(dx, dy) || 1;
      addP({ kind: 'shard', x: mx, y: my, vx: dx / l * (120 + Math.random() * 200) + (Math.random() - .5) * 80, vy: dy / l * 160 - 180 - Math.random() * 120, rot: Math.random() * 7, spin: (Math.random() - .5) * 10, s: 4 + Math.random() * 7, color: col, t: 0, life: 0.8 + Math.random() * 0.5, g: 1500 });
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2, sp = 100 + Math.random() * 260;
      addP({ kind: 'spark', x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, color: col, size: 2 + Math.random() * 2, t: 0, life: 0.3 + Math.random() * 0.2, g: 800 });
    }
  }
  function spawnRing(x, y, col) {
    addP({ kind: 'ring', x, y, r: 6, grow: 60 + Math.random() * 30, color: col, t: 0, life: 0.35 });
  }
  function spawnText(x, y, txt, col, size) {
    addP({ kind: 'text', x, y, txt, color: col, size: size || 18, t: 0, life: 0.9 });
  }
  function puffSmoke(x, y) {
    for (let i = 0; i < 4; i++)
      addP({ kind: 'smoke', x: x + (Math.random() - .5) * 20, y: y + (Math.random() - .5) * 20, vx: (Math.random() - .5) * 30, vy: -30 - Math.random() * 40, r: 10 + Math.random() * 12, color: '#8f9bd4', t: 0, life: 0.7 + Math.random() * 0.4 });
  }
  function confettiRain() {
    const P = G.theme.pal;
    for (let i = 0; i < 90; i++) {
      addP({ kind: 'confetti', x: Math.random() * DW, y: -20 - Math.random() * 300, vx: (Math.random() - .5) * 60, vy: 120 + Math.random() * 200, rot: Math.random() * 7, spin: (Math.random() - .5) * 12, s: 3 + Math.random() * 4, color: [P[0], P[1], P[2], '#ffffff'][i % 4], t: 0, life: 2.6 + Math.random() * 1.4, g: 60 });
    }
  }
  function updateParticles(dt) {
    for (const p of G.parts) {
      p.t += dt;
      if (p.vx !== undefined) { p.x += p.vx * dt; p.vy = (p.vy || 0) + (p.g || 0) * dt; p.y += p.vy * dt; }
      if (p.spin !== undefined) p.rot = (p.rot || 0) + p.spin * dt;
    }
    G.parts = G.parts.filter(p => p.t < p.life);
  }

  /* ---------- firing ---------- */
  function fire() {
    if (G.state !== 'aim') return;
    const m = G.muzzle();
    const v = G.launchSpeed(), a = G.aimAngle;
    const ball = G.world.spawnBall(m.x, m.y, Math.cos(a) * v, Math.sin(a) * v, 16);
    ball.smashable = false;
    G.balls.push(ball);
    G.shots++;
    G.state = 'flying';
    G.chain = 0;
    G.lastShotScore = 0;
    RS.audio.resume(); RS.audio.SFX.launch();
    G.shakeMag = 10;
    // muzzle flash
    spawnRing(m.x, m.y, '#ffffff');
    for (let i = 0; i < 14; i++) {
      const ang = a + (Math.random() - .5) * 0.9, sp = 200 + Math.random() * 500;
      addP({ kind: 'spark', x: m.x, y: m.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, color: Math.random() < .5 ? '#ffd54a' : '#7df9ff', size: 2 + Math.random() * 3, t: 0, life: 0.3 + Math.random() * 0.2, g: 300 });
    }
    puffSmoke(m.x, m.y);
    updateHUD();
  }

  /* ---------- win/lose ---------- */
  function smashedCount() {
    let n = 0;
    for (const b of G.world.bodies) if (b.smashable && !b.alive) n++;
    return n;
  }
  function collectiblesLeft() {
    let n = 0;
    for (const b of G.world.bodies) if ((b.type === 'coin' || b.type === 'crown') && b.alive && !b.collected) n++;
    return n;
  }
  function checkOutcome() {
    const done = smashedCount() >= G.targetSmash;
    if (done) { win(); return; }
    if (G.shots >= G.maxShots) lose(); 
    else { reloadCannon(); }
  }
  function reloadCannon() {
    // remove spent balls
    for (const b of G.balls) if (b.alive && (b.p.y > DH + 80 || b.p.x > DW + 120 || b.p.x < -120)) b.alive = false;
    G.world.removeDead();
    G.balls = G.balls.filter(b => b.alive);
    G.state = 'aim';
    RS.audio.SFX.reload();
    updateHUD();
  }
  function starsFor() {
    const pct = smashedCount() / G.totalSmashed;
    let st = 1;
    if (pct >= 0.999) st = 2;
    if (pct >= 0.999 && G.shots <= G.levelDef.par) st = 3;
    return st;
  }
  function win() {
    G.state = 'won';
    const st = starsFor();
    const key = 'L' + (G.levelIdx + 1);
    save.stars[key] = Math.max(save.stars[key] || 0, st);
    save.coins += G.score;
    if (G.levelIdx + 2 > save.unlocked) save.unlocked = Math.min(RS.levels.length, G.levelIdx + 2);
    persist();
    RS.audio.SFX.win();
    confettiRain();
    showOverlay(`
      <div class="ov-card">
        <div class="ov-kicker">Arena Cleared</div>
        <h2 class="ov-title">${G.levelDef.name}</h2>
        <div class="stars">${[1,2,3].map(n => `<span class="star ${n<=st?'on':''}">★</span>`).join('')}</div>
        <div class="ov-stats">
          <div><b>${smashedCount()}/${G.totalSmashed}</b><span>SMASHED</span></div>
          <div><b>${G.score.toLocaleString()}</b><span>SCORE</span></div>
          <div><b>x${G.bestCombo}</b><span>BEST CHAIN</span></div>
          <div><b>${G.shots}</b><span>SHOTS</span></div>
        </div>
        <div class="ov-btns">
          <button class="btn ghost" id="ovRetry">↻ Retry</button>
          <button class="btn ghost" id="ovMenu">Arenas</button>
          <button class="btn primary" id="ovNext">Next Arena →</button>
        </div>
      </div>`);
    $('#ovRetry').onclick = () => { RS.audio.SFX.click(); loadLevel(G.levelIdx); };
    $('#ovMenu').onclick = () => { RS.audio.SFX.click(); showLevels(); };
    const nx = $('#ovNext');
    if (G.levelIdx + 1 >= RS.levels.length) { nx.textContent = 'Kingdom Demolished 👑'; nx.onclick = showLevels; }
    else nx.onclick = () => { RS.audio.SFX.click(); loadLevel(G.levelIdx + 1); };
  }
  function lose() {
    G.state = 'lost';
    RS.audio.SFX.fail();
    showOverlay(`
      <div class="ov-card">
        <div class="ov-kicker warn">Out of Cannonballs</div>
        <h2 class="ov-title">The kingdom still stands…</h2>
        <div class="ov-stats">
          <div><b>${smashedCount()}/${G.targetSmash}</b><span>NEEDED</span></div>
          <div><b>${G.score.toLocaleString()}</b><span>SCORE</span></div>
        </div>
        <div class="ov-btns">
          <button class="btn ghost" id="ovMenu2">Arenas</button>
          <button class="btn primary" id="ovRetry2">Try Again</button>
        </div>
      </div>`);
    $('#ovRetry2').onclick = () => { RS.audio.SFX.click(); loadLevel(G.levelIdx); };
    $('#ovMenu2').onclick = () => { RS.audio.SFX.click(); showLevels(); };
  }

  /* ---------- main loop ---------- */
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    G.time += dt;
    if (G.state === 'menu' || G.state === 'levels') { drawIdle(); return; }

    // physics substeps
    const sim = dt * G.slowmo;
    const steps = 2;
    for (let s = 0; s < steps; s++) G.world.step(sim / steps, damageCb);

    // slow-mo ramp after big chains
    if (G.chain >= 4 && G.slowmo > 0.45 && G.state === 'flying') G.slowmo = 0.45;
    G.slowmo += (1 - G.slowmo) * Math.min(1, dt * 1.6);

    // chain timer
    if (G.chainT > 0) { G.chainT -= dt; if (G.chainT <= 0) G.chain = 0; }

    // ball spin visual + out-of-bounds
    for (const b of G.balls) {
      if (b.alive) {
        b.a += (b.spinV || 0) * dt * 60 * 0.016;
        if (b.p.y > DH + 100 || b.p.x > DW + 150 || b.p.x < -150) b.alive = false;
      }
    }

    // collectibles: coins/crowns collected when anything hits them
    for (const b of G.world.bodies) {
      if (!b.alive || !b.collect) continue;
      for (const other of G.world.bodies) {
        if (other === b || !other.alive || other.collect) continue;
        const d = Math.hypot(b.p.x - other.p.x, b.p.y - other.p.y);
        if (d < b.size + other.size + 2) {
          b.alive = false;
          if (b.type === 'coin') {
            G.score += 250;
            spawnText(b.p.x, b.p.y - 16, '+250', '#ffd54a', 18);
            spawnRing(b.p.x, b.p.y, '#ffd54a');
            for (let i = 0; i < 8; i++) {
              const a = Math.random() * 7, sp = 100 + Math.random() * 200;
              addP({ kind: 'spark', x: b.p.x, y: b.p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, color: '#ffd54a', size: 2 + Math.random() * 2, t: 0, life: 0.4, g: 800 });
            }
            RS.audio.SFX.coin((b.p.x - DW / 2) / (DW / 2));
          } else {
            G.score += 1000;
            spawnText(b.p.x, b.p.y - 20, 'ROYAL! +1000', '#ffe9a0', 24);
            spawnRing(b.p.x, b.p.y, '#ffd54a'); spawnRing(b.p.x, b.p.y, '#ffffff');
            confettiMini(b.p.x, b.p.y);
            RS.audio.SFX.crown();
          }
          break;
        }
      }
    }

    // chandelier trigger countdown
    if (G.chand && G.chand.alive) {
      if (G.chand.vy === 0) {
        G.chandTimer -= dt;
        G.chand.wobble = Math.sin(G.time * 6) * (1 - Math.max(0, G.chandTimer / 3)) * 0.05;
        G.chand.a = G.chand.wobble;
        if (G.chandTimer <= 0 || (G.state === 'flying' && G.chandTimer < 1.6 && anyBallNear(G.chand))) {
          G.chand.vy = 420;
          spawnText(G.chand.p.x, 40, '⚠ CHANDELIER ⚠', '#ffb02e', 22);
        }
      } else if (G.chand.p.y > RS.GROUND_Y + 60) G.chand.alive = false;
    }

    // flying -> settling detection
    if (G.state === 'flying') {
      let moving = false, minDist = Infinity;
      for (const b of G.world.bodies) {
        if (b.static || !b.alive) continue;
        const v = Math.hypot(b.p.x - b.pp.x, b.p.y - b.pp.y) * 60;
        if (v > 6) moving = true;
      }
      if (!moving) {
        G.settleT += dt;
        if (G.settleT > 1.1) {
          const allBallsGone = G.balls.every(b => !b.alive);
          if (allBallsGone || G.settleT > 3.5) { G.state = 'settling'; checkOutcome(); }
        }
      } else G.settleT = 0;
      // safety: ball escaped right/up long ago
      if (G.balls.every(b => !b.alive)) { G.settleT += dt; if (G.settleT > 1.4) { G.state = 'settling'; checkOutcome(); } }
    }

    // flashes decay
    for (const b of G.world.bodies) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt * 4);

    updateParticles(dt);
    G.shakeMag *= Math.pow(0.0008, dt);
    if (G.shakeMag < 0.2) G.shakeMag = 0;

    drawGame();
    updateHUDSoft();
  }
  function confettiMini(x, y) {
    const P = G.theme.pal;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 320;
      addP({ kind: 'confetti', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 150, rot: Math.random() * 7, spin: (Math.random() - .5) * 14, s: 3 + Math.random() * 3, color: [P[0], P[1], P[2]][i % 3], t: 0, life: 1 + Math.random() * 0.8, g: 900 });
    }
  }
  function anyBallNear(ch) {
    for (const b of G.balls) if (b.alive && Math.abs(b.p.x - ch.p.x) < 220 && b.p.y < ch.p.y + 300) return true;
    return false;
  }

  /* ---------- scene drawing ---------- */
  function drawSceneTo(ctxBuf, additive) {
    // static platforms drawn as neon slabs (level defs with static:true are bodies already)
    for (const b of G.world.bodies) {
      if (!b.alive) continue;
      if (b.type === 'ground') continue;
      if (additive) {
        // glow pass: bright strokes only
        strokeOnly(ctxBuf, b);
      } else {
        R.drawBody(ctxBuf, b, G.theme, G.time);
      }
    }
    // cannon
    if (!additive) R.drawCannon(ctxBuf, G, G.time);
    else cannonGlow(ctxBuf);
    if (!additive) {
      if (G.state === 'aim') { R.drawAimGuide(ctxBuf, G); R.drawPowerMeter(ctxBuf, G); }
    } else {
      if (G.state === 'aim') guideGlow(ctxBuf);
    }
    R.drawParticles(ctxBuf, G.parts, additive);
  }
  function strokeOnly(c, b) {
    const col = R.bodyColors(b, G.theme).line;
    c.save();
    c.lineJoin = 'round';
    if (b.type === 'coin' || b.type === 'crown') {
      c.strokeStyle = '#ffd54a'; c.lineWidth = 3;
      c.beginPath(); c.arc(b.p.x, b.p.y, b.size + 2, 0, 7); c.stroke();
    } else if (b.type === 'jar' || b.type === 'orb' || b.type === 'ball') {
      c.strokeStyle = col; c.lineWidth = 3.5;
      c.beginPath(); c.arc(b.p.x, b.p.y, b.size, 0, 7); c.stroke();
      if (b.isBall) { c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.arc(b.p.x - b.size * .3, b.p.y - b.size * .3, b.size * .35, 0, 7); c.stroke(); }
    } else {
      const verts = RS.worldVerts(b);
      R.polyPath(c, verts);
      c.strokeStyle = b.flash > 0 ? '#ffffff' : col;
      c.lineWidth = 3.5; c.stroke();
    }
    if (b.type === 'chandelier') { c.strokeStyle = '#ffb02e'; c.lineWidth = 4; R.polyPath(c, RS.worldVerts(b)); c.stroke(); }
    c.restore();
  }
  function cannonGlow(c) {
    const P = G.theme.pal;
    c.save();
    c.translate(G.cannon.x, G.cannon.y); c.rotate(G.aimAngle);
    c.strokeStyle = P[0]; c.lineWidth = 3;
    R.roundRect(c, -14, -15, 100, 30, 8); c.stroke();
    c.strokeStyle = P[2]; c.lineWidth = 4;
    c.beginPath(); c.arc(82, 0, 18, -1.2, 1.2); c.stroke();
    c.restore();
    c.strokeStyle = P[1]; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(G.cannon.x - 46, G.cannon.y + 34); c.lineTo(G.cannon.x - 70, RS.GROUND_Y);
    c.moveTo(G.cannon.x + 46, G.cannon.y + 34); c.lineTo(G.cannon.x + 70, RS.GROUND_Y); c.stroke();
  }
  function guideGlow(c) {
    // trajectory dots glow
    const P = G.theme.pal;
    const v = G.launchSpeed(), a = G.aimAngle;
    let x = G.muzzle().x, y = G.muzzle().y;
    let vx = Math.cos(a) * v, vy = Math.sin(a) * v;
    const dt = 1 / 60;
    for (let i = 0; i < 150; i++) {
      vy += RS.GRAV * dt; x += vx * dt; y += vy * dt;
      if (y > RS.GROUND_Y - 4 || x > DW || x < 0) break;
      if (i % 10 === 0) {
        c.fillStyle = R.rgba(P[2], 0.9);
        c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill();
      }
    }
  }

  function drawGame() {
    const sx = (Math.random() - .5) * G.shakeMag, sy = (Math.random() - .5) * G.shakeMag;
    R.present(ctx, dpr, sx, sy);
    // overlay letterbox fill
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#03010a';
    if (offX > 0) { ctx.fillRect(0, 0, offX, window.innerHeight); ctx.fillRect(offX + DW * scale, 0, offX + 2, window.innerHeight); }
    if (offY > 0) { ctx.fillRect(0, 0, window.innerWidth, offY); ctx.fillRect(0, offY + DH * scale, window.innerWidth, offY + 2); }
    // chain banner
    if (G.chain >= 2 && G.state === 'flying') {
      ctx.font = `900 ${34 + G.chain * 2}px "Arial Black", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = ['#7dff6a', '#ffd54a', '#ff2d95', '#00e5ff'][G.chain % 4];
      ctx.globalAlpha = 0.9;
      ctx.fillText(`CHAIN ×${G.chain}`, DW / 2, 90);
      ctx.globalAlpha = 1;
    }
  }

  /* ---------- idle attract scene (menu) ---------- */
  let idleWorld = null;
  function buildIdle() {
    G.theme = { pal: RS.THEMES.magenta };
    if (!idleWorld) {
      idleWorld = new RS.World(DW, DH);
      idleWorld.add(RS.makeBody({ type: 'ground', x: DW / 2, y: RS.GROUND_Y + 100, v: RS.boxShape(DW * 3, 200), static: true }));
      const rnd = RS.mulberry32(7);
      for (let i = 0; i < 26; i++) {
        const types = ['crate', 'stone', 'jar', 'orb'];
        const t = types[Math.floor(rnd() * 4)];
        const m = MAT[t];
        const isC = t === 'jar' || t === 'orb';
        const s = 34 + rnd() * 30;
        idleWorld.add(RS.makeBody({
          type: t, x: 500 + rnd() * 600, y: 120 + rnd() * 300,
          v: isC ? RS.ngon(s / 2, 12, 0) : RS.boxShape(s, s),
          size: isC ? s / 2 : s * .72, density: m.density, hp: m.hp, maxHp: m.hp,
          restitution: m.restitution, friction: m.friction, angle: rnd() * 3,
        }));
      }
    }
  }
  function drawIdle() {
    buildIdle();
    const dt = 1 / 60;
    G.world = idleWorld;
    idleWorld.step(dt, () => {});
    idleWorld.removeDead();
    // gentle breeze so it keeps wobbling
    for (const b of idleWorld.bodies) if (!b.static && b.alive) b.f.x += Math.sin(G.time * 0.7 + b.id) * 6;
    G.parts.length = 0;
    R.present(ctx, dpr, 0, 0);
  }

  /* ---------- input ---------- */
  canvas.addEventListener('pointerdown', e => {
    RS.audio.resume();
    if (G.state !== 'aim') return;
    const p = toDesign(e.clientX, e.clientY);
    const dc = Math.hypot(p.x - G.cannon.x, p.y - G.cannon.y);
    G.dragging = dc < 260 ? 'angle' : 'power';
    applyDrag(p);
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!G.dragging || G.state !== 'aim') return;
    applyDrag(toDesign(e.clientX, e.clientY));
  });
  function endDrag(e) {
    if (!G.dragging) return;
    G.dragging = null;
    if (G.state === 'aim') fire();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  function applyDrag(p) {
    if (G.dragging === 'angle') {
      let a = Math.atan2(p.y - G.cannon.y, p.x - G.cannon.x);
      a = Math.max(-1.45, Math.min(0.15, a));
      if (Math.abs(a - G.aimAngle) > 0.02) RS.audio.SFX.aimTick((G.aimAngle + 1.45) / 1.6);
      G.aimAngle = a;
    } else {
      const d = Math.hypot(p.x - G.cannon.x, p.y - G.cannon.y);
      G.power = Math.max(0.05, Math.min(1, (d - 120) / 520));
    }
  }
  // keyboard support
  window.addEventListener('keydown', e => {
    if (G.state !== 'aim') return;
    if (e.key === 'ArrowUp') { G.aimAngle = Math.max(-1.45, G.aimAngle - 0.04); }
    if (e.key === 'ArrowDown') { G.aimAngle = Math.min(0.15, G.aimAngle + 0.04); }
    if (e.key === 'ArrowRight') { G.power = Math.min(1, G.power + 0.04); }
    if (e.key === 'ArrowLeft') { G.power = Math.max(0.05, G.power - 0.04); }
    if (e.key === ' ' || e.key === 'Enter') { RS.audio.resume(); fire(); e.preventDefault(); }
  });

  /* ---------- HUD ---------- */
  const hud = $('#hud');
  function updateHUD() {
    $('#hudLevel').textContent = `${G.levelIdx + 1}. ${G.levelDef ? G.levelDef.name : ''}`;
    $('#hudScore').textContent = G.score.toLocaleString();
    const dots = $('#ammo');
    dots.innerHTML = '';
    for (let i = 0; i < G.maxShots; i++) {
      const d = document.createElement('span');
      d.className = 'dot' + (i < G.maxShots - G.shots ? ' full' : '');
      dots.appendChild(d);
    }
    const pct = G.totalSmashed ? Math.round(smashedCount() / G.totalSmashed * 100) : 0;
    $('#progBar').style.width = pct + '%';
    $('#progTxt').textContent = `${smashedCount()}/${G.totalSmashed} SMASHED`;
  }
  function updateHUDSoft() {
    $('#hudScore').textContent = G.score.toLocaleString();
    const pct = G.totalSmashed ? Math.round(smashedCount() / G.totalSmashed * 100) : 0;
    $('#progBar').style.width = pct + '%';
    $('#progTxt').textContent = `${smashedCount()}/${G.totalSmashed} SMASHED`;
  }

  /* ---------- overlays / screens ---------- */
  const overlay = $('#overlay');
  function showOverlay(html) { overlay.innerHTML = html; overlay.classList.add('show'); hud.classList.add('hidden'); }
  function hideOverlay() { overlay.classList.remove('show'); overlay.innerHTML = ''; hud.classList.remove('hidden'); }

  function showMenu() {
    G.state = 'menu';
    hud.classList.add('hidden');
    overlay.classList.add('show');
    overlay.innerHTML = `
      <div class="title-wrap">
        <div class="game-title">ROYAL<span>SMASH!</span></div>
        <div class="subtitle">⚡ NEON PHYSICS PUZZLE ⚡</div>
        <div class="menu-btns">
          <button class="btn primary big" id="mPlay">▶ PLAY</button>
          <button class="btn ghost" id="mHow">HOW TO PLAY</button>
          <button class="btn ghost" id="mSet">SETTINGS</button>
        </div>
        <div class="footnote">Aim • Power • Fire — smash the whole royal arena 👑</div>
      </div>`;
    $('#mPlay').onclick = () => { RS.audio.resume(); RS.audio.SFX.click(); showLevels(); };
    $('#mHow').onclick = () => { RS.audio.SFX.click(); showHow(); };
    $('#mSet').onclick = () => { RS.audio.SFX.click(); showSettings(); };
  }

  function showLevels() {
    G.state = 'levels';
    hud.classList.add('hidden');
    overlay.classList.add('show');
    let grid = '';
    RS.levels.forEach((l, i) => {
      const unlocked = i + 1 <= save.unlocked;
      const st = save.stars['L' + (i + 1)] || 0;
      grid += `<button class="lv ${unlocked ? '' : 'lock'}" data-i="${i}" ${unlocked ? '' : 'disabled'}>
        <span class="lv-num">${i + 1}</span>
        <span class="lv-name">${unlocked ? l.name : '🔒'}</span>
        <span class="lv-stars">${[1,2,3].map(n => `<i class="${n <= st ? 'on' : ''}">★</i>`).join('')}</span>
      </button>`;
    });
    overlay.innerHTML = `
      <div class="ov-card wide">
        <div class="ov-kicker">Royal Arenas</div>
        <h2 class="ov-title small">Choose your destruction</h2>
        <div class="lv-grid">${grid}</div>
        <div class="ov-btns"><button class="btn ghost" id="lvBack">← Back</button>
        <div class="coinbox">💰 Total coins: <b>${save.coins.toLocaleString()}</b></div></div>
      </div>`;
    $('#lvBack').onclick = () => { RS.audio.SFX.click(); showMenu(); };
    overlay.querySelectorAll('.lv:not(.lock)').forEach(b =>
      b.onclick = () => { RS.audio.SFX.click(); loadLevel(+b.dataset.i); });
  }

  function showHow() {
    overlay.classList.add('show');
    overlay.innerHTML = `
      <div class="ov-card">
        <div class="ov-kicker">How to Play</div>
        <h2 class="ov-title small">Seconds to learn 👑</h2>
        <ul class="how">
          <li><b>DRAG near the cannon</b> to set the angle.</li>
          <li><b>DRAG far away</b> (or anywhere else) to set power.</li>
          <li><b>RELEASE</b> to fire the royal cannonball.</li>
          <li>💎 Smash <b>jars</b> — they burst and set off <b>chain reactions</b>.</li>
          <li>🪨 <b>Stones</b> are heavy — knock towers onto them.</li>
          <li>🟢 <b>Orbs</b> bounce and roll into everything.</li>
          <li>🪙 Grab <b>coins</b>, smash the <b>crown</b> for +1000!</li>
          <li>⚠ On deeper arenas a <b>chandelier</b> drops — time it wisely.</li>
          <li>⭐ 2★ = smash everything · 3★ = everything in ≤ par shots.</li>
        </ul>
        <div class="ov-btns"><button class="btn primary" id="howBack">GOT IT</button></div>
      </div>`;
    $('#howBack').onclick = () => { RS.audio.SFX.click(); showMenu(); };
  }

  function showSettings() {
    overlay.classList.add('show');
    overlay.innerHTML = `
      <div class="ov-card">
        <div class="ov-kicker">Settings</div>
        <h2 class="ov-title small">Neon Controls</h2>
        <div class="set-row"><span>Music</span><button class="toggle ${RS.audio.music ? 'on' : ''}" id="tMus">${RS.audio.music ? 'ON' : 'OFF'}</button></div>
        <div class="set-row"><span>Sound FX</span><button class="toggle ${RS.audio.sfx ? 'on' : ''}" id="tSfx">${RS.audio.sfx ? 'ON' : 'OFF'}</button></div>
        <div class="set-row"><span>Progress</span><button class="btn ghost small" id="tReset">RESET</button></div>
        <div class="ov-btns"><button class="btn primary" id="setBack">BACK</button></div>
      </div>`;
    $('#tMus').onclick = e => { RS.audio.music = !RS.audio.music; save.music = RS.audio.music; persist(); e.target.textContent = RS.audio.music ? 'ON' : 'OFF'; e.target.classList.toggle('on'); RS.audio.SFX.click(); };
    $('#tSfx').onclick = e => { RS.audio.sfx = !RS.audio.sfx; save.sfx = RS.audio.sfx; persist(); e.target.textContent = RS.audio.sfx ? 'ON' : 'OFF'; e.target.classList.toggle('on'); RS.audio.SFX.click(); };
    $('#tReset').onclick = () => { save = { unlocked: 1, stars: {}, coins: 0, music: RS.audio.music, sfx: RS.audio.sfx }; persist(); RS.audio.SFX.click(); showSettings(); };
    $('#setBack').onclick = () => { RS.audio.SFX.click(); showMenu(); };
  }

  // pause button in HUD
  $('#btnMenu').onclick = () => { RS.audio.SFX.click(); showLevels(); };
  $('#btnRestart').onclick = () => { RS.audio.SFX.click(); loadLevel(G.levelIdx); };

  /* ---------- boot ---------- */
  R.setDrawScene(drawSceneTo);
  showMenu();
  requestAnimationFrame(frame);
})(window.RS = window.RS || {});
