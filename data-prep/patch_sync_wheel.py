"""Wheel: 'sample mode'. While a preview plays, the record shows the clip itself: its spectrum around the rim, every kick /
snare / hat it makes laid down at the moment it is heard, and a playhead that is the clip's own progress."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
w = (root / 'wheel.js').read_text()

def sub(text, old, new):
    assert old in text, old[:90]
    return text.replace(old, new, 1)

w = sub(w, "  const BEATS = ['', 'e', '&', 'a'];", "  const BEATS = ['', 'e', '&', 'a'];\n  const fmt = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');")
w = sub(w, "this.kickPulse = 0; this.t0 = performance.now(); this.w = 0; this.h = 0; this.dpr = 1;", "this.kickPulse = 0; this.sm = 0; this.t0 = performance.now(); this.w = 0; this.h = 0; this.dpr = 1;")
w = sub(w, "    consume() {\n      const evs = Amen.eventsSince(this.lastId);",
        "    consume() {\n      if (this.o.sample !== false && !this.o.static && this.sm > 0.3) { for (const e of Amen.eventsSince(this.lastId)) this.lastId = e.id; return; }   // the drum loop sits quietly behind a sample\n      const evs = Amen.eventsSince(this.lastId);")
w = sub(w, "      this.consume();\n      this.kickPulse *= 0.9;",
        """      const useS = this.o.sample !== false && !this.o.static, sv = useS ? Amen.Preview.lastView : null;
      this.sm += ((sv ? 1 : 0) - this.sm) * (reduce ? 1 : 0.14); const sm = this.sm;
      this.consume();
      if (sv) for (const m of Amen.Preview.fx) { this.ripples.push({ a: ang((m.t / sv.dur) * 64), v: m.b === 0 ? 'kick' : m.b === 1 ? 'snare' : 'ride', t: nowMs, vel: m.v }); if (m.b === 0) this.kickPulse = 1; }
      this.kickPulse *= 0.9;""")
w = sub(w, "const R = this.cur.r, s = this.s, ph = this.o.static ? null : Amen.playhead();", "const R = this.cur.r, s = this.s, ph = this.o.static || sv ? null : Amen.playhead();")
w = sub(w, "* ba * infoc * (1 - dim * 0.8);", "* ba * infoc * (1 - dim * 0.8) * (1 - sm * 0.82);")
w = sub(w, "        g.beginPath(); g.arc(0, 0, R * (r + t * 0.1), ang(rp.s) - DA * t * 0.5, ang(rp.s) + DA * (1 + t * 0.5));",
        """        const ra = rp.a != null ? rp.a - DA * (0.6 + t * 0.5) : ang(rp.s) - DA * t * 0.5, rb = rp.a != null ? rp.a + DA * (0.6 + t * 0.5) : ang(rp.s) + DA * (1 + t * 0.5);
        g.beginPath(); g.arc(0, 0, R * (r + t * 0.1), ra, rb);""")
w = sub(w, "      // highlights\n", """      // the sample itself: its spectrum around the rim, and every hit it makes laid down where it happens
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
        if (sv.marks) {
          g.lineCap = 'butt';
          [[0, 'kick', 0.5, 0.11], [1, 'snare', 0.72, 0.085], [2, 'ride', 0.875, 0.04]].forEach(([b, v, r, wd]) => {
            g.beginPath(); g.strokeStyle = COLORS[v]; g.lineWidth = R * wd;
            for (const m of sv.marks) {
              if (m.t > sv.pos) break; if (m.b !== b) continue;
              const a0 = ang((m.t / sv.dur) * 64); g.moveTo(Math.cos(a0) * R * r, Math.sin(a0) * R * r); g.arc(0, 0, R * r, a0, a0 + DA * (0.5 + 0.5 * m.v));
            }
            g.globalAlpha = Math.min(1, sm) * 0.85; g.stroke(); g.globalAlpha = Math.min(1, sm);
          });
        }
        const pa = ang((sv.pos / sv.dur) * 64); g.lineCap = 'round';
        for (let i = 14; i >= 0; i--) { const aa = pa - i * 0.012; g.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - i / 15)) + ')'; g.lineWidth = i === 0 ? 2.4 : 1.4; g.beginPath(); g.moveTo(Math.cos(aa) * R * 0.3, Math.sin(aa) * R * 0.3); g.lineTo(Math.cos(aa) * R * 1.05, Math.sin(aa) * R * 1.05); g.stroke(); }
        g.restore();
      }
      // highlights
""")
w = sub(w, "      g.fillText(s.center[0], 0, R * 0.035);", "      const c0 = sv && sm > 0.5 ? fmt(sv.pos) : s.center[0], c1 = sv && sm > 0.5 ? 'THE CLIP' : s.center[1];\n      g.fillText(c0, 0, R * 0.035);")
w = sub(w, "      g.fillText(s.center[1], 0, R * 0.115);", "      g.fillText(c1, 0, R * 0.115);")
(root / 'wheel.js').write_text(w)
print('wheel patched')
