"""Matcher v2: beat the decoys. A clip only counts as the Amen break if its drums fit the Amen pattern clearly better
than they fit plain funk, boom-bap, four-on-the-floor and half-time beats at the same tempo."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
e = (root / 'engine.js').read_text()

def sub(text, old, new):
    assert old in text, old[:100]
    return text.replace(old, new, 1)

e = sub(e, "W = [0.35, 0.4, 0.25], NAME", "W = [0.45, 0.4, 0.15], NAME")
e = sub(e, "    const prep = (L) => [m.K, m.S, m.H].map((v) => {", "    const prep = (L, vs) => (vs || [m.K, m.S, m.H]).map((v) => {")
e = sub(e, "    const events = (bpm, phase, L) => {", r'''    // decoys: ordinary beats that share the backbeat with the Amen break but not its ghost snares, double kick or missing downbeat
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
    const events = (bpm, phase, L) => {''')
e = sub(e, "      s1: best1.score, s4: best4.score, z1: (best1.score - n1.mu) / n1.sd, z4: (best4.score - n4.mu) / n4.sd,",
        "      s1: best1.score, s4: best4.score, d1, d4, m1: best1.score - d1, m4: best4.score - d4, z1: (best1.score - n1.mu) / n1.sd, z4: (best4.score - n4.mu) / n4.sd,")
(root / 'engine.js').write_text(e)
import re
h = (root / 'index.html').read_text(); (root / 'index.html').write_text(re.sub(r'\?v=\d+"', '?v=37"', h))
print('ok')
