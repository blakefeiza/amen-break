"""One-off patch: 'Hear the break' becomes a play/pause toggle; a preview that is still loading can be cancelled."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

h = (root / 'index.html').read_text()
old = '<span class="play-ico" aria-hidden="true"></span>Hear the break</button>'
assert old in h
h = h.replace(old, '<span class="play-ico" aria-hidden="true"></span><span class="bk-label">Hear the break</span></button>')
h = re.sub(r'\?v=\d+"', '?v=17"', h)
(root / 'index.html').write_text(h)

a = (root / 'app.js').read_text()
old = """  $$('[data-act="playBreak"]').forEach((b) => b.addEventListener('click', async () => { await ensureSound(); Amen.stop(); Amen.start({ mode: 'full' }); }));"""
assert old in a
new = """  const breakPlaying = () => soundOn && !loopPaused && Amen.T.playing && !labPlaying;
  $$('[data-act="playBreak"]').forEach((b) => b.addEventListener('click', async () => {
    if (breakPlaying()) { setPaused(true); return; }                       // second click pauses
    loopPaused = false; paintPause(); await ensureSound(); Amen.stop(); Amen.start({ mode: 'full' });
  }));
  let breakWas = null;
  function paintBreak() {
    const on = breakPlaying(); if (on === breakWas) return; breakWas = on;
    $$('[data-act="playBreak"]').forEach((b) => { b.classList.toggle('is-playing', on); $('.bk-label', b).textContent = on ? 'Pause the break' : 'Hear the break'; });
  }"""
a = a.replace(old, new)
old = "    wheel.draw(t);\n    if (storyVisible && wheel.cur) {"
assert old in a
a = a.replace(old, "    paintBreak(); wheel.draw(t);\n    if (storyVisible && wheel.cur) {", 1)
(root / 'app.js').write_text(a)

e = (root / 'engine.js').read_text()
old = """    async function toggle(id) {
      id = String(id);
      if (current === id) { el.pause(); return; }
      if (current) { const old = current; current = null; el.pause(); emit(old, 'idle'); }
      emit(id, 'loading');
      try {
        if (ctx) { try { await ctx.resume(); } catch (e) { /* ignore */ } }
        el.src = await urlFor(id); current = id;
        setDuck(true); await el.play(); emit(id, 'playing');
      } catch (e) { current = null; setDuck(false); emit(id, 'error'); }
    }"""
assert old in e
new = """    let loading = null;
    async function toggle(id) {
      id = String(id);
      if (current === id) { el.pause(); return; }
      if (loading === id) { loading = null; emit(id, 'idle'); return; }     // second click while it loads cancels
      if (current) { const old = current; current = null; el.pause(); emit(old, 'idle'); }
      if (loading) emit(loading, 'idle');
      loading = id; emit(id, 'loading');
      try {
        if (ctx) { try { await ctx.resume(); } catch (e) { /* ignore */ } }
        const u = await urlFor(id); if (loading !== id) return;
        el.src = u; current = id; loading = null;
        setDuck(true); await el.play(); emit(id, 'playing');
      } catch (e) { if (loading === id) loading = null; current = null; setDuck(false); emit(id, 'error'); }
    }"""
e = e.replace(old, new)
old = "function stopAll() { if (current) el.pause(); }"
assert old in e
e = e.replace(old, "function stopAll() { if (loading) { const l = loading; loading = null; emit(l, 'idle'); } if (current) el.pause(); }")
(root / 'engine.js').write_text(e)
print('patched')
