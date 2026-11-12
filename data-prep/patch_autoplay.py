"""One-off patch: much lower default levels, a gentler kit, and fade-in autoplay of the featured track when a section arrives."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def sub(text, old, new, count=1):
    assert old in text, old[:90]
    return text.replace(old, new, count)

# ------------------------------------------------------------------ engine
e = (root / 'engine.js').read_text()
# levels: quieter everywhere, with headroom if someone wants it louder
e = sub(e, "const lvl = () => Math.pow(T.vol, 1.5);   // perceptual-ish curve: 50% on the slider is a comfortable level",
        "const lvl = () => 0.7 * T.vol * T.vol;      // 50% on the slider is deliberately gentle; 100% is about the old default\n  const pvl = () => 0.8 * T.vol * T.vol;      // song previews are mastered hot, so they get the same curve")
# gentler kit
e = sub(e, "const VOICE_GAIN = { kick: 1, snare: 0.9, ghost: 0.85, ride: 0.55, crash: 0.6 };", "const VOICE_GAIN = { kick: 1, snare: 0.85, ghost: 0.7, ride: 0.38, crash: 0.42 };")
e = sub(e, "bus = ctx.createGain(); bus.gain.value = 0.9;", "bus = ctx.createGain(); bus.gain.value = 0.8;")
e = sub(e, "curve[i] = Math.tanh(x * 2.1) / Math.tanh(2.1);", "curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);")
e = sub(e, "tone.frequency.value = 11000;", "tone.frequency.value = 8500;")
# smoother ducking
e = sub(e, "  function setDuck(on) {\n    T.duck = on; if (out) out.gain.setTargetAtTime(on || !T.audible ? 0 : lvl(), ctx.currentTime, 0.03);",
        "  function setDuck(on, tc) {\n    T.duck = on; if (out) out.gain.setTargetAtTime(on || !T.audible ? 0 : lvl(), ctx.currentTime, tc || 0.03);")
# preview element: fades + new level curve
e = sub(e, "const el = new Audio(); el.preload = 'none'; el.volume = Math.pow(T.vol, 1.5);", "const el = new Audio(); el.preload = 'none'; let fadeMul = 1, fadeRaf = 0; const applyEl = () => { el.volume = Math.max(0, Math.min(1, pvl() * fadeMul)); }; applyEl();")
e = sub(e, "el.addEventListener('ended', () => { const id = current; current = null; if (id) emit(id, 'idle'); setDuck(false); });",
        "el.addEventListener('ended', () => { const id = current; current = null; if (id) emit(id, 'idle'); setDuck(false, 0.3); });")
e = sub(e, "if (current && !el.ended) { const id = current; current = null; emit(id, 'idle'); setDuck(false); }", "if (current && !el.ended) { const id = current; current = null; emit(id, 'idle'); setDuck(false, 0.3); }")
e = sub(e, "    let loading = null;\n    async function toggle(id) {", "    let loading = null;\n    async function toggle(id, opts) {")
e = sub(e, "        setDuck(true); await el.play(); emit(id, 'playing');", "        setDuck(true, opts && opts.fade ? 0.5 : 0.03); await el.play(); emit(id, 'playing');")
e = sub(e, "    function setVolume(v) { el.volume = Math.pow(v, 1.5); }", """    function setVolume() { applyEl(); }
    function fadeTo(target, ms, done) {
      cancelAnimationFrame(fadeRaf);
      if (volumeLocked()) { fadeMul = target; applyEl(); if (done) done(); return; }
      const from = fadeMul, t0 = performance.now();
      const step = (t) => { const k = Math.min(1, (t - t0) / ms); fadeMul = from + (target - from) * k; applyEl(); if (k < 1) fadeRaf = requestAnimationFrame(step); else if (done) done(); };
      fadeRaf = requestAnimationFrame(step);
    }
    /** Start a preview with a fade-in while the synth loop fades out. */
    async function auto(id) {
      id = String(id); if (current === id || loading === id) return;
      cancelAnimationFrame(fadeRaf); fadeMul = 0; applyEl();
      await toggle(id, { fade: true });
      if (current === id) fadeTo(1, 1800); else { fadeMul = 1; applyEl(); }
    }
    /** Fade the current preview out and bring the synth loop back underneath it. */
    function fadeStop(ms) {
      if (!current && !loading) return;
      setDuck(false, 0.35);
      fadeTo(0, ms || 900, () => { if (current) el.pause(); fadeMul = 1; applyEl(); });
    }""")
e = sub(e, "function stopAll() { if (loading) { const l = loading; loading = null; emit(l, 'idle'); } if (current) el.pause(); }",
        "function stopAll() { cancelAnimationFrame(fadeRaf); fadeMul = 1; applyEl(); if (loading) { const l = loading; loading = null; emit(l, 'idle'); } if (current) el.pause(); }")
e = sub(e, "return { toggle, stopAll, setVolume, volumeLocked, get current() { return current; } };", "return { toggle, auto, fadeStop, stopAll, setVolume, volumeLocked, get current() { return current; } };")
(root / 'engine.js').write_text(e)

# ------------------------------------------------------------------ app
a = (root / 'app.js').read_text()
# sound toggles hook the featured-track logic
a = sub(a, "Amen.unmute(); soundOn = true; paintSound(); syncTransport(); nudgeVolume(); return true;", "Amen.unmute(); soundOn = true; paintSound(); syncTransport(); nudgeVolume(); scheduleAuto(scene, 1500); return true;")
a = sub(a, "  function turnOff() { Amen.mute(); Amen.Preview.stopAll(); soundOn = false; paintSound(); }", "  function turnOff() { clearTimeout(autoT); autoId = null; Amen.mute(); Amen.Preview.stopAll(); soundOn = false; paintSound(); }")
# scene hook
a = sub(a, "    wheel.s.barAlpha = sc.bar; wheel.s.hl = exp ? [] : sc.hl || []; wheel.s.ghosts = exp ? [] : sc.ghosts || [];\n  }",
        "    wheel.s.barAlpha = sc.bar; wheel.s.hl = exp ? [] : sc.hl || []; wheel.s.ghosts = exp ? [] : sc.ghosts || [];\n    scheduleAuto(name, 900);\n  }")
# the autoplay machinery (placed before the scene observer)
a = sub(a, "  const sceneIO = new IntersectionObserver(", """  /* ---- featured track: when a section with a track arrives and sound is on, fade it in over the loop */
  const AUTO = { heard: 'Futurama', djs: 'Bust That Groove', escape: 'Straight Outta Compton', jungle: 'Demon' };
  const autoSkip = new Set();     // sections where the listener pressed pause: leave them alone
  let autoT = 0, autoId = null, autoScene = null;
  function scheduleAuto(name, delay) {
    clearTimeout(autoT);
    if (autoId && autoScene !== name) { Amen.Preview.fadeStop(900); autoId = null; }          // leaving a featured section
    if (!AUTO[name] || !soundOn || loopPaused || labPlaying || tour || autoSkip.has(name)) return;
    autoT = setTimeout(() => {
      if (scene !== name || !soundOn || !storyVisible || labPlaying || Amen.Preview.current) return;
      const t = findTrack(AUTO[name]); if (!t || !t.itunesId) return;
      autoId = String(t.itunesId); autoScene = name; Amen.Preview.auto(autoId);
    }, delay || 900);                                                                          // dwell first, so fast scrolling stays quiet
  }
  const sceneIO = new IntersectionObserver(""")
# remember manual pauses of the featured track, and any manual choice overrides autoplay
a = sub(a, "    const b = e.target.closest('[data-preview]'); if (!b) return;\n    if (labPlaying) stopLab();",
        "    const b = e.target.closest('[data-preview]'); if (!b) return;\n    if (autoId && b.dataset.preview === autoId && Amen.Preview.current === autoId) autoSkip.add(autoScene);   // they paused it: no more autoplay here\n    autoId = null;\n    if (labPlaying) stopLab();")
# leaving the story fades the featured track
a = sub(a, "new IntersectionObserver((es) => { storyVisible = es[0].isIntersecting; syncTransport(); }, { threshold: 0 }).observe($('#story'));",
        "new IntersectionObserver((es) => { storyVisible = es[0].isIntersecting; if (!storyVisible && autoId) { Amen.Preview.fadeStop(700); autoId = null; } syncTransport(); }, { threshold: 0 }).observe($('#story'));")
(root / 'app.js').write_text(a)
h = (root / 'index.html').read_text()
(root / 'index.html').write_text(re.sub(r'\?v=\d+"', '?v=19"', h))
print('patched')
