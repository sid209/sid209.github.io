/* ============================================================
   ROYAL SMASH! — WebAudio synth SFX + neon ambient music
   No external assets: everything synthesized.
   ============================================================ */
(function (RS) {
  'use strict';

  let ctx = null, master = null, musicGain = null, sfxGain = null;
  let musicOn = true, sfxOn = true, started = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.34; musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.gain.value = 0.85; sfxGain.connect(master);
    // white-noise buffer for percussion / smash
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (!started) { started = true; startMusic(); }
  }

  /* ---------- basic voice ---------- */
  function tone(o) {
    if (!ctx) return;
    if (o.bus !== 'music' && !sfxOn) return;
    const t0 = o.at || ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
    const bus = o.bus === 'music' ? musicGain : sfxGain;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(o.vol ?? 0.3, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g); g.connect(bus);
    if (o.pan !== undefined) {
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (p) { p.pan.value = o.pan; g.disconnect(); g.connect(p); p.connect(bus); }
    }
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }

  function noise(o) {
    if (!ctx) return;
    const t0 = o.at || ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t0 + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol ?? 0.3, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(sfxOn ? sfxGain : master);
    src.start(t0); src.stop(t0 + o.dur + 0.05);
  }

  /* ---------- game SFX ---------- */
  const SFX = {
    click() { tone({ type: 'square', f0: 700, f1: 900, dur: 0.06, vol: 0.12 }); },
    aimTick(p) { tone({ type: 'triangle', f0: 300 + p * 500, dur: 0.03, vol: 0.05 }); },
    launch() {
      ensure(); if (!ctx) return;
      const t = ctx.currentTime;
      noise({ at: t, f0: 900, f1: 120, dur: 0.35, vol: 0.5, filter: 'lowpass' });
      tone({ at: t, type: 'sine', f0: 160, f1: 40, dur: 0.3, vol: 0.6 });
      tone({ at: t, type: 'sawtooth', f0: 400, f1: 90, dur: 0.18, vol: 0.15 });
    },
    thud(v, pan) {
      ensure(); if (!ctx) return;
      const t = ctx.currentTime;
      tone({ at: t, type: 'sine', f0: 120, f1: 45, dur: 0.12, vol: Math.min(0.5, v) });
      noise({ at: t, f0: 300, f1: 90, dur: 0.09, vol: Math.min(0.3, v * .6), filter: 'lowpass', q: 1 });
    },
    glass(pan) {
      ensure(); if (!ctx) return;
      const t = ctx.currentTime;
      noise({ at: t, f0: 5200, f1: 2600, dur: 0.22, vol: 0.4, filter: 'highpass', q: 0.7 });
      for (let i = 0; i < 4; i++)
        tone({ at: t + i * 0.02, type: 'triangle', f0: 2200 + Math.random() * 2600, dur: 0.09, vol: 0.08, pan: (pan || 0) + (Math.random() - .5) * .4 });
    },
    pop(pan) {
      ensure(); if (!ctx) return;
      const t = ctx.currentTime;
      tone({ at: t, type: 'sine', f0: 500, f1: 1400, dur: 0.09, vol: 0.3, pan: pan || 0 });
      noise({ at: t, f0: 1800, f1: 500, dur: 0.12, vol: 0.25, filter: 'bandpass', q: 2 });
    },
    coin(pan) {
      ensure(); if (!ctx) return;
      const t = ctx.currentTime;
      tone({ at: t, type: 'square', f0: 1320, dur: 0.06, vol: 0.12, pan: pan || 0 });
      tone({ at: t + 0.06, type: 'square', f0: 1980, dur: 0.12, vol: 0.12, pan: pan || 0 });
    },
    crown() {
      ensure(); if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ at: t + i * 0.09, type: 'triangle', f0: f, dur: 0.3, vol: 0.2 }));
    },
    chain(n) {
      ensure(); if (!ctx) return;
      const t = ctx.currentTime;
      tone({ at: t, type: 'sawtooth', f0: 300 + n * 120, f1: 900 + n * 200, dur: 0.15, vol: 0.14 });
    },
    win() {
      ensure(); if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046, 1318].forEach((f, i) => {
        tone({ at: t + i * 0.12, type: 'triangle', f0: f, dur: 0.5, vol: 0.22 });
        tone({ at: t + i * 0.12, type: 'sine', f0: f / 2, dur: 0.5, vol: 0.12 });
      });
    },
    fail() {
      ensure(); if (!ctx) return;
      const t = ctx.currentTime;
      [400, 320, 240, 160].forEach((f, i) =>
        tone({ at: t + i * 0.14, type: 'sawtooth', f0: f, dur: 0.3, vol: 0.16 }));
    },
    reload() {
      ensure(); if (!ctx) return;
      const t = ctx.currentTime;
      tone({ at: t, type: 'square', f0: 220, f1: 330, dur: 0.08, vol: 0.12 });
      tone({ at: t + 0.1, type: 'square', f0: 330, f1: 440, dur: 0.08, vol: 0.12 });
    },
  };

  /* ---------- synthwave background music ---------- */
  let musicTimer = null, step = 0;
  const BASS = [55, 55, 65.4, 65.4, 49, 49, 58.3, 58.3];          // A A C C G G Bb Bb
  const ARP  = [[220, 261.6, 329.6], [220, 261.6, 329.6], [261.6, 329.6, 392], [261.6, 329.6, 392],
                [196, 246.9, 293.7], [196, 246.9, 293.7], [233, 293.7, 349.2], [233, 293.7, 349.2]];
  function startMusic() {
    ensure();
    if (!ctx || musicTimer) return;
    const bpm = 104, beat = 60 / bpm;
    step = 0;
    const tick = () => {
      if (!ctx) return;
      const t = ctx.currentTime + 0.06;
      const bar = Math.floor(step / 8) % 8;
      const s = step % 8;
      if (musicOn) {
        // bass on beats 0 and 4
        if (s === 0 || s === 4)
          tone({ bus: 'music', at: t, type: 'sawtooth', f0: BASS[bar], dur: beat * 0.9, vol: 0.16, attack: 0.01 });
        // arpeggio 16ths-ish
        const notes = ARP[bar];
        tone({ bus: 'music', at: t + beat * (s / 8), type: 'triangle', f0: notes[s % 3] * 2, dur: beat * 0.16, vol: 0.05 });
        // soft hat
        if (s % 2 === 1 && noiseBuf) {
          const src = ctx.createBufferSource(); src.buffer = noiseBuf;
          const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.05, t + beat * (s / 8));
          g.gain.exponentialRampToValueAtTime(0.0001, t + beat * (s / 8) + 0.05);
          src.connect(f); f.connect(g); g.connect(musicGain);
          src.start(t + beat * (s / 8)); src.stop(t + beat * (s / 8) + 0.08);
        }
      }
      step++;
    };
    musicTimer = setInterval(tick, (60 / 104) * 1000 / 8);
  }

  RS.audio = {
    resume, SFX,
    set music(v) { musicOn = v; }, get music() { return musicOn; },
    set sfx(v) { sfxOn = v; }, get sfx() { return sfxOn; },
  };
})(window.RS = window.RS || {});
