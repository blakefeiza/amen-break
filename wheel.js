/* AMEN — the Wheel. Four bars (64 sixteenth-note steps) laid around a record.
 * Lanes, outside in: crash, ride, snare (+ ghost notes), kick. Same colors everywhere in the app.
 */
(function () {
  'use strict';
  const COLORS = { kick: '#ff3d7f', snare: '#c8ff00', ghost: '#c8ff00', ride: '#2de2ff', crash: '#ffb020' };
  const TAU = Math.PI * 2, DA = TAU / 64;
  const ang = (s) => -Math.PI / 2 + (s / 64) * TAU;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const BEATS = ['', 'e', '&', 'a'];
  const fmt = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');

  class Wheel {
    constructor(canvas, opts) {
      this.cv = canvas; this.g = canvas.getContext('2d');
      this.o = Object.assign({ interactive: true, numerals: true, onPick: null }, opts);
      this.s = {
        layers: { kick: 1, snare: 1, ghost: 1, ride: 1, crash: 1 }, expected: false,
        barAlpha: [1, 1, 1, 1], hl: [], ghosts: [], center: ['136', 'BPM'], focus: null, mute: 0,
      };
      this.layoutFn = (w, h) => ({ cx: w / 2, cy: h / 2, r: Math.min(w, h) * 0.42 });
      this.cur = null; this.tgt = null;
      this.ripples = []; this.lastId = 0; this.flash = {}; this.visible = true; this.hover = -1; this.pick = -1; this.pickT = 0;
      this.kickPulse = 0; this.sm = 0; this.lk = 0; this.t0 = performance.now(); this.w = 0; this.h = 0; this.dpr = 1;
      this.resize();
      if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(canvas.parentElement || canvas);
      if ('IntersectionObserver' in window) new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; }, { rootMargin: '100px' }).observe(canvas);
      if (this.o.interactive) { this.bindPointer(); this.bindKeys(); }
    }
    setLayout(fn) { this.layoutFn = fn; this.tgt = fn(this.w, this.h); if (!this.cur) this.cur = Object.assign({}, this.tgt); }
    set(p) { Object.assign(this.s, p); }
    resize() {
      const p = this.cv.parentElement || this.cv, r = p.getBoundingClientRect();
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.cv.width = Math.round(this.w * this.dpr); this.cv.height = Math.round(this.h * this.dpr);
      this.cv.style.width = this.w + 'px'; this.cv.style.height = this.h + 'px';
      this.tgt = this.layoutFn(this.w, this.h); if (!this.cur) this.cur = Object.assign({}, this.tgt);
    }
    /* ---------- pointer: tap or drag across the record to hear that slice */
    stepAt(ev) {
      const r = this.cv.getBoundingClientRect(), x = ev.clientX - r.left - this.cur.cx, y = ev.clientY - r.top - this.cur.cy;
      const d = Math.hypot(x, y), R = this.cur.r;
      if (d < R * 0.3 || d > R * 1.06) return -1;
      let a = Math.atan2(y, x) + Math.PI / 2; a = ((a % TAU) + TAU) % TAU;
      return Math.floor((a / TAU) * 64) % 64;
    }
    bindPointer() {
      const cv = this.cv; cv.style.touchAction = 'pan-y';
      let down = false;
      cv.addEventListener('pointermove', (e) => {
        const s = this.stepAt(e); this.hover = s; cv.style.cursor = s >= 0 ? 'pointer' : 'default';
        if (down && s >= 0 && s !== this.pick) this.doPick(s);
      });
      cv.addEventListener('pointerleave', () => { this.hover = -1; down = false; });
      cv.addEventListener('pointerdown', (e) => { const s = this.stepAt(e); if (s >= 0) { down = true; this.doPick(s); } });
      window.addEventListener('pointerup', () => { down = false; });
    }
    /* ---------- keyboard: arrows walk the record, Enter/Space replays the slice */
    bindKeys() {
      const cv = this.cv; this.kb = 0; this.focused = false;
      cv.tabIndex = 0; cv.setAttribute('role', 'group'); cv.setAttribute('aria-describedby', 'wheelHelp');
      cv.addEventListener('focus', () => { this.focused = true; });
      cv.addEventListener('blur', () => { this.focused = false; });
      cv.addEventListener('keydown', (e) => {
        const k = e.key; let d = 0;
        if (k === 'ArrowRight' || k === 'ArrowDown') d = 1; else if (k === 'ArrowLeft' || k === 'ArrowUp') d = -1;
        else if (k === 'PageDown') d = 16; else if (k === 'PageUp') d = -16;
        else if (k === 'Home') d = -(this.kb % 16); else if (k === 'End') d = 15 - (this.kb % 16);
        else if (k !== 'Enter' && k !== ' ') return;
        e.preventDefault(); this.kb = (((this.kb + d) % 64) + 64) % 64; this.doPick(this.kb);
      });
    }
    doPick(s) { this.pick = s; this.pickT = performance.now(); if (this.o.onPick) this.o.onPick(s, this); }
    describe(s) {
      const bar = (s >> 4) + 1, st = s & 15, beat = (st >> 2) + 1, sub = BEATS[st & 3];
      const h = Amen.hits(s, this.s.expected), names = [];
      if (h.kick) names.push('kick'); if (h.snare) names.push('snare'); if (h.ghost) names.push('ghost snare');
      if (h.ride) names.push('ride'); if (h.crash) names.push('open cymbal');
      return { bar, beat: beat + sub, names, text: 'Bar ' + bar + ' · beat ' + beat + (sub ? ' ' + sub : '') + (names.length ? ' — ' + names.join(', ') : ' — silence') };
    }
    /* ---------- drawing */
    consume() {
      if (this.o.sample !== false && !this.o.static && this.sm > 0.3) { for (const e of Amen.eventsSince(this.lastId)) this.lastId = e.id; return; }   // the drum loop sits quietly behind a sample
      const evs = Amen.eventsSince(this.lastId);
      const nowMs = performance.now();
      for (const e of evs) {
        this.lastId = e.id;
        const h = Amen.hits(e.src, e.expected);
        for (const v of Amen.VOICES) {
          if (!h[v] || !(e.layers ? e.layers[v] : this.s.layers[v])) continue;
          this.ripples.push({ s: e.src, v, t: nowMs, vel: h[v] });
          this.flash[e.src + ':' + v] = nowMs;
          if (v === 'kick') this.kickPulse = 1;
        }
      }
      if (this.ripples.length > 90) this.ripples.splice(0, this.ripples.length - 90);
    }
    draw(nowMs) {
      if (!this.visible || !this.cur) return;
      const g = this.g, k = reduce ? 1 : 0.1;
      for (const key of ['cx', 'cy', 'r']) this.cur[key] += (this.tgt[key] - this.cur[key]) * k;
      const useS = this.o.sample !== false && !this.o.static, sv = useS ? Amen.Preview.lastView : null;
      this.sm += ((sv ? 1 : 0) - this.sm) * (reduce ? 1 : 0.14); const sm = this.sm;
      this.consume();
      this.lk += ((sv && sv.lock ? 1 : 0) - this.lk) * (reduce ? 1 : 0.14);
      if (sv) for (const m of Amen.Preview.fx) { this.ripples.push({ s: m.src, v: m.voice, t: nowMs, vel: m.vel }); this.flash[m.src + ':' + m.voice] = nowMs; if (m.voice === 'kick') this.kickPulse = 1; }
      this.kickPulse *= 0.9;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, this.w, this.h);
      const R = this.cur.r, s = this.s, ph = this.o.static || sv ? null : Amen.playhead();
      g.save(); g.translate(this.cur.cx, this.cur.cy);

      // disc + grooves
      const gr = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 1.08);
      gr.addColorStop(0, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R * 1.08, 0, TAU); g.fill();
      g.lineWidth = 1; g.strokeStyle = 'rgba(255,255,255,0.045)';
      for (let rr = 0.34; rr < 1.02; rr += 0.034) { g.beginPath(); g.arc(0, 0, R * rr, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.arc(0, 0, R * 1.0, 0, TAU); g.stroke();

      // bar dividers + numerals
      g.font = '800 ' + Math.max(11, R * 0.085) + 'px "Big Shoulders Display", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let b = 0; b < 4; b++) {
        const a0 = ang(b * 16);
        g.strokeStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.moveTo(Math.cos(a0) * R * 0.3, Math.sin(a0) * R * 0.3); g.lineTo(Math.cos(a0) * R * 1.02, Math.sin(a0) * R * 1.02); g.stroke();
        if (this.o.numerals) {
          const am = ang(b * 16 + 8);
          g.fillStyle = 'rgba(255,255,255,' + (0.22 + 0.5 * s.barAlpha[b]) + ')';
          g.fillText(String(b + 1), Math.cos(am) * R * 0.37, Math.sin(am) * R * 0.37);
        }
      }
      // quarter-beat ticks on the rim
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 64; i++) {
        const a = ang(i), len = i % 4 === 0 ? 0.035 : 0.015;
        g.beginPath(); g.moveTo(Math.cos(a) * R * 1.0, Math.sin(a) * R * 1.0); g.lineTo(Math.cos(a) * R * (1 + len), Math.sin(a) * R * (1 + len)); g.stroke();
      }

      // focus / hover / pick wedges
      const wedge = (a0, a1, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(0, 0, R * 1.0, a0, a1); g.arc(0, 0, R * 0.3, a1, a0, true); g.closePath(); g.fill(); };
      if (this.hover >= 0) wedge(ang(this.hover), ang(this.hover + 1), 'rgba(255,255,255,0.07)');
      if (s.focus) wedge(ang(s.focus[0]), ang(s.focus[0] + s.focus[1]), 'rgba(255,255,255,0.09)');
      if (this.focused) {
        wedge(ang(this.kb), ang(this.kb + 1), 'rgba(255,255,255,0.2)');
        g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, R * 1.0, ang(this.kb), ang(this.kb + 1)); g.arc(0, 0, R * 0.3, ang(this.kb + 1), ang(this.kb), true); g.closePath(); g.stroke();
      }
      if (this.pick >= 0 && nowMs - this.pickT < 700) wedge(ang(this.pick), ang(this.pick + 1), 'rgba(255,255,255,' + (0.2 * (1 - (nowMs - this.pickT) / 700)) + ')');

      // lanes
      const lanes = { crash: [0.965, 0.075], ride: [0.875, 0.05], snare: [0.72, 0.125], ghost: [0.72, 0.05], kick: [0.5, 0.15] };
      const dim = s.mute;
      const arc = (r, w, step, color, alpha, spanA, spanB) => {
        g.beginPath(); g.arc(0, 0, R * r, ang(step) + DA * (spanA == null ? 0.1 : spanA), ang(step) + DA * (spanB == null ? 0.9 : spanB));
        g.lineWidth = R * w; g.strokeStyle = color; g.globalAlpha = Math.max(0, alpha); g.stroke(); g.globalAlpha = 1;
      };
      // ghost slots (where a "normal" drummer would have played)
      g.save(); g.setLineDash([R * 0.02, R * 0.02]);
      for (const gs of s.ghosts) {
        const [r, w] = lanes[gs.v];
        g.beginPath(); g.arc(0, 0, R * (r + w / 2), ang(gs.s) + DA * 0.1, ang(gs.s) + DA * 0.9); g.arc(0, 0, R * (r - w / 2), ang(gs.s) + DA * 0.9, ang(gs.s) + DA * 0.1, true); g.closePath();
        g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,' + (0.45 + 0.25 * Math.sin(nowMs / 260)) + ')'; g.stroke();
      }
      g.restore();

      g.lineCap = 'butt';
      const grooveDim = !!(sv && sv.lock && sv.lock.type === 'groove');
      const dmap = {}, added = []; if (sv && sv.lock && sv.lock.diff) for (const d of sv.lock.diff) { if (d.kind === 'missing') dmap[d.src + ':' + d.voice] = 1; else added.push(d); }
      for (let st = 0; st < 64; st++) {
        const h = Amen.hits(st, s.expected), ba = s.barAlpha[st >> 4];
        const infoc = s.focus ? ((((st - s.focus[0]) % 64) + 64) % 64 < s.focus[1] ? 1 : 0.28) : 1;
        for (const v of ['ride', 'crash', 'snare', 'ghost', 'kick']) {
          const [r, w] = lanes[v];
          if (!s.layers[v]) { if (h[v]) arc(r, 0.012, st, '#ffffff', 0.07 * ba); continue; }
          if (!h[v]) continue;
          const f = this.flash[st + ':' + v], e = f ? Math.max(0, 1 - (nowMs - f) / 420) : 0;
          const width = v === 'ride' || v === 'ghost' ? w : w * (0.55 + 0.45 * h[v]);
          const base = (v === 'ride' ? 0.55 : v === 'ghost' ? 0.6 : 0.82) * ba * infoc * (1 - dim * 0.8) * (1 - sm * 0.82 * (1 - this.lk)) * (grooveDim && st >= 32 ? 1 - 0.78 * this.lk : 1) * (dmap[st + ':' + v] ? 1 - 0.8 * this.lk : 1);
          const col = COLORS[v];
          if (e > 0.02) arc(r, width * (1.5 + e * 0.8), st, col, e * 0.35, 0, 1);
          arc(r, width * (1 + e * 0.25), st, col, base + e * 0.35);
          if (v === 'crash') { // starburst
            g.save(); g.strokeStyle = col; g.globalAlpha = (0.4 + e * 0.6) * ba; g.lineWidth = 1.5;
            const a = ang(st + 0.5);
            for (let i = 0; i < 9; i++) { const aa = a + (i - 4) * 0.09; g.beginPath(); g.moveTo(Math.cos(aa) * R * 0.915, Math.sin(aa) * R * 0.915); g.lineTo(Math.cos(aa) * R * 1.0, Math.sin(aa) * R * 1.0); g.stroke(); }
            g.restore();
          }
        }
      }
      // expected vs actual, for a locked clip: dashed outline = the written pattern has a hit here that the clip lacks;
      // a bright, white-edged note = the clip plays a hit the written pattern does not have
      if (this.lk > 0.02) {
        g.save(); g.globalAlpha = this.lk;
        g.setLineDash([R * 0.02, R * 0.02]);
        for (const key in dmap) {
          const [stp, v] = key.split(':'), st = +stp, [r, w] = lanes[v];
          g.beginPath(); g.arc(0, 0, R * (r + w / 2), ang(st) + DA * 0.1, ang(st) + DA * 0.9); g.arc(0, 0, R * (r - w / 2), ang(st) + DA * 0.9, ang(st) + DA * 0.1, true); g.closePath();
          g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.25 * Math.sin(nowMs / 260)) + ')'; g.stroke();
        }
        g.setLineDash([]);
        for (const d of added) {
          const [r, wd] = lanes[d.voice], f = this.flash[d.src + ':' + d.voice], e = f ? Math.max(0, 1 - (nowMs - f) / 420) : 0;
          const fl = Math.floor(d.src), fr = d.src - fl, a0 = fr ? 0.12 : 0.1, a1 = fr ? 0.46 : 0.9, solid = d.count >= 2 || d.reps < 2;
          const k = this.lk * (solid ? 1 : 0.55);
          arc(r, wd * (1.5 + e * 0.5), fl, '#ffffff', (0.3 + e * 0.3) * k, fr + a0, fr + a1);
          arc(r, wd * (0.55 + 0.4 + e * 0.25), fl, COLORS[d.voice], 0.95 * k, fr + a0, fr + a1);
        }
        g.restore();
      }
      // ripples
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        const rp = this.ripples[i], t = (nowMs - rp.t) / 520;
        if (t >= 1) { this.ripples.splice(i, 1); continue; }
        const [r, w] = lanes[rp.v];
        const ra = rp.a != null ? rp.a - DA * (0.6 + t * 0.5) : ang(rp.s) - DA * t * 0.5, rb = rp.a != null ? rp.a + DA * (0.6 + t * 0.5) : ang(rp.s) + DA * (1 + t * 0.5);
        g.beginPath(); g.arc(0, 0, R * (r + t * 0.1), ra, rb);
        g.lineWidth = Math.max(1, R * w * 0.25 * (1 - t)); g.strokeStyle = COLORS[rp.v]; g.globalAlpha = (1 - t) * 0.6 * rp.vel; g.stroke(); g.globalAlpha = 1;
      }
      // the sample: its spectrum around the rim, and (when the clip really shows the break) a playhead locked to its tempo
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
      // highlights
      for (const hl of s.hl) {
        const [r, w] = lanes[hl.v], pulse = 0.5 + 0.5 * Math.sin(nowMs / 220 + hl.s);
        g.beginPath(); g.arc(0, 0, R * r, ang(hl.s) - DA * 0.08, ang(hl.s) + DA * 1.08);
        g.lineWidth = R * (w + 0.05 + pulse * 0.02); g.strokeStyle = hl.color || '#ffffff'; g.globalAlpha = 0.22 + pulse * 0.3; g.stroke(); g.globalAlpha = 1;
      }

      // playhead
      if (ph) {
        const a = ang(ph.src % 64);
        g.save(); g.lineCap = 'round';
        for (let i = 14; i >= 0; i--) {
          const aa = a - i * 0.012; g.strokeStyle = 'rgba(255,255,255,' + (0.5 * (1 - i / 15)) + ')'; g.lineWidth = i === 0 ? 2.2 : 1.4;
          g.beginPath(); g.moveTo(Math.cos(aa) * R * 0.3, Math.sin(aa) * R * 0.3); g.lineTo(Math.cos(aa) * R * 1.04, Math.sin(aa) * R * 1.04); g.stroke();
        }
        g.restore();
      }

      // center label
      const cr = R * 0.265;
      g.fillStyle = 'rgba(7,7,11,0.92)'; g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,61,127,' + (0.35 + this.kickPulse * 0.65) + ')'; g.beginPath(); g.arc(0, 0, cr * (1 + this.kickPulse * 0.04), 0, TAU); g.stroke();
      g.fillStyle = '#f1ece0'; g.font = '900 ' + Math.max(14, R * 0.15) + 'px "Big Shoulders Display", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      const c0 = sv && sm > 0.5 ? fmt(sv.pos) : s.center[0], c1 = sv && sm > 0.5 ? (sv.lock ? 'LOCKED \u00b7 ' + Math.round(sv.lock.bpm) + ' BPM' : sv.analyzed ? 'THE CLIP' : 'LISTENING\u2026') : s.center[1];
      g.fillText(c0, 0, R * 0.035);
      g.fillStyle = '#8b8a96'; g.font = '500 ' + Math.max(8, R * 0.045) + 'px "JetBrains Mono", ui-monospace, monospace';
      g.fillText(c1, 0, R * 0.115);
      if (sv && sm > 0.5 && sv.lock && sv.lock.diff && sv.lock.diff.length) {
        const na = sv.lock.diff.filter((d) => d.kind === 'added').length, nm = sv.lock.diff.length - na;
        g.fillStyle = '#f1ece0'; g.fillText([na ? '+' + na + ' NEW' : '', nm ? '\u2212' + nm + ' MISSING' : ''].filter(Boolean).join(' \u00b7 '), 0, R * 0.185);
      }
      g.restore();
    }
  }
  window.Wheel = Wheel; window.AMEN_COLORS = COLORS;
})();
