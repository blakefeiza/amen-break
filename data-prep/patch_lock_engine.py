"""Engine: separate the percussive layer, find the Amen pattern (tempo + alignment), and expose a 'lock' for the record."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
e = (root / 'engine.js').read_text()

def sub(text, old, new):
    assert old in text, old[:100]
    return text.replace(old, new, 1)

perc = r'''
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
'''
e = sub(e, "  /* ------------------------------------------------------------------ finding the break inside a clip", perc + "\n  /* ------------------------------------------------------------------ finding the break inside a clip")

# replace worker plumbing + old analysis with the new pipeline
i = e.index("    let worker = null, jobId = 0; const jobs = new Map();")
j = e.index("    // ---- playback graph")
new_analysis = r'''    let worker = null, jobId = 0; const jobs = new Map();
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
    const LOCK = { full: 0.47, groove: 0.7, grooveMargin: 0.04 };
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

'''
e = e[:i] + new_analysis + e[j:]

# view / tick
i = e.index("    function view() {")
j = e.index("    function spectrum() {")
new_view = r'''    function view() {
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
'''
e = e[:i] + new_view + e[j:]
e = sub(e, "analyzeBuffer: (b, over) => analyze('probe' + Math.random(), b, over || {}),", "analyzeBuffer: (b) => analyze('probe' + Math.random(), b),")
e = sub(e, "getBuffer: (id) => getBuf(String(id)), matchBreak, tmpl: TMPL,", "getBuffer: (id) => getBuf(String(id)), matchBreak, percAnalyze, tmpl: TMPL, LOCK,")
(root / 'engine.js').write_text(e)
print('engine ok')
