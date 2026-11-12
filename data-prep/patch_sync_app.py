"""App/CSS/HTML: drive the picture from the playing sample, stop samples that scroll away, prefetch and decode what the
reader is about to reach, pulse the echoes dot with the clip, a Sync nudge for Bluetooth, and cheaper per-frame work."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def sub(text, old, new):
    assert old in text, old[:100]
    return text.replace(old, new, 1)

# ------------------------------------------------------------------ app.js
a = (root / 'app.js').read_text()
a = sub(a, "    if (open) { $('#volNote').hidden = true; if (auto) volIdle = setTimeout(() => openVol(false), 8000); }", "    if (open) { if (auto) volIdle = setTimeout(() => openVol(false), 8000); }")
a = sub(a, "\n  applyVol(false);\n\n  const ensureSound", """
  applyVol(false);
  // Sync: delay the picture a little when the sound reaches the ears late (Bluetooth speakers and headphones report no latency)
  const nudgeIn = $('#nudge'), nudgeOut = $('#nudgeOut');
  try { const s = localStorage.getItem('amen-nudge'); if (s !== null && !isNaN(+s)) nudgeIn.value = +s; } catch (e) { /* private mode */ }
  function applyNudge(save) {
    Amen.setNudge(+nudgeIn.value); nudgeOut.textContent = nudgeIn.value + ' ms'; nudgeIn.setAttribute('aria-valuetext', nudgeIn.value + ' milliseconds');
    if (save) { try { localStorage.setItem('amen-nudge', nudgeIn.value); } catch (e) { /* ignore */ } }
  }
  nudgeIn.addEventListener('input', () => { applyNudge(true); clearTimeout(volIdle); });
  applyNudge(false);

  const ensureSound""")
# featured-track scheduling also warms what's next
a = sub(a, "    clearTimeout(autoT);\n    if (autoId && autoScene !== name)", """    clearTimeout(autoT);
    const tr0 = AUTO[name] && findTrack(AUTO[name]); if (tr0 && tr0.itunesId) Amen.Preview.warm(tr0.itunesId);                       // decode this scene's track now
    const keys = Object.keys(AUTO), nx = AUTO[keys[keys.indexOf(name) + 1]], tr1 = nx && findTrack(nx); if (tr1 && tr1.itunesId) Amen.Preview.prefetch(tr1.itunesId);   // and fetch the next
    if (autoId && autoScene !== name)""")
a = sub(a, "    const b = e.target.closest('[data-preview]'); if (!b) return;\n    if (autoId && b.dataset.preview === autoId", "    const b = e.target.closest('[data-preview]'); if (!b) return;\n    lastHost = b.closest('.card, .tile, .erow') || b;\n    if (autoId && b.dataset.preview === autoId")
# echoes: warm around the active row, light the playing dot with the clip
a = sub(a, "    if (i === activeIdx) return; activeIdx = i; paintEcho();", "    if (i === activeIdx) return; activeIdx = i; paintEcho();\n    if (i >= 0) { Amen.Preview.warm(order[i].itunesId); [i + 1, i + 2].forEach((n) => { if (order[n]) Amen.Preview.prefetch(order[n].itunesId); }); }")
a = sub(a, "  // playback <-> chart: whatever preview is playing lights up its dot and row\n", "  // playback <-> chart: whatever preview is playing lights up its dot and row\n  let playingK = -1, dotPulse = 0;\n")
a = sub(a, "    const on = state === 'playing'; dots[k].el.classList.toggle('is-playing', on); rows[k].classList.toggle('is-playing', on);",
           "    const on = state === 'playing'; dots[k].el.classList.toggle('is-playing', on); rows[k].classList.toggle('is-playing', on);\n    playingK = on ? k : (playingK === k ? -1 : playingK); if (!on) { const hh = dots[k].el.querySelector('.halo'); if (hh) hh.style.transform = ''; }")
# smart loading + stop-on-scroll-away
a = sub(a, "  /* =============================================================== frame loop */", r"""  /* =============================================================== smart loading, and stopping samples you scroll past */
  let lastHost = null, awayHost = null, awayId = null, armed = false, armT = 0;
  const idleCb = window.requestIdleCallback || ((f) => setTimeout(f, 700));
  const PRIME_IDS = [...new Set(TRACKS.map((t) => t.itunesId).concat([427200416, 1442919795]))];
  idleCb(() => { Amen.prepare(); Amen.Preview.prime(PRIME_IDS); });       // build the drum kit and look up every preview URL in one request, while the browser is idle
  const nearIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) Amen.Preview.prefetch(e.target.dataset.preview); }), { rootMargin: '160% 0px 160% 0px' });   // fetch bytes ~1.5 screens ahead
  const warmIO = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) Amen.Preview.warm(e.target.dataset.preview); }), { rootMargin: '45% 0px 45% 0px' });          // decode + analyze half a screen ahead
  $$('[data-preview]').forEach((b) => {
    nearIO.observe(b); warmIO.observe(b);
    const hot = () => Amen.Preview.warm(b.dataset.preview);                  // hover, touch or focus means a press is coming
    b.addEventListener('pointerenter', hot, { passive: true }); b.addEventListener('touchstart', hot, { passive: true }); b.addEventListener('focus', hot);
  });
  const away = new IntersectionObserver((es) => es.forEach((e) => { if (armed && !e.isIntersecting && !tour) Amen.Preview.fadeStop(450); }), { rootMargin: '-6% 0px -6% 0px' });
  document.addEventListener('amen:preview', (e) => {
    const { id, state } = e.detail;
    if (state === 'playing') {
      let host = lastHost && (lastHost.matches('[data-preview="' + id + '"]') || lastHost.querySelector('[data-preview="' + id + '"]')) ? lastHost : null;
      if (!host && autoId === id && autoScene) host = $('.step[data-scene="' + autoScene + '"] .card');
      if (!host) { const b = $('[data-preview="' + id + '"]'); host = b && (b.closest('.card, .tile, .erow') || b); }
      if (awayHost) away.unobserve(awayHost);
      awayHost = host; awayId = id; armed = false; clearTimeout(armT);
      if (host) { away.observe(host); armT = setTimeout(() => { armed = true; }, 900); }
    } else if (state !== 'loading' && awayHost && id === awayId) { away.unobserve(awayHost); awayHost = null; awayId = null; armed = false; clearTimeout(armT); }
  });

  /* =============================================================== frame loop */""")
a = sub(a, "  const progress = $('#progress'), stage = $('#stage');", """  const progress = $('#progress');
  // custom properties are set on the glow only (setting them on :root restyles the whole page every frame), and only when they change
  const glowEl = $('.glow'); let gP = -1, gX = -1, gY = -1;
  function setGlow(p, x, y) {
    p = Math.round(p * 50) / 50; if (p !== gP) { glowEl.style.setProperty('--pulse', p); gP = p; }
    if (Math.abs(x - gX) > 0.5 || Math.abs(y - gY) > 0.5) { glowEl.style.setProperty('--gx', x.toFixed(1) + 'px'); glowEl.style.setProperty('--gy', y.toFixed(1) + 'px'); gX = x; gY = y; }
  }""")
a = sub(a, "    paintBreak(); wheel.draw(t);\n    if (storyVisible && wheel.cur) {\n      document.documentElement.style.setProperty('--pulse', reduce ? 0 : wheel.kickPulse.toFixed(3));\n      stage.style.setProperty('--gx', wheel.cur.cx + 'px'); stage.style.setProperty('--gy', wheel.cur.cy + 'px');\n    }",
           "    Amen.Preview.tick(); paintBreak(); wheel.draw(t);\n    if (storyVisible && wheel.cur) setGlow(reduce ? 0 : wheel.kickPulse, wheel.cur.cx, wheel.cur.cy);")
a = sub(a, "    if (labVisible) { updateLabHighlights(); wheel2.draw(t); drawScope(); if (!storyVisible) document.documentElement.style.setProperty('--pulse', wheel2.kickPulse.toFixed(3)); }",
           """    if (labVisible) { updateLabHighlights(); wheel2.draw(t); drawScope(); }
    if (playingK >= 0 && dots[playingK]) {                                   // the echoes dot beats with the clip
      const fx = Amen.Preview.fx; for (let i = 0; i < fx.length; i++) if (fx[i].b === 0) dotPulse = 1;
      dotPulse *= 0.88; const hh = dots[playingK].el.querySelector('.halo'); if (hh) hh.style.transform = 'scale(' + (1 + 0.9 * dotPulse).toFixed(2) + ')';
    }""")
a = sub(a, "const wheel2 = new Wheel($('#wheel2'), {", "const wheel2 = new Wheel($('#wheel2'), {\n    sample: false,")
(root / 'app.js').write_text(a)

# ------------------------------------------------------------------ HTML
h = (root / 'index.html').read_text()
h = sub(h, '''    <p class="vol-note" id="volNote" hidden>On iPhone, song previews follow your phone&rsquo;s volume buttons.</p>''',
           '''    <label class="vol-row"><span class="vol-lbl">Sync</span><input type="range" id="nudge" min="0" max="400" step="10" value="0" aria-valuetext="0 milliseconds"><output id="nudgeOut" for="nudge">0 ms</output></label>
    <p class="vol-note" id="volNote">Picture ahead of the sound, like on Bluetooth speakers? Slide Sync to delay the picture.</p>''')
h = re.sub(r'\?v=\d+"', '?v=30"', h)
(root / 'index.html').write_text(h)

# ------------------------------------------------------------------ CSS
c = (root / 'style.css').read_text()
c = sub(c, "opacity: .07; mix-blend-mode: overlay;", "opacity: .05;")
c = c.replace("background: rgba(13, 13, 20, .7); backdrop-filter: blur(10px);", "background: rgba(13, 13, 20, .9);")
c = sub(c, "animation: dp .7s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; } @keyframes dp { to { transform: scale(1.7); } }", "transform-box: fill-box; transform-origin: center; }")
c += '''
/* ---------- snappy controls: no tap delay, instant pressed feedback, no blur behind the top bar */
html, button, a, input, summary, label, [role="button"] { touch-action: manipulation; }
.iconbtn, .sound { transition: transform .08s, background .08s, border-color .15s; }
.iconbtn:active, .sound:active, .seg button:active, .chip:active { transform: scale(.93); background: rgba(48, 48, 66, .95); }
#echo .dot .halo { transition: opacity .2s; will-change: transform; }
'''
(root / 'style.css').write_text(c)
print('app patched')
