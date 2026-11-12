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



  /** Percussive layer of a mono 22.05 kHz clip as kick / snare / hat curves: whatever rises above the sustained part of each
   *  frequency bin is a drum, so bass lines, pads and vocals mostly drop out. Self-contained (it also runs in a Worker). */
  function percAnalyze(x) {
    const sr = 22050, N = 1024, hop = 256, B = N / 2 + 1, F = Math.floor((x.length - N) / hop), fr = sr / hop;
    if (F < 80) { const z = new Float32Array(Math.max(1, F)); return { kn: z, sn: z.slice(), hn: z.slice(), fr }; }
    const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const rev = new Uint16Array(N); for (let i = 1; i < N; i++) rev[i] = (rev[i >> 1] >> 1) | ((i & 1) ? N >> 1 : 0);
    const cs = new Float64Array(N / 2), sn = new Float64Array(N / 2); for (let i = 0; i < N / 2; i++) { cs[i] = Math.cos(-2 * Math.PI * i / N); sn[i] = Math.sin(-2 * Math.PI * i / N); }
    const re = new Float64Array(N), im = new Float64Array(N), S = new Float32Array(F * B);
    for (let f = 0; f < F; f++) {
      for (let i = 0; i < N; i++) { re[rev[i]] = x[f * hop + i] * win[i]; im[rev[i]] = 0; }
      for (let size = 2; size <= N; size <<= 1) {
        const half = size >> 1, step = N / size;
        for (let i = 0; i < N; i += size) for (let j = 0, k = 0; j < half; j++, k += step) { const a = i + j, b = a + half, tr = re[b] * cs[k] - im[b] * sn[k], ti = re[b] * sn[k] + im[b] * cs[k]; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; }
      }
      for (let k = 0; k < B; k++) S[f * B + k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
    const W = 13, h = W >> 1, tmp = new Float32Array(W), e = [new Float32Array(F), new Float32Array(F), new Float32Array(F)];
    for (let k = 2; k < 470; k++) {
      const band = k < 7 ? 0 : k < 21 ? 1 : k >= 80 && k < 200 ? 1 : k >= 280 && k < 460 ? 2 : -1; if (band < 0) continue;
      const wgt = k >= 80 && k < 200 ? 0.6 : 1;
      for (let f = 0; f < F; f++) {
        for (let d = -h, c = 0; d <= h; d++, c++) tmp[c] = S[Math.min(F - 1, Math.max(0, f + d)) * B + k];
        tmp.sort(); const p = S[f * B + k] - tmp[h]; if (p > 0) e[band][f] += p * wgt;
      }
    }
    const out = e.map((a) => { const o = new Float32Array(F); for (let f = 1; f < F; f++) o[f] = Math.max(0, a[f] - 0.5 * a[f - 1]); return o; });
    return { kn: out[0], sn: out[1], hn: out[2], fr };
  }

  /* ------------------------------------------------------------------ finding the break inside a clip
   * Self-contained on purpose: this function is also stringified into a Worker.
   * Input: band novelty curves (kick, snare, hat) at `fr` Hz plus the break's template. For every tempo and alignment it
   * folds the clip onto one bar (and onto the full four bars), builds a per-band hit profile averaged over the repeats,
   * and correlates it with the template. Extra hits in the wrong places (a busy bass line, a generic funk beat) lower the
   * correlation, so only a real Amen pattern scores high.
   */
  function matchBreak(m) {
    const fr = m.fr, W = [0.45, 0.4, 0.15], NAME = ['kick', 'snare', 'ghost', 'ride', 'crash'], BAND = [0, 1, 1, 2, 2];
    const bands = [m.kn, m.sn, m.hn].map((a) => {
      const n = a.length, srt = Float32Array.from(a).sort(), p = srt[Math.floor(n * 0.95)] || 1e-6, d = new Float32Array(n), o = new Float32Array(n);
      for (let i = 0; i < n; i++) d[i] = Math.min(1.5, a[i] / p);
      for (let i = 0; i < n; i++) { let mx = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) if (d[j] > mx) mx = d[j]; o[i] = mx; }
      return o;
    });
    const n = bands[0].length, dur = n / fr;
    const prep = (L, vs) => (vs || [m.K, m.S, m.H]).map((v) => {
      const t = new Float32Array(L); let mean = 0; for (let i = 0; i < L; i++) { t[i] = v[i]; mean += v[i]; } mean /= L;
      let nn = 0; for (let i = 0; i < L; i++) { t[i] -= mean; nn += t[i] * t[i]; } return { t, nn: Math.sqrt(nn) || 1 };
    });
    const tp1 = prep(16), tp4 = prep(64), P = new Float32Array(64);
    const score = (tp, L, bpm, phase) => {
      const sd = 60 / bpm / 4, loop = L * sd, reps = Math.floor((dur - phase) / loop); if (reps < 2) return -1;
      let total = 0;
      for (let b = 0; b < 3; b++) {
        const arr = bands[b]; P.fill(0, 0, L);
        for (let k = 0; k < reps; k++) for (let s = 0; s < L; s++) P[s] += arr[Math.round((phase + (k * L + s) * sd) * fr)];
        let mean = 0; for (let s = 0; s < L; s++) mean += P[s]; mean /= L;
        let num = 0, pp = 0; const t = tp[b].t; for (let s = 0; s < L; s++) { const x = P[s] - mean; num += x * t[s]; pp += x * x; }
        total += W[b] * Math.max(-0.2, num / ((Math.sqrt(pp) * tp[b].nn) || 1));
      }
      return total;
    };
    const scan = (tp, L, bpm, lo, hi, step) => { let bs = -9, bp = lo; for (let ph = lo; ph < hi; ph += step) { const sc = score(tp, L, bpm, ph); if (sc > bs) { bs = sc; bp = ph; } } return { score: bs, phase: bp }; };
    // stage A: one bar (the groove of bars 1-2), every tempo from 70 to 200 BPM
    const A = [];
    for (let bpm = 70; bpm <= 200; bpm += 1) { const r = scan(tp1, 16, bpm, 0, 16 * 60 / bpm / 4, 0.01); A.push({ bpm, phase: r.phase, score: r.score }); }
    A.sort((x, y) => y.score - x.score);
    const tops = []; for (const c of A) { if (tops.every((t) => Math.abs(t.bpm - c.bpm) > 2.5)) tops.push(c); if (tops.length >= 4) break; }
    // refine each of the best tempos, then try the full four bars
    let best1 = { score: -9 }, best4 = { score: -9 };
    for (const c of tops) {
      let r1 = { score: -9 };
      for (let bpm = c.bpm - 1; bpm <= c.bpm + 1.001; bpm += 0.25) { const sd = 60 / bpm / 4, r = scan(tp1, 16, bpm, Math.max(0, c.phase - 0.03), c.phase + 0.03, 0.005); if (r.score > r1.score) r1 = { bpm, phase: r.phase, score: r.score }; }
      if (r1.score > best1.score) best1 = r1;
      const sd = 60 / r1.bpm / 4;
      for (let bar = 0; bar < 4; bar++) {
        for (let bpm = r1.bpm - 0.5; bpm <= r1.bpm + 0.501; bpm += 0.25) {
          const ph = r1.phase + bar * 16 * 60 / bpm / 4, s = score(tp4, 64, bpm, ph); if (s > best4.score) best4 = { bpm, phase: ph, score: s };
        }
      }
    }
    // how surprising is each score? compare with random tempo/alignments
    const nul = (tp, L) => { const v = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 160; i++) { const bpm = 70 + rnd() * 130, s = score(tp, L, bpm, rnd() * L * 60 / bpm / 4); if (s > -1) v.push(s); } const mu = v.reduce((a, b) => a + b, 0) / v.length; return { mu, sd: Math.sqrt(v.reduce((a, b) => a + (b - mu) * (b - mu), 0) / v.length) || 1 }; };
    const n1 = nul(tp1, 16), n4 = nul(tp4, 64);
    // decoys: ordinary beats that share the backbeat with the Amen break but not its ghost snares, double kick or missing downbeat
    const mk = (d) => { const K = new Float32Array(64), S = new Float32Array(64), H = new Float32Array(64); for (let s = 0; s < 64; s++) { const x = s % 16; K[s] = d.k[x] || 0; S[s] = d.s[x] || 0; H[s] = d.h[x] || 0; } return [K, S, H]; };
    const even = (v) => { const o = {}; for (let i = 0; i < 16; i += 2) o[i] = v; return o; };
    const DECOYS = [
      { k: { 0: 0.9, 8: 0.9 }, s: { 4: 1, 12: 1 }, h: even(0.5) },
      { k: { 0: 0.9, 10: 0.9 }, s: { 4: 1, 12: 1 }, h: even(0.5) },
      { k: { 0: 0.9, 7: 0.6, 10: 0.9 }, s: { 4: 1, 12: 1 }, h: even(0.5) },
      { k: { 0: 0.9, 2: 0.7, 8: 0.9 }, s: { 4: 1, 12: 1 }, h: even(0.5) },
      { k: { 0: 0.9, 4: 0.9, 8: 0.9, 12: 0.9 }, s: { 4: 0.6, 12: 0.6 }, h: { 2: 0.5, 6: 0.5, 10: 0.5, 14: 0.5 } },
      { k: { 0: 0.9, 10: 0.7 }, s: { 8: 1 }, h: even(0.5) },
    ].map(mk);
    const decoy = (L, bpm0) => {
      let best = -9;
      for (const v of DECOYS) { const tp = prep(L, v); for (let bpm = bpm0 - 1; bpm <= bpm0 + 1.001; bpm += 0.5) { const r = scan(tp, L, bpm, 0, 16 * 60 / bpm / 4, 0.01); if (r.score > best) best = r.score; } }
      return best;
    };
    const d1 = decoy(16, best1.bpm), d4 = decoy(64, best4.bpm);
    const events = (bpm, phase, L) => {
      const sd = 60 / bpm / 4, out = [];
      for (let k = 0; phase + k * L * sd < dur; k++) for (const [step, v, vel] of m.ev) {
        if (L === 16 && step >= 16) continue;
        const t = phase + (k * L + step) * sd, idx = Math.round(t * fr); if (t < 0 || idx >= n) continue;
        if (bands[BAND[v]][idx] >= 0.3) out.push({ t, src: L === 16 ? step + (k % 2) * 16 : step, voice: NAME[v], vel });
      }
      return out.sort((a, b) => a.t - b.t);
    };
    return {
      s1: best1.score, s4: best4.score, d1, d4, m1: best1.score - d1, m4: best4.score - d4, z1: (best1.score - n1.mu) / n1.sd, z4: (best4.score - n4.mu) / n4.sd,
      groove: { bpm: best1.bpm, phase: best1.phase, L: 16, events: events(best1.bpm, best1.phase, 16) },
      full: { bpm: best4.bpm, phase: best4.phase, L: 64, events: events(best4.bpm, best4.phase, 64) },
    };
  }

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

    // the break as three band vectors plus an event list, for the matcher
    const TMPL = (() => {
      const K = new Float32Array(64), S = new Float32Array(64), H = new Float32Array(64), ev = [];
      for (let s = 0; s < 64; s++) {
        const h = HITS[s];
        if (h.kick) { K[s] = h.kick; ev.push([s, 0, h.kick]); }
        if (h.snare) { S[s] += h.snare; ev.push([s, 1, h.snare]); }
        if (h.ghost) { S[s] += h.ghost * 0.5; ev.push([s, 2, h.ghost]); }
        if (h.ride) { H[s] += h.ride; ev.push([s, 3, h.ride]); }
        if (h.crash) { H[s] += h.crash; ev.push([s, 4, h.crash]); }
      }
      return { K, S, H, ev };
    })();
    let worker = null, jobId = 0; const jobs = new Map();
    const tpl = () => ({ K: TMPL.K, S: TMPL.S, H: TMPL.H, ev: TMPL.ev });
    const local = (x) => Object.assign(percAnalyze(x), tpl());
    const runMatch = (x) => new Promise((res) => {
      try {
        if (!worker) {
          worker = new Worker(URL.createObjectURL(new Blob(['const percAnalyze=' + percAnalyze.toString() + ';const matchBreak=' + matchBreak.toString() + ';onmessage=(e)=>{const f=percAnalyze(e.data.x);postMessage({id:e.data.id,result:matchBreak(Object.assign(f,e.data.t))})}'], { type: 'text/javascript' })));
          worker.onmessage = (ev) => { const j = jobs.get(ev.data.id); jobs.delete(ev.data.id); if (j) j.res(ev.data.result); };
          worker.onerror = () => { const w = worker; worker = null; if (w) w.terminate(); jobs.forEach((j) => j.res(matchBreak(local(j.x)))); jobs.clear(); };   // workers blocked: do it here
        }
        const id = ++jobId; jobs.set(id, { res, x }); worker.postMessage({ id, x, t: tpl() });
      } catch (err) { res(matchBreak(local(x))); }
    });
    // does the clip show the break? "full": the four-bar pattern fits. "groove": just the funk bar of bars 1-2 fits.
    const LOCK = { full: 0.45, groove: 9, grooveMargin: 0.04 };   // groove-only locks are switched off: too easy to confuse with any funk bar   // same bar the curation used: below it, a clip doesn't show the break clearly enough to play or lock
    function decide(m) {
      if (m.s4 >= LOCK.full) return Object.assign({ type: 'full', score: m.s4 }, m.full);
      if (m.s1 >= LOCK.groove && m.m1 >= LOCK.grooveMargin) return Object.assign({ type: 'groove', score: m.s1 }, m.groove);
      return null;
    }
    const analyze = (id, buf) => (ana.has(id) ? Promise.resolve(ana.get(id)) : once('a' + id, async () => {
      const sr = 22050, oc = new OAC(1, Math.ceil(buf.duration * sr), sr), src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start(0);
      const x = (await oc.startRendering()).getChannelData(0).slice(), match = await runMatch(x);
      const res = { dur: buf.duration, match, lock: decide(match) }; ana.set(id, res); return res;
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
    function view() {
      if (!node) return null;
      const a = ana.get(node.id), pos = Math.max(0, ctx.currentTime - node.t0 - vlat()), lk = a && a.lock; let lockStep = null;
      if (lk) { const sd = 60 / lk.bpm / 4, x = (pos - lk.phase) / sd; if (x >= 0) { lockStep = ((x % lk.L) + lk.L) % lk.L; if (lk.L === 16) lockStep += (Math.floor(x / 16) % 2) * 16; } }
      return { id: node.id, pos, dur: node.dur, lock: lk || null, lockStep, analyzed: !!a };
    }
    let fxIdx = 0, fxList = null, fxId = null;
    function tick() {
      const v = view(); lastView = v; fx = [];
      if (!v || !v.lock) return v;
      const ev = v.lock.events;
      if (fxList !== ev || fxId !== v.id) { fxList = ev; fxId = v.id; fxIdx = 0; while (fxIdx < ev.length && ev[fxIdx].t < v.pos - 0.2) fxIdx++; }
      while (fxIdx < ev.length && ev[fxIdx].t <= v.pos) fx.push(ev[fxIdx++]);
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
      toggle, auto, fadeStop, stopAll, setVolume, prime, prefetch, warm, status, tick, spectrum, volumeLocked: () => false, analyzeBuffer: (b) => analyze('probe' + Math.random(), b),
      inspect: (id) => { id = String(id); return getBuf(id).then((b) => analyze(id, b)); },
      getBuffer: (id) => getBuf(String(id)), matchBreak, percAnalyze, tmpl: TMPL, LOCK,
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
