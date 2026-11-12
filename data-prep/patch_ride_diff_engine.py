"""Engine: a warmer, more cymbal-like ride; and an 'expected vs actual' comparison for a locked clip (missing / added hits)."""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
def sub(t, o, n):
    assert o in t, o[:80]; return t.replace(o, n, 1)
e = (root / 'engine.js').read_text()

# ---------------------------------------------------------------- ride: stick tick + inharmonic ping partials + soft wash
i = e.index("      ride: render(0.5, (oc) => {")
j = e.index("      crash: render(1.5")
ride = r'''      ride: render(0.8, (oc) => {
        // stick: a very short bright tick
        const tk = oc.createBufferSource(); tk.buffer = noiseBuf(oc, 0.03); const th = oc.createBiquadFilter(); th.type = 'highpass'; th.frequency.value = 5200;
        const tg = env(oc, 0.5, 0.0008, 0, 0.012); tk.connect(th); th.connect(tg); tg.connect(oc.destination); tk.start(0);
        // bell/ping: inharmonic partials with their own decay times, like a struck ride
        [[2780, 1, 0.55], [3640, 0.8, 0.42], [4950, 0.65, 0.34], [6430, 0.5, 0.26], [8170, 0.32, 0.18]].forEach(([f, a, d]) => {
          const o = oc.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = env(oc, 0.16 * a, 0.0012, 0, d); o.connect(g); g.connect(oc.destination); o.start(0); o.stop(d + 0.02);
        });
        // wash: soft band of noise that blooms a little after the hit
        const w = oc.createBufferSource(); w.buffer = noiseBuf(oc, 0.8); const wb = oc.createBiquadFilter(); wb.type = 'bandpass'; wb.frequency.value = 5600; wb.Q.value = 0.7;
        const wg = oc.createGain(); wg.gain.setValueAtTime(0.0001, 0); wg.gain.linearRampToValueAtTime(0.2, 0.012); wg.gain.exponentialRampToValueAtTime(0.0008, 0.7);
        w.connect(wb); wb.connect(wg); wg.connect(oc.destination); w.start(0);
      }),
'''
e = e[:i] + ride + e[j:]

# ---------------------------------------------------------------- compare a locked clip with the written pattern
e = sub(e, "    return {\n      s1: best1.score,",
r'''    // expected vs actual: fold the clip onto the pattern; template hits that the audio lacks are "missing", strong onsets the
    // template does not have (kick or snare) are "added". Only the four-bar lock is compared.
    const compare = (bpm, phase, L) => {
      const sd = 60 / bpm / 4, reps = Math.floor((dur - phase) / (L * sd)); const diff = [];
      if (L !== 64 || reps < 2) return diff;
      const prof = (b, s) => { let sum = 0, c = 0; for (let k = 0; k < reps; k++) { const idx = Math.round((phase + (k * L + s) * sd) * fr); if (idx >= 0 && idx < n) { sum += bands[b][idx]; c++; } } return c ? sum / c : 0; };
      for (let s = 0; s < 64; s++) {
        const k = prof(0, s), sn = prof(1, s);
        if (m.K[s] >= 0.6 && k < 0.2) diff.push({ src: s, voice: 'kick', kind: 'missing' });
        else if (!m.K[s] && k >= 0.85) diff.push({ src: s, voice: 'kick', kind: 'added' });
        if (m.S[s] >= 0.9 && sn < 0.25) diff.push({ src: s, voice: 'snare', kind: 'missing' });
        else if (!m.S[s] && sn >= 0.95) diff.push({ src: s, voice: 'snare', kind: 'added' });
      }
      return diff;
    };
    const attachDiff = (lk) => {
      lk.diff = compare(lk.bpm, lk.phase, lk.L);
      const sd = 60 / lk.bpm / 4;
      for (const d of lk.diff) {
        if (d.kind !== 'added') continue;
        for (let k = 0; lk.phase + k * lk.L * sd < dur; k++) { const t = lk.phase + (k * lk.L + d.src) * sd, idx = Math.round(t * fr); if (t >= 0 && idx < n && bands[d.voice === 'kick' ? 0 : 1][idx] >= 0.6) lk.events.push({ t, src: d.src, voice: d.voice, vel: 0.8, extra: true }); }
      }
      lk.events.sort((a, b) => a.t - b.t); return lk;
    };
    return {
      s1: best1.score,''')
e = sub(e, "      groove: { bpm: best1.bpm, phase: best1.phase, L: 16, events: events(best1.bpm, best1.phase, 16) },\n      full: { bpm: best4.bpm, phase: best4.phase, L: 64, events: events(best4.bpm, best4.phase, 64) },",
           "      groove: { bpm: best1.bpm, phase: best1.phase, L: 16, events: events(best1.bpm, best1.phase, 16), diff: [] },\n      full: attachDiff({ bpm: best4.bpm, phase: best4.phase, L: 64, events: events(best4.bpm, best4.phase, 64) }),")
(root / 'engine.js').write_text(e)
print('ok')
