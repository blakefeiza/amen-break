"""Show the notes a locked clip really plays: tolerate timing drift (no more 'gaps'), and pick kick/snare peaks that are not in the
written pattern, including in-between (32nd) positions, instead of only checking grid slots on every repeat."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
def sub(t, o, n):
    assert o in t, o[:80]; return t.replace(o, n, 1)
e = (root / 'engine.js').read_text()

# keep the un-smoothed curves for peak picking
e = sub(e, "    const bands = [m.kn, m.sn, m.hn].map((a) => {", "    const raws = [];\n    const bands = [m.kn, m.sn, m.hn].map((a) => {")
e = sub(e, "      return o;\n    });\n    const n = bands[0].length, dur = n / fr;", "      raws.push(d); return o;\n    });\n    const n = bands[0].length, dur = n / fr;")

# events(): a template hit counts if the clip has energy within +-0.3 of a step (timing drifts, swing, human feel)
e = sub(e, "const t = phase + (k * L + step) * sd, idx = Math.round(t * fr); if (t < 0 || idx >= n) continue;\n        if (bands[BAND[v]][idx] >= 0.3) out.push(",
           "const t = phase + (k * L + step) * sd, idx = Math.round(t * fr); if (t < 0 || idx >= n) continue;\n        if (near(BAND[v], idx, Math.max(1, Math.round(0.3 * sd * fr))) >= 0.3) out.push(")
e = sub(e, "    const events = (bpm, phase, L) => {", "    const near = (b, idx, w) => { let mx = 0; for (let j = Math.max(0, idx - w); j <= Math.min(n - 1, idx + w); j++) if (bands[b][j] > mx) mx = bands[b][j]; return mx; };\n    const events = (bpm, phase, L) => {")

# replace compare/attachDiff
i = e.index("    // expected vs actual: fold the clip")
j = e.index("    return {\n      s1: best1.score,")
new = r'''    // expected vs actual for a four-bar lock. "missing": the pattern has a kick/backbeat that the clip never plays (searched +-0.45 step on
    // every repeat). "added": a kick or snare peak that is not at a written hit, at the nearest half step; seen on most repeats = solid,
    // once = faint. Everything the clip plays is also queued as a live event so the wheel lights it when it is heard.
    const attachDiff = (lk) => {
      lk.diff = [];
      const bpm = lk.bpm, phase = lk.phase, L = lk.L, sd = 60 / bpm / 4, reps = Math.floor((dur - phase) / (L * sd)); if (L !== 64 || reps < 1) return lk;
      const w = Math.max(1, Math.round(0.45 * sd * fr));
      const have = (b, s, k) => near(b, Math.round((phase + (k * L + s) * sd) * fr), w);
      for (let s = 0; s < 64; s++) {
        for (const [b, voice, tpl, th] of [[0, 'kick', m.K, 0.6], [1, 'snare', m.S, 0.9]]) {
          if (tpl[s] < th) continue;
          let any = 0, seen = 0; for (let k = 0; k < reps; k++) { if (phase + (k * L + s) * sd >= dur - 0.05) continue; seen++; if (have(b, s, k) >= 0.35) any++; }
          if (seen >= 2 && any === 0) lk.diff.push({ src: s, voice, kind: 'missing' });
        }
      }
      const found = new Map();
      [[0, 'kick', m.K, 0.6], [1, 'snare', m.S, 0.65]].forEach(([b, voice, tpl, th]) => {
        const d = raws[b];
        for (let i = 3; i < n - 3; i++) {
          const v = d[i]; if (v < th) continue;
          let top = true; for (let j = i - 5; j <= i + 5; j++) if (j >= 0 && j < n && d[j] > v) { top = false; break; }
          if (!top || (d[i - 1] === v)) continue;                      // one peak per plateau
          const t = i / fr, x = (t - phase) / sd; if (x < -0.5) continue;
          const pos = Math.round(((x % 64) + 64) % 64 * 2) / 2 % 64, rep = Math.floor(x / 64);
          let nearTpl = false; for (let q = -1; q <= 1; q++) { const s = (((Math.round(pos) + q) % 64) + 64) % 64; if (tpl[s] >= 0.3 && Math.abs(s - pos) <= 0.75 || (Math.abs(((s - pos + 96) % 64) - 32) <= 0.75 && tpl[s] >= 0.3)) nearTpl = true; }
          if (nearTpl) continue;
          const key = pos + ':' + voice, f = found.get(key) || { src: pos, voice, kind: 'added', hits: [], str: 0 };
          f.hits.push({ t, rep }); f.str = Math.max(f.str, v); found.set(key, f);
        }
      });
      const adds = [...found.values()].map((f) => Object.assign(f, { count: new Set(f.hits.map((h) => h.rep)).size })).sort((a, b) => b.count - a.count || b.str - a.str).slice(0, 16);
      for (const f of adds) {
        lk.diff.push({ src: f.src, voice: f.voice, kind: 'added', count: f.count, reps });
        for (const h of f.hits) lk.events.push({ t: h.t, src: f.src, voice: f.voice, vel: 0.8, extra: true });
      }
      lk.events.sort((a, b) => a.t - b.t); return lk;
    };
'''
e = e[:i] + new + e[j:]
(root / 'engine.js').write_text(e)

w = (root / 'wheel.js').read_text()
old_start = w.index("        for (const d of added) {")
old_end = w.index("        g.restore();", old_start)
w = w[:old_start] + r'''        for (const d of added) {
          const [r, wd] = lanes[d.voice], f = this.flash[d.src + ':' + d.voice], e = f ? Math.max(0, 1 - (nowMs - f) / 420) : 0;
          const fl = Math.floor(d.src), fr = d.src - fl, a0 = fr ? 0.12 : 0.1, a1 = fr ? 0.46 : 0.9, solid = d.count >= 2 || d.reps < 2;
          g.save(); g.globalAlpha = this.lk * (solid ? 1 : 0.55);
          arc(r, wd * (1.5 + e * 0.5), fl, '#ffffff', 0.3 + e * 0.3, fr + a0, fr + a1);
          arc(r, wd * (0.55 + 0.4 + e * 0.25), fl, COLORS[d.voice], 0.95, fr + a0, fr + a1);
          g.restore();
        }
''' + w[old_end:]
(root / 'wheel.js').write_text(w)
import re
h = (root / 'index.html').read_text(); (root / 'index.html').write_text(re.sub(r'\?v=\d+"', '?v=53"', h))
print('ok')
