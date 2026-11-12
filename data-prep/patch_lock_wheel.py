"""Wheel: when a clip shows the Amen break, the record plays its own pattern in time with the clip (locked to the detected
tempo and alignment), lighting only the hits the audio really contains. No more painting every onset around the circle."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
w = (root / 'wheel.js').read_text()

def sub(text, old, new):
    assert old in text, old[:100]
    return text.replace(old, new, 1)

w = sub(w, "this.kickPulse = 0; this.sm = 0;", "this.kickPulse = 0; this.sm = 0; this.lk = 0;")
w = sub(w, "      if (sv) for (const m of Amen.Preview.fx) { this.ripples.push({ a: ang((m.t / sv.dur) * 64), v: m.b === 0 ? 'kick' : m.b === 1 ? 'snare' : 'ride', t: nowMs, vel: m.v }); if (m.b === 0) this.kickPulse = 1; }",
        "      this.lk += ((sv && sv.lock ? 1 : 0) - this.lk) * (reduce ? 1 : 0.14);\n      if (sv) for (const m of Amen.Preview.fx) { this.ripples.push({ s: m.src, v: m.voice, t: nowMs, vel: m.vel }); this.flash[m.src + ':' + m.voice] = nowMs; if (m.voice === 'kick') this.kickPulse = 1; }")
# the template stays at full strength while a clip is locked; bars 3-4 step back when only the funk bar matched
w = sub(w, "* ba * infoc * (1 - dim * 0.8) * (1 - sm * 0.82);", "* ba * infoc * (1 - dim * 0.8) * (1 - sm * 0.82 * (1 - this.lk)) * (grooveDim && st >= 32 ? 1 - 0.78 * this.lk : 1);")
w = sub(w, "      g.lineCap = 'butt';\n      for (let st = 0; st < 64; st++) {", "      g.lineCap = 'butt';\n      const grooveDim = !!(sv && sv.lock && sv.lock.type === 'groove');\n      for (let st = 0; st < 64; st++) {")
# replace the sample drawing block
i = w.index("      // the sample itself: its spectrum around the rim")
j = w.index("      // highlights\n")
block = r'''      // the sample: its spectrum around the rim, and (when the clip really shows the break) a playhead locked to its tempo
      if (sv && sm > 0.02) {
        g.save(); g.globalAlpha = Math.min(1, sm);
        const spec = Amen.Preview.spectrum();
        if (spec) {
          g.lineCap = 'round';
          [[0, 21, COLORS.kick], [21, 43, COLORS.snare], [43, 64, COLORS.ride]].forEach(([a, b, col]) => {
            g.beginPath(); g.strokeStyle = col; g.lineWidth = Math.max(2, R * 0.022);
            for (let i = a; i < b; i++) { const aa = ang(i + 0.5), m = Math.pow(spec[i], 1.15), r0 = R * 1.05, r1 = r0 + R * (0.015 + 0.17 * m); g.moveTo(Math.cos(aa) * r0, Math.sin(aa) * r0); g.lineTo(Math.cos(aa) * r1, Math.sin(aa) * r1); }
            g.stroke();
          });
        }
        if (sv.lock && sv.lockStep != null) {
          const pa = ang(sv.lockStep); g.lineCap = 'round';
          for (let i = 14; i >= 0; i--) { const aa = pa - i * 0.012; g.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - i / 15)) + ')'; g.lineWidth = i === 0 ? 2.4 : 1.4; g.beginPath(); g.moveTo(Math.cos(aa) * R * 0.3, Math.sin(aa) * R * 0.3); g.lineTo(Math.cos(aa) * R * 1.05, Math.sin(aa) * R * 1.05); g.stroke(); }
        }
        g.restore();
      }
'''
w = w[:i] + block + w[j:]
w = sub(w, "const c0 = sv && sm > 0.5 ? fmt(sv.pos) : s.center[0], c1 = sv && sm > 0.5 ? 'THE CLIP' : s.center[1];",
        "const c0 = sv && sm > 0.5 ? fmt(sv.pos) : s.center[0], c1 = sv && sm > 0.5 ? (sv.lock ? 'LOCKED \\u00b7 ' + Math.round(sv.lock.bpm) + ' BPM' : sv.analyzed ? 'THE CLIP' : 'LISTENING\\u2026') : s.center[1];")
(root / 'wheel.js').write_text(w)
print('wheel ok')
