"""Analysis v2: band novelty with cross-band suppression (a ride tick is not a snare; a snare's body is not a kick)."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
e = (root / 'engine.js').read_text()
i = e.index("    // ---- analysis: three band envelopes rendered off the main thread, then simple onset picking")
j = e.index("    // ---- playback graph")
new = r'''    // ---- analysis: three band envelopes rendered off the main thread, then onset picking with cross-band suppression
    const CFG = { low: 95, lowStages: 2, mid: 1800, midQ: 0.5, high: 8000, kSup: 0.8, sSup: 0.7, hSup: 0.4, gaps: [90, 130, 80], ks: [1.4, 1.5, 1.9], floor: 0.2, shift: 0.005 };
    function novelty(env) {
      const n = env.length, srt = Float32Array.from(env).sort(), p95 = srt[Math.floor(n * 0.95)] || 1e-6, nv = new Float32Array(n);
      for (let i = 2; i < n; i++) nv[i] = Math.max(0, Math.log(1 + 30 * env[i] / p95) - Math.log(1 + 30 * env[i - 2] / p95));
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
      const rendered = await oc.startRendering(), nvs = [0, 1, 2].map((ch) => {
        const d = rendered.getChannelData(ch), n = Math.floor(d.length / hop), env = new Float32Array(n);
        for (let k = 0; k < n; k++) { let m = 0; for (let q = k * hop; q < k * hop + hop; q++) if (d[q] > m) m = d[q]; env[k] = m; }
        return novelty(env);
      });
      const n = Math.min(nvs[0].length, nvs[1].length, nvs[2].length), kn = new Float32Array(n), sn = new Float32Array(n), hn = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        kn[k] = Math.max(0, nvs[0][k] - C.kSup * nvs[1][k]);                 // a snare's body is not a kick
        sn[k] = Math.max(0, nvs[1][k] - C.sSup * nvs[2][k]);                 // a ride tick is not a snare
        hn[k] = Math.max(0, nvs[2][k] - C.hSup * nvs[1][k]);                 // and a snare crack is not a hi-hat
      }
      const marks = [].concat(pick(kn, fr, C.gaps[0], C.ks[0], C.floor, C.shift).map((m) => (m.b = 0, m)), pick(sn, fr, C.gaps[1], C.ks[1], C.floor, C.shift).map((m) => (m.b = 1, m)), pick(hn, fr, C.gaps[2], C.ks[2], C.floor, C.shift).map((m) => (m.b = 2, m))).sort((a, b) => a.t - b.t);
      const res = { marks, dur: buf.duration }; if (!over) ana.set(id, res); return res;
    }));

'''
e = e[:i] + new + e[j:]
e = e.replace("analyzeBuffer: (b) => analyze('probe' + Math.random(), b),", "analyzeBuffer: (b, over) => analyze('probe' + Math.random(), b, over || {}),")
(root / 'engine.js').write_text(e)
print('ok')
