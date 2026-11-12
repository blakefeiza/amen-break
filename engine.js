/* AMEN — audio engine + the break itself.
 *
 * The drums are synthesized in the browser (rendered once into buffers with an OfflineAudioContext)
 * and played back at a variable playbackRate, so changing tempo also changes pitch, exactly like
 * speeding up or slowing down a sampled record. Nothing here is the 1969 recording.
 *
 * Pattern: four bars of sixteenth-note steps, transcribed after Ethan Hein's "Building the Amen break"
 * and the AudioLabs Erlangen analysis. Microtiming ("the groove") is not represented.
 */
(function () {
  'use strict';

  const BASE_BPM = 136;
  const VOICES = ['kick', 'snare', 'ghost', 'ride', 'crash'];
  const VOICE_GAIN = { kick: 1, snare: 0.85, ghost: 0.7, ride: 0.38, crash: 0.42 };

  const eighths = (skip) => [0, 2, 4, 6, 8, 10, 12, 14].filter((s) => !(skip || []).includes(s));
  const BARS = [
    { kick: [[0, .95], [2, .8], [10, .7], [11, .95]], snare: [[4, 1], [12, 1]], ghost: [[7, .4], [9, .45], [15, .4]], ride: eighths(), crash: [] },
    { kick: [[0, .95], [2, .8], [10, .7], [11, .95]], snare: [[4, 1], [12, 1]], ghost: [[7, .4], [9, .45], [15, .4]], ride: eighths(), crash: [] },
    { kick: [[0, .95], [2, .8], [10, .85]],            snare: [[4, 1], [14, 1]], ghost: [[7, .4], [9, .45]],        ride: eighths(), crash: [] },
    { kick: [[2, .85], [3, .95], [10, .85]],           snare: [[4, 1], [14, 1]], ghost: [[1, .4], [7, .4], [9, .45]], ride: eighths([10]), crash: [[10, .9]] },
  ];
  const EXPECTED = [0, 1, 0, 1]; // what you'd play if bars 3-4 just repeated bars 1-2

  function barHits(bar, step) {
    const b = BARS[bar], h = { kick: 0, snare: 0, ghost: 0, ride: 0, crash: 0 };
    for (const v of ['kick', 'snare', 'ghost', 'crash']) for (const [s, vel] of b[v]) if (s === step) h[v] = vel;
    if (b.ride.includes(step)) h.ride = step % 4 === 0 ? 0.62 : 0.46;
    return h;
  }
  // HITS[src] for src in 0..63 (as written), HITS_EXP[src] for the "expected" version
  const HITS = [], HITS_EXP = [];
  for (let s = 0; s < 64; s++) {
    HITS.push(barHits(s >> 4, s & 15));
    HITS_EXP.push(barHits(EXPECTED[s >> 4], s & 15));
  }
  const hits = (src, expected) => (expected ? HITS_EXP : HITS)[((src % 64) + 64) % 64];

  /* ------------------------------------------------------------------ audio graph */
  let ctx = null, bus, out, analyser, kit = null, kitPromise = null;
  const T = {
    bpm: BASE_BPM, playing: false, tick: 0, next: 0, timer: null, mode: 'full', seq: null,
    layers: { kick: 1, snare: 1, ghost: 1, ride: 1, crash: 1 }, expected: false, swing: 0.055,
    audible: false, domain: 'perf', events: [], evId: 0, duck: false, vol: 0.5,
  };
  const lvl = () => 0.7 * T.vol * T.vol;      // 50% on the slider is deliberately gentle; 100% is about the old default
  const pvl = () => 0.8 * T.vol * T.vol;      // song previews are mastered hot, so they get the same curve
  const now = () => (T.domain === 'ctx' && ctx ? ctx.currentTime : performance.now() / 1000);

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    bus = ctx.createGain(); bus.gain.value = 0.8;
    const shaper = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6); }
    shaper.curve = curve; shaper.oversample = '2x';
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 8500;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.12;
    out = ctx.createGain(); out.gain.value = lvl();
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.6;
    bus.connect(shaper); shaper.connect(tone); tone.connect(comp); comp.connect(out); out.connect(ctx.destination);
    comp.connect(analyser);
    return ctx;
  }

  function buildKit() {
    if (kitPromise) return kitPromise;
    const sr = ctx.sampleRate;
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const noiseBuf = (oc, dur) => {
      const b = oc.createBuffer(1, Math.ceil(oc.sampleRate * dur), oc.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    };
    const env = (oc, peak, atk, dec, end) => {
      const g = oc.createGain();
      g.gain.setValueAtTime(0.0001, 0); g.gain.linearRampToValueAtTime(peak, atk);
      g.gain.exponentialRampToValueAtTime(0.0008, end || dec); return g;
    };
    const metals = (oc, dest) => {
      [263, 400, 421, 474, 587, 845].forEach((f) => {
        const o = oc.createOscillator(); o.type = 'square'; o.frequency.value = f * 1.42;
        const g = oc.createGain(); g.gain.value = 0.17; o.connect(g); g.connect(dest); o.start(0);
      });
    };
    const render = (dur, fn) => {
      const oc = new OAC(1, Math.ceil(sr * dur), sr); fn(oc);
      return oc.startRendering().then((buf) => {
        const d = buf.getChannelData(0); let pk = 0;
        for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
        const k = pk ? 0.9 / pk : 1; for (let i = 0; i < d.length; i++) d[i] *= k;
        return buf;
      });
    };
    const voices = {
      kick: render(0.5, (oc) => {
        const o = oc.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(175, 0); o.frequency.exponentialRampToValueAtTime(55, 0.07); o.frequency.exponentialRampToValueAtTime(42, 0.4);
        const g = env(oc, 1, 0.004, 0, 0.42); o.connect(g); g.connect(oc.destination); o.start(0); o.stop(0.45);
        const c = oc.createOscillator(); c.type = 'triangle'; c.frequency.value = 1100;
        const cg = oc.createGain(); cg.gain.setValueAtTime(0.35, 0); cg.gain.exponentialRampToValueAtTime(0.001, 0.012);
        c.connect(cg); cg.connect(oc.destination); c.start(0); c.stop(0.02);
      }),
      snare: render(0.45, (oc) => {
        const n = oc.createBufferSource(); n.buffer = noiseBuf(oc, 0.4);
        const bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 0.6;
        const ng = env(oc, 1, 0.002, 0, 0.34); n.connect(bp); bp.connect(ng); ng.connect(oc.destination); n.start(0);
        const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000;
        const n2 = oc.createBufferSource(); n2.buffer = noiseBuf(oc, 0.2); const g2 = env(oc, 0.35, 0.002, 0, 0.2);
        n2.connect(hp); hp.connect(g2); g2.connect(oc.destination); n2.start(0);
        const t = oc.createOscillator(); t.type = 'triangle'; t.frequency.setValueAtTime(205, 0); t.frequency.exponentialRampToValueAtTime(150, 0.1);
        const tg = env(oc, 0.55, 0.002, 0, 0.17); t.connect(tg); tg.connect(oc.destination); t.start(0); t.stop(0.2);
      }),
      ghost: render(0.16, (oc) => {
        const n = oc.createBufferSource(); n.buffer = noiseBuf(oc, 0.2);
        const bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2800; bp.Q.value = 0.7;
        const g = env(oc, 1, 0.002, 0, 0.13); n.connect(bp); bp.connect(g); g.connect(oc.destination); n.start(0);
        const t = oc.createOscillator(); t.type = 'triangle'; t.frequency.value = 230;
        const tg = env(oc, 0.2, 0.002, 0, 0.05); t.connect(tg); tg.connect(oc.destination); t.start(0); t.stop(0.08);
      }),
      ride: render(0.5, (oc) => {
        const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6200;
        const bp = oc.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 9800; bp.Q.value = 0.45;
        const g = env(oc, 0.9, 0.001, 0, 0.48); metals(oc, hp); hp.connect(bp); bp.connect(g); g.connect(oc.destination);
        const p = oc.createOscillator(); p.type = 'sine'; p.frequency.value = 3900;
        const pg = env(oc, 0.12, 0.001, 0, 0.3); p.connect(pg); pg.connect(oc.destination); p.start(0); p.stop(0.3);
      }),
      crash: render(1.5, (oc) => {
        const hp = oc.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
        const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 14000;
        const g = env(oc, 1, 0.003, 0, 1.45); metals(oc, hp);
        const n = oc.createBufferSource(); n.buffer = noiseBuf(oc, 1.5); const ng = oc.createGain(); ng.gain.value = 0.7; n.connect(ng); ng.connect(hp); n.start(0);
        hp.connect(lp); lp.connect(g); g.connect(oc.destination);
      }),
    };
    kitPromise = Promise.all(VOICES.map((v) => voices[v])).then((bufs) => {
      kit = {}; VOICES.forEach((v, i) => (kit[v] = bufs[i])); return kit;
    });
    return kitPromise;
  }

  function trigger(voice, t, vel) {
    if (!kit || !T.audible || T.duck) return;
    const s = ctx.createBufferSource(); s.buffer = kit[voice];
    s.playbackRate.value = T.bpm / BASE_BPM;
    const g = ctx.createGain(); g.gain.value = vel * VOICE_GAIN[voice];
    s.connect(g); g.connect(bus); s.start(Math.max(t, ctx.currentTime));
  }

  /* ------------------------------------------------------------------ transport */
  const srcOf = (tick) => {
    if (T.mode === 'chop' && T.seq) {
      const slot = Math.floor(tick / 4) % 16;
      return T.seq[slot] * 4 + (tick % 4);
    }
    return tick % 64;
  };
  const stepDur = () => 60 / T.bpm / 4;

  function playStep(src, t) {
    const h = hits(src, T.expected);
    for (const v of VOICES) if (T.layers[v] && h[v]) trigger(v, t, h[v]);
  }
  function pump() {
    if (T.next < now() - 0.4) T.next = now() + 0.05; // tab was asleep: don't fire a burst of catch-up steps
    const horizon = now() + 0.12;
    while (T.next < horizon) {
      const sd = stepDur(), t = T.next + (T.tick % 2 ? T.swing * sd : 0), src = srcOf(T.tick);
      T.events.push({ id: ++T.evId, time: t, src, sd, tick: T.tick, expected: T.expected, layers: Object.assign({}, T.layers) });
      playStep(src, t);
      T.tick++; T.next += sd;
    }
    const cutoff = now() - 2;
    while (T.events.length && T.events[0].time < cutoff) T.events.shift();
  }
  function start(opts) {
    if (T.playing) { if (opts) Object.assign(T, opts); return; }
    if (opts) Object.assign(T, opts);
    T.playing = true; T.tick = 0; T.events = []; T.next = now() + 0.06;
    pump(); T.timer = setInterval(pump, 25);
  }
  function stop() {
    T.playing = false; clearInterval(T.timer); T.timer = null;
    // let events finish drawing, then clear
    setTimeout(() => { if (!T.playing) T.events = []; }, 400);
  }
  function visualNow() {
    const lat = T.domain === 'ctx' && ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0;
    return now() - lat;
  }
  /** Fractional source step currently sounding, or null when stopped. */
  function playhead() {
    if (!T.playing || !T.events.length) return null;
    const vn = visualNow(); let ev = null;
    for (let i = T.events.length - 1; i >= 0; i--) if (!T.events[i].aud && T.events[i].time <= vn) { ev = T.events[i]; break; }
    if (!ev) return null;
    return { src: ev.src + Math.min(1, Math.max(0, (vn - ev.time) / ev.sd)), id: ev.id, ev };
  }
  /** Events whose sound has reached the speakers since `lastId`. */
  function eventsSince(lastId) {
    const vn = visualNow();
    return T.events.filter((e) => e.id > lastId && e.time <= vn);
  }
  /** Play a few steps of the break once (used for tapping the wheel and the pads). */
  function audition(srcStart, count, opts) {
    const t0 = now() + 0.015, sd = stepDur(), expected = opts && opts.expected != null ? opts.expected : T.expected;
    const layers = opts && opts.allLayers ? { kick: 1, snare: 1, ghost: 1, ride: 1, crash: 1 } : Object.assign({}, T.layers);
    for (let i = 0; i < (count || 1); i++) {
      const src = ((srcStart + i) % 64 + 64) % 64, t = t0 + i * sd, h = hits(src, expected);
      for (const v of VOICES) if (layers[v] && h[v]) trigger(v, t, h[v]);
      // schedule a visual event so wheels flash (kept out of the playhead search by `aud`)
      T.events.push({ id: ++T.evId, time: t, src, sd, tick: -1, aud: true, expected, layers });
    }
    T.events.sort((a, b) => a.time - b.time);
  }

  async function enable() {
    ensureCtx();
    try { await ctx.resume(); } catch (e) { /* ignore */ }
    await buildKit();
    if (T.domain !== 'ctx') {
      const delta = ctx.currentTime - performance.now() / 1000;
      T.next += delta; T.events.forEach((e) => (e.time += delta)); T.domain = 'ctx';
    }
    T.audible = true; out.gain.setTargetAtTime(T.duck ? 0 : lvl(), ctx.currentTime, 0.02);
    return true;
  }
  function mute() { T.audible = false; if (out) out.gain.setTargetAtTime(0, ctx.currentTime, 0.02); }
  function setDuck(on, tc) {
    T.duck = on; if (out) out.gain.setTargetAtTime(on || !T.audible ? 0 : lvl(), ctx.currentTime, tc || 0.03);
  }
  function unmute() { T.audible = true; if (out) out.gain.setTargetAtTime(T.duck ? 0 : lvl(), ctx.currentTime, 0.02); }

  function setVolume(v) {
    T.vol = Math.max(0, Math.min(1, v));
    if (out && T.audible && !T.duck) out.gain.setTargetAtTime(lvl(), ctx.currentTime, 0.03);
    Preview.setVolume(T.vol);
  }

  /** Short synthesized blip (used to sonify the Echoes chart). */
  function ping(freq, when, dur, gain, type) {
    if (!ctx || !T.audible || T.duck) return;
    const t = Math.max(ctx.currentTime, when || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'triangle'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain || 0.18, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0005, t + (dur || 0.25));
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + (dur || 0.25) + 0.02);
  }
  function scope(buf) { if (analyser) analyser.getByteTimeDomainData(buf); return !!analyser; }

  /* ------------------------------------------------------------------ 30-second previews (Apple iTunes Search API) */
  const Preview = (function () {
    const el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous';
    let fadeMul = 1, fadeRaf = 0, pg = null;   // pg: gain node once the element is routed through Web Audio (volume then works on iOS too)
    const applyEl = () => { const v = Math.max(0, Math.min(1, pvl() * fadeMul)); if (pg) { pg.gain.value = v; el.volume = 1; } else el.volume = v; };
    const route = () => { if (pg || !ctx) return; try { const s = ctx.createMediaElementSource(el); pg = ctx.createGain(); s.connect(pg); pg.connect(ctx.destination); } catch (err) { pg = null; } applyEl(); };
    applyEl();
    let current = null; const cache = {};
    const emit = (id, state) => document.dispatchEvent(new CustomEvent('amen:preview', { detail: { id: String(id), state } }));
    el.addEventListener('ended', () => { const id = current; current = null; if (id) emit(id, 'idle'); setDuck(false, 0.3); });
    el.addEventListener('pause', () => { if (current && !el.ended) { const id = current; current = null; emit(id, 'idle'); setDuck(false, 0.3); } });
    el.addEventListener('error', () => { if (current) { const id = current; current = null; emit(id, 'error'); setDuck(false); } });
    async function urlFor(id) {
      if (cache[id]) return cache[id];
      try { const s = sessionStorage.getItem('amen-prev-' + id); if (s) return (cache[id] = s); } catch (e) { /* ignore */ }
      let u = null;
      for (const country of ['us', 'gb']) {   // some tracks only exist in the UK storefront
        const r = await fetch('https://itunes.apple.com/lookup?id=' + encodeURIComponent(id) + '&country=' + country);
        const j = await r.json(); u = j.results && j.results[0] && j.results[0].previewUrl; if (u) break;
      }
      if (!u) throw new Error('no preview');
      cache[id] = u; try { sessionStorage.setItem('amen-prev-' + id, u); } catch (e) { /* ignore */ }
      return u;
    }
    let loading = null;
    async function toggle(id, opts) {
      id = String(id);
      if (current === id) { el.pause(); return; }
      if (loading === id) { loading = null; emit(id, 'idle'); return; }     // second click while it loads cancels
      if (current) { const old = current; current = null; el.pause(); emit(old, 'idle'); }
      if (loading) emit(loading, 'idle');
      loading = id; emit(id, 'loading');
      try {
        ensureCtx(); try { await ctx.resume(); } catch (err) { /* ignore */ }
        route();
        const u = await urlFor(id); if (loading !== id) return;
        el.src = u; current = id; loading = null;
        setDuck(true, opts && opts.fade ? 0.5 : 0.03); await el.play(); emit(id, 'playing');
      } catch (e) { if (loading === id) loading = null; current = null; setDuck(false); emit(id, 'error'); }
    }
    // iOS Safari ignores script control of media volume; the page tells people to use the phone's buttons there
    function setVolume() { applyEl(); }
    function fadeTo(target, ms, done) {
      cancelAnimationFrame(fadeRaf);
      if (volumeLocked()) { fadeMul = target; applyEl(); if (done) done(); return; }
      const from = fadeMul, t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / ms); fadeMul = from + (target - from) * k; applyEl(); if (k < 1) fadeRaf = requestAnimationFrame(step); else if (done) done(); };
      fadeRaf = requestAnimationFrame(step);
    }
    /** Start a preview with a fade-in while the synth loop fades out. */
    async function auto(id) {
      id = String(id); if (current === id || loading === id) return;
      cancelAnimationFrame(fadeRaf); fadeMul = 0; applyEl();
      await toggle(id, { fade: true });
      if (current === id) fadeTo(1, 1800); else { fadeMul = 1; applyEl(); }
    }
    /** Fade the current preview out and bring the synth loop back underneath it. */
    function fadeStop(ms) {
      if (!current && !loading) return;
      setDuck(false, 0.35);
      fadeTo(0, ms || 900, () => { if (current) el.pause(); fadeMul = 1; applyEl(); });
    }
    function volumeLocked() { if (pg) return false; const old = el.volume; el.volume = old > 0.5 ? 0.25 : 0.75; const locked = Math.abs(el.volume - (old > 0.5 ? 0.25 : 0.75)) > 0.001; el.volume = old; return locked; }
    function stopAll() { cancelAnimationFrame(fadeRaf); fadeMul = 1; applyEl(); if (loading) { const l = loading; loading = null; emit(l, 'idle'); } if (current) el.pause(); }
    return { toggle, auto, fadeStop, stopAll, setVolume, volumeLocked, get current() { return current; }, get level() { return pg ? pg.gain.value : el.volume; }, get routed() { return !!pg; } };
  })();

  window.Amen = {
    BASE_BPM, VOICES, BARS, EXPECTED, hits, T, start, stop, playhead, eventsSince, audition,
    enable, mute, unmute, setDuck, ping, scope, Preview, srcOf, setVolume,
    get vol() { return T.vol; },
    get ctx() { return ctx; }, get ready() { return !!kit; }, get kit() { return kit; },
    setBpm(b) { T.bpm = b; }, setLayers(l) { Object.assign(T.layers, l); },
  };
})();
