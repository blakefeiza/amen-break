"""Matcher: find the Amen break itself in a clip (tempo, alignment, how well the drums fit the four-bar pattern).
Runs in a Worker; the analysis returns a 'match' with scores and, for the best fits, the template hits the audio really contains."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
e = (root / 'engine.js').read_text()

def sub(text, old, new):
    assert old in text, old[:100]
    return text.replace(old, new, 1)

matcher = r'''
  /* ------------------------------------------------------------------ finding the break inside a clip
   * Self-contained on purpose: this function is also stringified into a Worker.
   * Input: band novelty curves (kick, snare, hat) at `fr` Hz plus the break's template. For every tempo and alignment it
   * folds the clip onto one bar (and onto the full four bars), builds a per-band hit profile averaged over the repeats,
   * and correlates it with the template. Extra hits in the wrong places (a busy bass line, a generic funk beat) lower the
   * correlation, so only a real Amen pattern scores high.
   */
  function matchBreak(m) {
    const fr = m.fr, W = [0.35, 0.4, 0.25], NAME = ['kick', 'snare', 'ghost', 'ride', 'crash'], BAND = [0, 1, 1, 2, 2];
    const bands = [m.kn, m.sn, m.hn].map((a) => {
      const n = a.length, srt = Float32Array.from(a).sort(), p = srt[Math.floor(n * 0.95)] || 1e-6, d = new Float32Array(n), o = new Float32Array(n);
      for (let i = 0; i < n; i++) d[i] = Math.min(1.5, a[i] / p);
      for (let i = 0; i < n; i++) { let mx = 0; for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++) if (d[j] > mx) mx = d[j]; o[i] = mx; }
      return o;
    });
    const n = bands[0].length, dur = n / fr;
    const prep = (L) => [m.K, m.S, m.H].map((v) => {
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
      s1: best1.score, s4: best4.score, z1: (best1.score - n1.mu) / n1.sd, z4: (best4.score - n4.mu) / n4.sd,
      groove: { bpm: best1.bpm, phase: best1.phase, L: 16, events: events(best1.bpm, best1.phase, 16) },
      full: { bpm: best4.bpm, phase: best4.phase, L: 64, events: events(best4.bpm, best4.phase, 64) },
    };
  }
'''
e = sub(e, "  /* ------------------------------------------------------------------ 30-second previews (Apple iTunes Search API)", matcher + "\n  /* ------------------------------------------------------------------ 30-second previews (Apple iTunes Search API)")

# template + worker plumbing, placed right before the analysis section inside Preview
plumbing = r'''    // the break as three band vectors plus an event list, for the matcher
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
    const runMatch = (msg) => new Promise((res) => {
      try {
        if (!worker) {
          worker = new Worker(URL.createObjectURL(new Blob(['const matchBreak=' + matchBreak.toString() + ';onmessage=(e)=>postMessage({id:e.data.id,result:matchBreak(e.data)})'], { type: 'text/javascript' })));
          worker.onmessage = (e) => { const f = jobs.get(e.data.id); jobs.delete(e.data.id); if (f) f(e.data.result); };
        }
        const id = ++jobId; msg.id = id; jobs.set(id, res); worker.postMessage(msg);
      } catch (err) { res(matchBreak(msg)); }       // no Worker available: do it here
    });
'''
e = sub(e, "    // ---- analysis: three band envelopes rendered off the main thread, then onset picking with cross-band suppression\n", plumbing + "    // ---- analysis: three band envelopes rendered off the main thread, then onset picking with cross-band suppression\n")
e = sub(e, "      const res = { marks, dur: buf.duration }; if (!over) ana.set(id, res); return res;",
        "      const match = await runMatch({ kn, sn, hn, fr, K: TMPL.K, S: TMPL.S, H: TMPL.H, ev: TMPL.ev });\n      const res = { marks, dur: buf.duration, match }; if (!over) ana.set(id, res); return res;")
e = sub(e, "analyzeBuffer: (b, over) => analyze('probe' + Math.random(), b, over || {}),", "analyzeBuffer: (b, over) => analyze('probe' + Math.random(), b, over || {}),\n      inspect: (id) => { id = String(id); return getBuf(id).then((b) => analyze(id, b)); },")
(root / 'engine.js').write_text(e)
print('matcher patched')
