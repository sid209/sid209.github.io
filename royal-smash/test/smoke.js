/* Headless smoke test with jsdom + canvas mock */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// ---- canvas 2d context mock (no-op recorder) ----
function mockCtx() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'canvas') return { width: 1280, height: 720 };
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const win = dom.window;
win.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
win.addEventListener('error', e => { console.log('PAGE ERROR:', e.message); process.exit(1); });

for (const f of ['js/engine.js', 'js/levels.js', 'js/render.js', 'js/audio.js', 'js/game.js']) {
  const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  try { win.eval(code); }
  catch (e) { console.log('LOAD FAIL', f, '\n', e.stack.split('\n').slice(0, 5).join('\n')); process.exit(1); }
}
console.log('scripts loaded. RS keys:', Object.keys(win.RS).join(','));

const G = win.RSG;
win.document.querySelector('#mPlay').click();
const lvBtns = win.document.querySelectorAll('.lv:not(.lock)');
console.log('unlocked levels shown:', lvBtns.length);
lvBtns[0].click();
console.log('state:', G.state, '| bodies:', G.world.bodies.length, '| smashables:', G.totalSmashed);

win.dispatchEvent(new win.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
console.log('after SPACE -> state:', G.state, '| shots:', G.shots, '| balls:', G.balls.length);

setTimeout(() => {
  console.log('t+1.5s -> state:', G.state, '| score:', G.score, '| alive:', G.world.bodies.filter(b => b.alive).length);
  setTimeout(() => {
    const smashed = G.world.bodies.filter(b => b.smashable && !b.alive).length;
    console.log('t+6s -> state:', G.state, '| shots:', G.shots, '| smashed:', smashed + '/' + G.totalSmashed);
    const bad = G.world.bodies.some(b => isNaN(b.p.x) || isNaN(b.p.y) || Math.abs(b.p.x) > 1e6);
    console.log('NaN/exploded positions?', bad);
    for (const b of G.world.bodies.slice(1, 8))
      console.log('  body', b.type.padEnd(7), 'pos', Math.round(b.p.x), Math.round(b.p.y), 'alive', b.alive, 'hp', isFinite(b.hp) ? b.hp.toFixed(2) : 'inf');
    // check overlay appeared on win/lose/reload
    console.log('overlay has content?', win.document.querySelector('#overlay').innerHTML.length > 0, '| hud hidden?', win.document.querySelector('#hud').classList.contains('hidden'));
    process.exit(0);
  }, 4500);
}, 1500);
