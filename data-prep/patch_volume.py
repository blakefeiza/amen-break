"""One-off patch: master volume (default 50%) with a prompt, in the engine, HUD markup, styles and app."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def sub(text, old, new, count=1):
    assert old in text, old[:80]
    return text.replace(old, new, count)

# ------------------------------------------------------------------ engine
e = (root / 'engine.js').read_text()
e = sub(e, "audible: false, domain: 'perf', events: [], evId: 0, duck: false,", "audible: false, domain: 'perf', events: [], evId: 0, duck: false, vol: 0.5,")
e = sub(e, "const now = () =>", "const lvl = () => Math.pow(T.vol, 1.5);   // perceptual-ish curve: 50% on the slider is a comfortable level\n  const now = () =>")
e = sub(e, "out = ctx.createGain(); out.gain.value = 0.85;", "out = ctx.createGain(); out.gain.value = lvl();")
e = sub(e, "T.audible = true; out.gain.setTargetAtTime(0.85, ctx.currentTime, 0.02);", "T.audible = true; out.gain.setTargetAtTime(T.duck ? 0 : lvl(), ctx.currentTime, 0.02);")
e = sub(e, "T.duck = on; if (out) out.gain.setTargetAtTime(on || !T.audible ? 0 : 0.85, ctx.currentTime, 0.03);", "T.duck = on; if (out) out.gain.setTargetAtTime(on || !T.audible ? 0 : lvl(), ctx.currentTime, 0.03);")
e = sub(e, "out.gain.setTargetAtTime(T.duck ? 0 : 0.85, ctx.currentTime, 0.02); }", "out.gain.setTargetAtTime(T.duck ? 0 : lvl(), ctx.currentTime, 0.02); }")
e = sub(e, "  /** Short synthesized blip", """  function setVolume(v) {
    T.vol = Math.max(0, Math.min(1, v));
    if (out && T.audible && !T.duck) out.gain.setTargetAtTime(lvl(), ctx.currentTime, 0.03);
    Preview.setVolume(T.vol);
  }

  /** Short synthesized blip""")
e = sub(e, "const el = new Audio(); el.preload = 'none';", "const el = new Audio(); el.preload = 'none'; el.volume = Math.pow(T.vol, 1.5);")
e = sub(e, "    function stopAll()", """    // iOS Safari ignores script control of media volume; the page tells people to use the phone's buttons there
    function setVolume(v) { el.volume = Math.pow(v, 1.5); }
    function volumeLocked() { const old = el.volume; el.volume = old > 0.5 ? 0.25 : 0.75; const locked = Math.abs(el.volume - (old > 0.5 ? 0.25 : 0.75)) > 0.001; el.volume = old; return locked; }
    function stopAll()""")
e = sub(e, "return { toggle, stopAll, get current() { return current; } };", "return { toggle, stopAll, setVolume, volumeLocked, get current() { return current; } };")
e = sub(e, "enable, mute, unmute, setDuck, ping, scope, Preview, srcOf,", "enable, mute, unmute, setDuck, ping, scope, Preview, srcOf, setVolume,\n    get vol() { return T.vol; },")
(root / 'engine.js').write_text(e)

# ------------------------------------------------------------------ markup
h = (root / 'index.html').read_text()
old = '''    <button class="sound" id="sound" aria-pressed="false" aria-label="Turn sound on">
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="sound-label">Sound off</span>
    </button>
  </div>
</header>'''
new = '''    <button class="iconbtn" id="volBtn" aria-expanded="false" aria-controls="volPanel" aria-label="Volume"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
    <button class="sound" id="sound" aria-pressed="false" aria-label="Turn sound on">
      <span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="sound-label">Sound off</span>
    </button>
  </div>
  <div class="volpanel" id="volPanel" role="group" aria-label="Volume" hidden>
    <p class="vol-hint" id="volHint">Sound is on at 50%. Slide to what&rsquo;s comfortable.</p>
    <label class="vol-row"><span class="vol-lbl">Volume</span><input type="range" id="volume" min="0" max="100" step="5" value="50" aria-valuetext="50 percent"><output id="volOut" for="volume">50%</output></label>
    <p class="vol-note" id="volNote" hidden>On iPhone, song previews follow your phone&rsquo;s volume buttons.</p>
  </div>
</header>'''
h = sub(h, old, new)
h = re.sub(r'\?v=\d+"', '?v=18"', h)
(root / 'index.html').write_text(h)

# ------------------------------------------------------------------ styles
c = (root / 'style.css').read_text()
c += '''
/* ---------- volume */
.volpanel { position: absolute; top: calc(100% - 10px); right: 12px; width: min(290px, calc(100vw - 24px)); padding: 14px 16px 12px; border-radius: 14px; background: rgba(13, 13, 20, .96); border: 1px solid rgba(255, 255, 255, .22); box-shadow: 0 18px 50px rgba(0, 0, 0, .6); pointer-events: auto; }
.volpanel[hidden] { display: none; }
.vol-hint { margin: 0 0 4px; font-size: 13.5px; line-height: 1.35; color: var(--paper); }
.vol-row { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; }
.vol-lbl { font: 600 12px var(--mono); letter-spacing: .12em; text-transform: uppercase; color: #b3b1bd; }
.volpanel output { font: 700 13px var(--mono); color: var(--snare); min-width: 3.2em; text-align: right; }
.vol-note { margin: 4px 0 0; font-size: 12.5px; color: #b3b1bd; }
.iconbtn.nudge { border-color: var(--snare); color: var(--snare); animation: halo 1.6s infinite; }
.iconbtn[aria-expanded="true"] { border-color: var(--snare); color: var(--snare); }
@media (max-width: 430px) { .hide-sm { display: none; } .sound { padding: 8px 12px; gap: 8px; } .hud-r { gap: 6px; } }
'''
(root / 'style.css').write_text(c)

# ------------------------------------------------------------------ app
a = (root / 'app.js').read_text()
a = sub(a, "$('.sound-label', soundBtn).textContent = soundOn ? 'Sound on' : 'Sound off';", "$('.sound-label', soundBtn).innerHTML = '<span class=\"hide-sm\">Sound </span>' + (soundOn ? 'on' : 'off');")
a = sub(a, "Amen.unmute(); soundOn = true; paintSound(); syncTransport(); return true;", "Amen.unmute(); soundOn = true; paintSound(); syncTransport(); nudgeVolume(); return true;")
a = sub(a, "  const ensureSound = async () =>", """  /* ---- volume: remembered, starts at 50%, and the first time sound turns on we point at it */
  const volBtn = $('#volBtn'), volPanel = $('#volPanel'), volInput = $('#volume'), volOut = $('#volOut');
  let volIdle = 0, nudged = false;
  try { const s = localStorage.getItem('amen-vol'); if (s !== null && !isNaN(+s)) volInput.value = Math.round(+s * 100); } catch (e) { /* private mode */ }
  function applyVol(save) {
    const v = +volInput.value / 100; Amen.setVolume(v); volOut.textContent = volInput.value + '%'; volInput.setAttribute('aria-valuetext', volInput.value + ' percent');
    $('#volHint').textContent = nudged && !volTouched ? 'Sound is on at ' + volInput.value + '%. Slide to what\\u2019s comfortable.' : 'Volume ' + volInput.value + '%';
    if (save) { try { localStorage.setItem('amen-vol', v); } catch (e) { /* ignore */ } }
  }
  let volTouched = false;
  function openVol(open, auto) {
    volPanel.hidden = !open; volBtn.setAttribute('aria-expanded', open); clearTimeout(volIdle);
    if (open) { $('#volNote').hidden = !Amen.Preview.volumeLocked(); if (auto) volIdle = setTimeout(() => openVol(false), 8000); }
    if (!open) volBtn.classList.remove('nudge');
  }
  function nudgeVolume() {
    if (nudged) return; nudged = true; volTouched = false; applyVol(false);
    volBtn.classList.add('nudge'); openVol(true, true); announce('Sound is on at ' + volInput.value + ' percent. A volume control is at the top right.');
  }
  volBtn.addEventListener('click', () => { volTouched = true; openVol(volPanel.hidden); applyVol(false); });
  volInput.addEventListener('input', () => { volTouched = true; applyVol(true); clearTimeout(volIdle); volBtn.classList.remove('nudge'); });
  volInput.addEventListener('change', () => { volIdle = setTimeout(() => openVol(false), 4000); });
  document.addEventListener('pointerdown', (e) => { if (!volPanel.hidden && !e.target.closest('#volPanel, #volBtn')) openVol(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !volPanel.hidden) { openVol(false); volBtn.focus(); } });
  applyVol(false);

  const ensureSound = async () =>""")
(root / 'app.js').write_text(a)
print('patched')
