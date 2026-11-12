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
    audible: false, domain: 'perf', events: [], evId: 0, duck: false, vol: 0.5, nudge: 0,
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
    const sr = ctx ? ctx.sampleRate : 44100;
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
    return now() - lat - T.nudge;   // T.nudge: the listener's own delay for the picture (Bluetooth speakers)
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

  /* ------------------------------------------------------------------ 30-second previews (Apple iTunes Search API)
   * Previews are fetched, decoded and played on the same Web Audio clock as the drums. That lets the picture be driven
   * by the clip itself: each clip is analyzed ahead of time for kick / snare / hi-hat hits, and the wheel draws every hit
   * at the moment it is heard (audio clock, minus the device's output latency, minus the listener's own nudge).
   */
  const Preview = (function () {
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const emit = (id, state) => document.dispatchEvent(new CustomEvent('amen:preview', { detail: { id: String(id), state } }));
    const slowNet = () => { const c = navigator.connection; return !!(c && (c.saveData || /2g/.test(c.effectiveType || ''))); };
    const urlMap = {}, raw = new Map(), bufs = new Map(), ana = new Map(), pending = new Map();
    try { Object.assign(urlMap, JSON.parse(sessionStorage.getItem('amen-urls') || '{}')); } catch (err) { /* ignore */ }
    const saveUrls = () => { try { sessionStorage.setItem('amen-urls', JSON.stringify(urlMap)); } catch (err) { /* ignore */ } };
    const once = (key, fn) => { if (pending.has(key)) return pending.get(key); const p = fn(); pending.set(key, p); const done = () => pending.delete(key); p.then(done, done); return p; };
    let current = null, loading = null, token = 0, node = null, lastView = null, fx = [], legacyOn = false;

    // ---- data: one batched lookup for every URL, then bytes, then decoded audio, then analysis
    async function lookup(ids) {
      const need = ids.map(String).filter((i) => !urlMap[i]); if (!need.length) return;
      for (const country of ['us', 'gb']) {            // a few tracks only exist in the UK storefront
        const missing = need.filter((i) => !urlMap[i]); if (!missing.length) break;
        const r = await fetch('https://itunes.apple.com/lookup?id=' + missing.join(',') + '&country=' + country); const j = await r.json();
        (j.results || []).forEach((x) => { if (x.previewUrl) urlMap[String(x.trackId)] = x.previewUrl; });
      }
      saveUrls();
    }
    const getUrl = (id) => (urlMap[id] ? Promise.resolve(urlMap[id]) : once('u' + id, async () => { await lookup([id]); if (!urlMap[id]) throw new Error('no preview'); return urlMap[id]; }));
    const getRaw = (id) => (raw.has(id) ? Promise.resolve(raw.get(id)) : once('r' + id, async () => {
      const r = await fetch(await getUrl(id), { mode: 'cors' }); if (!r.ok) throw new Error('fetch ' + r.status);
      const ab = await r.arrayBuffer(); raw.set(id, ab); if (raw.size > 40) raw.delete(raw.keys().next().value); return ab;
    }));
    let dctx = null;                                                  // decoding needs no user gesture and no live AudioContext
    const decode = (ab) => { if (!dctx) dctx = new OAC(2, 1, 44100); return new Promise((res, rej) => { const p = dctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); };
    const getBuf = (id) => {
      if (bufs.has(id)) { const b = bufs.get(id); bufs.delete(id); bufs.set(id, b); return Promise.resolve(b); }
      return once('b' + id, async () => {
        const b = await decode((await getRaw(id)).slice(0)); bufs.set(id, b);
        while (bufs.size > 4) { const k = [...bufs.keys()].find((x) => x !== current); if (k === undefined) break; bufs.delete(k); }
        return b;
      });
    };

    // ---- analysis: three band envelopes rendered off the main thread, then onset picking with cross-band suppression
    const CFG = { low: 95, lowStages: 2, mid: 1800, midQ: 0.5, high: 8000, kSup: 0.8, sSup: 0.7, hSup: 0.4, gaps: [90, 130, 80], ks: [1.4, 2, 1.9], floor: 0.2, shift: 0.005, snareLin: true, sFloor: 0.8, kShift: 0.016 };
    function novelty(env) {
      const n = env.length, srt = Float32Array.from(env).sort(), p95 = srt[Math.floor(n * 0.95)] || 1e-6, nv = new Float32Array(n);
      for (let i = 2; i < n; i++) nv[i] = Math.max(0, Math.log(1 + 30 * env[i] / p95) - Math.log(1 + 30 * env[i - 2] / p95));
      return nv;
    }
    function noveltyLin(env) {      // loudness-weighted: a quiet tick after silence is small, a loud hit is big
      const n = env.length, srt = Float32Array.from(env).sort(), p95 = srt[Math.floor(n * 0.95)] || 1e-6, nv = new Float32Array(n);
      for (let i = 2; i < n; i++) nv[i] = Math.max(0, (env[i] - env[i - 2]) / p95) * 1.6;
      return nv;
    }
    function pick(nv, fr, gapMs, k, floor, shift) {
      const n = nv.length, out = [], win = 100; let last = -1e9;
      for (let i = 3; i < n - 3; i++) {
        if (nv[i] < nv[i - 1] || nv[i] <= nv[i + 1]) continue;
        let s = 0, c = 0; for (let j = Math.max(0, i - win); j < Math.min(n, i + win); j += 2) { s += nv[j]; c++; }
        if (nv[i] > (s / c) * k + floor && ((i - last) * 1000) / fr >= gapMs) { out.push({ t: Math.max(0, i / fr - shift), v: Math.min(1, 0.3 + nv[i] / 1.2) }); last = i; }
      }
      return out;
    }
    const analyze = (id, buf, over) => (ana.has(id) && !over ? Promise.resolve(ana.get(id)) : once('a' + id + (over ? Math.random() : ''), async () => {
      const C = Object.assign({}, CFG, over), sr = 32000, hop = 160, fr = sr / hop, oc = new OAC(3, Math.ceil(buf.duration * sr), sr), src = oc.createBufferSource(); src.buffer = buf;
      const merger = oc.createChannelMerger(3), absCurve = new Float32Array([1, 0, 1]);
      const chain = (ch, type, f, q, stages) => {
        let node = src;
        for (let s = 0; s < stages; s++) { const filt = oc.createBiquadFilter(); filt.type = type; filt.frequency.value = f; filt.Q.value = q; node.connect(filt); node = filt; }
        const ws = oc.createWaveShaper(); ws.curve = absCurve; const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 35;
        node.connect(ws); ws.connect(lp); lp.connect(merger, 0, ch);
      };
      chain(0, 'lowpass', C.low, 0.7, C.lowStages); chain(1, 'bandpass', C.mid, C.midQ, 1); chain(2, 'highpass', C.high, 0.7, 1);
      merger.connect(oc.destination); src.start(0);
      const rendered = await oc.startRendering(), envs = [0, 1, 2].map((ch) => {
        const d = rendered.getChannelData(ch), n = Math.floor(d.length / hop), env = new Float32Array(n);
        for (let k = 0; k < n; k++) { let m = 0; for (let q = k * hop; q < k * hop + hop; q++) if (d[q] > m) m = d[q]; env[k] = m; }
        return env;
      }), nvs = envs.map(novelty), lin = envs.map(noveltyLin);
      const n = Math.min(nvs[0].length, nvs[1].length, nvs[2].length), kn = new Float32Array(n), sn = new Float32Array(n), hn = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        kn[k] = Math.max(0, nvs[0][k] - C.kSup * nvs[1][k]);                 // a snare's body is not a kick
        sn[k] = C.snareLin ? lin[1][k] : Math.max(0, nvs[1][k] - C.sSup * nvs[2][k]);   // a ride tick is not a snare: weigh by loudness
        hn[k] = Math.max(0, nvs[2][k] - C.hSup * nvs[1][k]);                 // and a snare crack is not a hi-hat
      }
      const marks = [].concat(pick(kn, fr, C.gaps[0], C.ks[0], C.floor, C.kShift).map((m) => (m.b = 0, m)), pick(sn, fr, C.gaps[1], C.ks[1], C.snareLin ? C.sFloor : C.floor, C.shift).map((m) => (m.b = 1, m)), pick(hn, fr, C.gaps[2], C.ks[2], C.floor, C.shift).map((m) => (m.b = 2, m))).sort((a, b) => a.t - b.t);
      const res = { marks, dur: buf.duration }; if (!over) ana.set(id, res); return res;
    }));

    // ---- playback graph: source -> fade -> volume -> speakers, with an analyser tapped before the volume
    let fade = null, vol = null, an = null;
    const spec = new Uint8Array(512), bands = new Float32Array(64);
    function graph() { if (fade) return; fade = ctx.createGain(); vol = ctx.createGain(); an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.55; vol.gain.value = pvl(); fade.connect(vol); vol.connect(ctx.destination); fade.connect(an); }
    const vlat = () => (ctx.outputLatency || ctx.baseLatency || 0) + T.nudge;
    function start(id, buf, opts) {
      graph();
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(fade);
      const t0 = ctx.currentTime + 0.03, fadeIn = !!(opts && opts.fade);
      fade.gain.cancelScheduledValues(0);
      if (fadeIn) { fade.gain.setValueAtTime(0.0001, t0); fade.gain.linearRampToValueAtTime(1, t0 + 1.8); } else fade.gain.setValueAtTime(1, t0);
      src.start(t0); node = { src, id, t0, dur: buf.duration }; current = id;
      setDuck(true, fadeIn ? 0.5 : 0.03);
      src.onended = () => { if (node && node.src === src) { const i = current; node = null; current = null; emit(i, 'idle'); setDuck(false, 0.3); } };
      emit(id, 'playing'); analyze(id, buf).catch(() => {});
    }
    function stopNow() {
      if (legacyOn) { legacyOn = false; el.pause(); const i = current; current = null; if (i) emit(i, 'idle'); setDuck(false, 0.3); return; }
      if (!node) return; const n = node, id = current; node = null; current = null; n.src.onended = null;
      try { const t = ctx.currentTime; fade.gain.cancelScheduledValues(t); fade.gain.setValueAtTime(fade.gain.value, t); fade.gain.linearRampToValueAtTime(0.0001, t + 0.04); n.src.stop(t + 0.05); } catch (err) { /* ignore */ }
      emit(id, 'idle'); setDuck(false, 0.3);
    }
    // a plain <audio> element is the fallback if fetching or decoding fails
    const el = new Audio(); el.preload = 'none';
    el.addEventListener('ended', () => { if (legacyOn) stopNow(); });
    async function legacyPlay(id, opts) {
      try { el.src = await getUrl(id); el.volume = pvl(); legacyOn = true; current = id; setDuck(true, opts && opts.fade ? 0.5 : 0.03); await el.play(); emit(id, 'playing'); }
      catch (err) { legacyOn = false; current = null; setDuck(false); emit(id, 'error'); }
    }
    async function toggle(id, opts) {
      id = String(id);
      if (current === id) { stopNow(); return; }                       // second click stops
      if (loading === id) { loading = null; emit(id, 'idle'); return; } // second click while it loads cancels
      if (current) stopNow();
      if (loading) emit(loading, 'idle');
      loading = id; const my = ++token; emit(id, 'loading');
      try {
        ensureCtx(); const resumed = ctx.resume().catch(() => {});
        const buf = await getBuf(id); await resumed;
        if (loading !== id || my !== token) return;
        loading = null; start(id, buf, opts);
      } catch (err) { if (loading !== id || my !== token) return; loading = null; await legacyPlay(id, opts); }
    }
    const auto = async (id) => { id = String(id); if (current === id || loading === id) return; await toggle(id, { fade: true }); };
    function fadeStop(ms) {
      if (loading) { const l = loading; loading = null; emit(l, 'idle'); }
      if (legacyOn) { stopNow(); return; }
      if (!node) return; const n = node, t = ctx.currentTime, d = (ms || 900) / 1000;
      fade.gain.cancelScheduledValues(t); fade.gain.setValueAtTime(fade.gain.value, t); fade.gain.linearRampToValueAtTime(0.0001, t + d);
      setDuck(false, 0.35); setTimeout(() => { if (node && node.src === n.src) stopNow(); }, ms + 40);
    }
    function stopAll() { if (loading) { const l = loading; loading = null; emit(l, 'idle'); } stopNow(); }
    function setVolume() { if (vol) vol.gain.setTargetAtTime(pvl(), ctx.currentTime, 0.02); if (legacyOn) el.volume = pvl(); }

    // ---- what the picture reads every frame
    function view() { if (!node) return null; const a = ana.get(node.id); return { id: node.id, pos: Math.max(0, ctx.currentTime - node.t0 - vlat()), dur: node.dur, marks: a ? a.marks : null }; }
    let fxIdx = 0, fxMarks = null, fxId = null;
    function tick() {
      const v = view(); lastView = v; fx = [];
      if (!v || !v.marks) return v;
      if (fxMarks !== v.marks || fxId !== v.id) { fxMarks = v.marks; fxId = v.id; fxIdx = 0; while (fxIdx < v.marks.length && v.marks[fxIdx].t < v.pos - 0.2) fxIdx++; }
      while (fxIdx < v.marks.length && v.marks[fxIdx].t <= v.pos) fx.push(v.marks[fxIdx++]);
      return v;
    }
    function spectrum() {
      if (!an || !node) return null; an.getByteFrequencyData(spec); const binHz = ctx.sampleRate / 1024;
      for (let i = 0; i < 64; i++) {
        const a = Math.max(1, Math.floor(60 * Math.pow(13000 / 60, i / 64) / binHz)), b = Math.max(a + 1, Math.ceil(60 * Math.pow(13000 / 60, (i + 1) / 64) / binHz)); let s = 0;
        for (let k = a; k < b && k < 512; k++) s += spec[k]; bands[i] = s / ((b - a) * 255);
      }
      return bands;
    }

    // ---- smart loading hooks
    const prime = (ids) => lookup(ids.map(String)).catch(() => {});
    const prefetch = (id) => { id = String(id); if (slowNet() || raw.has(id)) return; getRaw(id).catch(() => {}); };
    const warm = (id) => { id = String(id); if (slowNet()) return; getBuf(id).then((b) => analyze(id, b)).catch(() => {}); };
    const status = (id) => (bufs.has(String(id)) ? 'ready' : raw.has(String(id)) ? 'fetched' : 'cold');
    return {
      toggle, auto, fadeStop, stopAll, setVolume, prime, prefetch, warm, status, tick, spectrum, volumeLocked: () => false, analyzeBuffer: (b, over) => analyze('probe' + Math.random(), b, over || {}),
      get current() { return current; }, get lastView() { return lastView; }, get fx() { return fx; },
    };
  })();

  window.Amen = {
    BASE_BPM, VOICES, BARS, EXPECTED, hits, T, start, stop, playhead, eventsSince, audition,
    enable, mute, unmute, setDuck, ping, scope, Preview, srcOf, setVolume,
    get vol() { return T.vol; }, prepare() { return buildKit(); }, setNudge(ms) { T.nudge = Math.max(0, ms) / 1000; }, visualNow,
    get ctx() { return ctx; }, get ready() { return !!kit; }, get kit() { return kit; },
    setBpm(b) { T.bpm = b; }, setLayers(l) { Object.assign(T.layers, l); },
  };
})();
