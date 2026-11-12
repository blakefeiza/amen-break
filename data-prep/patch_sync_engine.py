"""Engine: previews decoded and played on the Web Audio clock, analyzed ahead of time for kick/snare/hat hits,
with batch URL lookup, byte prefetch, decode warm-up, and a visual-latency nudge. The drum kit is pre-built at idle."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
e = (root / 'engine.js').read_text()

def sub(text, old, new):
    assert old in text, old[:90]
    return text.replace(old, new, 1)

# the kit needs no AudioContext (and so no user gesture) to be rendered: build it at idle, not on the first tap
e = sub(e, "    const sr = ctx.sampleRate;\n", "    const sr = ctx ? ctx.sampleRate : 44100;\n")
e = sub(e, "audible: false, domain: 'perf', events: [], evId: 0, duck: false, vol: 0.5,", "audible: false, domain: 'perf', events: [], evId: 0, duck: false, vol: 0.5, nudge: 0,")
e = sub(e, "    return now() - lat;\n  }", "    return now() - lat - T.nudge;   // T.nudge: the listener's own delay for the picture (Bluetooth speakers)\n  }")

i = e.index("  /* ------------------------------------------------------------------ 30-second previews")
j = e.index("  window.Amen = {")
new_preview = r'''  /* ------------------------------------------------------------------ 30-second previews (Apple iTunes Search API)
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

    // ---- analysis: three band envelopes rendered off the main thread, then simple onset picking
    function detect(env, hop, gapMs, k) {
      const n = env.length, srt = Float32Array.from(env).sort(), p95 = srt[Math.floor(n * 0.95)] || 1e-6, fr = 32000 / hop, nv = new Float32Array(n), out = [], win = 100;
      for (let i = 2; i < n; i++) { const a = Math.log(1 + 30 * env[i] / p95), b = Math.log(1 + 30 * env[i - 2] / p95); nv[i] = Math.max(0, a - b); }
      let last = -1e9;
      for (let i = 3; i < n - 3; i++) {
        if (nv[i] < nv[i - 1] || nv[i] <= nv[i + 1]) continue;
        let s = 0, c = 0; for (let j = Math.max(0, i - win); j < Math.min(n, i + win); j += 2) { s += nv[j]; c++; }
        if (nv[i] > (s / c) * k + 0.18 && ((i - last) * 1000) / fr >= gapMs) { out.push({ t: Math.max(0, i / fr - 0.008), v: Math.min(1, 0.3 + nv[i] / 1.2) }); last = i; }
      }
      return out;
    }
    const analyze = (id, buf) => (ana.has(id) ? Promise.resolve(ana.get(id)) : once('a' + id, async () => {
      const sr = 32000, hop = 160, oc = new OAC(3, Math.ceil(buf.duration * sr), sr), src = oc.createBufferSource(); src.buffer = buf;
      const merger = oc.createChannelMerger(3), absCurve = new Float32Array([1, 0, 1]);
      [['lowpass', 140, 0.7], ['bandpass', 2600, 0.6], ['highpass', 7500, 0.7]].forEach(([type, f, q], ch) => {
        const filt = oc.createBiquadFilter(); filt.type = type; filt.frequency.value = f; filt.Q.value = q;
        const ws = oc.createWaveShaper(); ws.curve = absCurve; const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 35;
        src.connect(filt); filt.connect(ws); ws.connect(lp); lp.connect(merger, 0, ch);
      });
      merger.connect(oc.destination); src.start(0);
      const rendered = await oc.startRendering(), envs = [0, 1, 2].map((ch) => {
        const d = rendered.getChannelData(ch), n = Math.floor(d.length / hop), e = new Float32Array(n);
        for (let i = 0; i < n; i++) { let m = 0; for (let j = i * hop; j < i * hop + hop; j++) if (d[j] > m) m = d[j]; e[i] = m; } return e;
      });
      const marks = [].concat(detect(envs[0], hop, 110, 1.3).map((m) => (m.b = 0, m)), detect(envs[1], hop, 95, 1.3).map((m) => (m.b = 1, m)), detect(envs[2], hop, 55, 1.5).map((m) => (m.b = 2, m))).sort((a, b) => a.t - b.t);
      const res = { marks, dur: buf.duration }; ana.set(id, res); return res;
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
      toggle, auto, fadeStop, stopAll, setVolume, prime, prefetch, warm, status, tick, spectrum, volumeLocked: () => false,
      get current() { return current; }, get lastView() { return lastView; }, get fx() { return fx; },
    };
  })();

'''
e = e[:i] + new_preview + e[j:]
e = sub(e, "    get vol() { return T.vol; },", "    get vol() { return T.vol; }, prepare() { return buildKit(); }, setNudge(ms) { T.nudge = Math.max(0, ms) / 1000; }, visualNow,")
(root / 'engine.js').write_text(e)
print('engine patched')
