"""One-off patch: previews follow the volume slider (routed through Web Audio), roomier cards, 'most sampled' messaging."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def sub(text, old, new, count=1):
    assert old in text, old[:90]
    return text.replace(old, new, count)

# ------------------------------------------------------------------ engine: previews through a Web Audio gain
e = (root / 'engine.js').read_text()
e = sub(e, "const el = new Audio(); el.preload = 'none'; let fadeMul = 1, fadeRaf = 0; const applyEl = () => { el.volume = Math.max(0, Math.min(1, pvl() * fadeMul)); }; applyEl();",
"""const el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous';
    let fadeMul = 1, fadeRaf = 0, pg = null;   // pg: gain node once the element is routed through Web Audio (volume then works on iOS too)
    const applyEl = () => { const v = Math.max(0, Math.min(1, pvl() * fadeMul)); if (pg) { pg.gain.value = v; el.volume = 1; } else el.volume = v; };
    const route = () => { if (pg || !ctx) return; try { const s = ctx.createMediaElementSource(el); pg = ctx.createGain(); s.connect(pg); pg.connect(ctx.destination); } catch (err) { pg = null; } applyEl(); };
    applyEl();""")
e = sub(e, "        if (ctx) { try { await ctx.resume(); } catch (e) { /* ignore */ } }\n        const u = await urlFor(id);",
           "        ensureCtx(); try { await ctx.resume(); } catch (err) { /* ignore */ }\n        route();\n        const u = await urlFor(id);")
e = sub(e, "function volumeLocked() { const old = el.volume;", "function volumeLocked() { if (pg) return false; const old = el.volume;")
(root / 'engine.js').write_text(e)

# ------------------------------------------------------------------ HTML
h = (root / 'index.html').read_text()
h = sub(h, '<p class="lede">In 1969 a drummer played four bars nobody noticed. Since then they&rsquo;ve been borrowed by thousands of songs, probably including some you love.</p>',
           '<p class="lede">In 1969 a drummer played four bars nobody noticed. They became the most sampled drum break in music history, hiding in thousands of songs, probably including some you love.</p>')
h = sub(h, 'content="Four bars played by a drummer in 1969 became the most borrowed drum break in history. Hear it, take it apart, chop it, and follow its echoes."',
           'content="Four bars played by a drummer in 1969 became the most sampled drum break in music history. Hear it, take it apart, chop it, and follow its echoes."')
h = sub(h, 'content="Four bars from 1969, borrowed by thousands of songs. Hear it, take it apart, chop your own, and follow its echoes."',
           'content="The most sampled drum break in music history: four bars from 1969, hiding in thousands of songs. Hear it, chop your own, follow its echoes."')
h = sub(h, 'content="Four bars from 1969, borrowed by thousands of songs. Hear it, chop your own, follow its echoes."',
           'content="The most sampled drum break in music history: four bars from 1969, hiding in thousands of songs. Hear it, chop your own."')
# origin card: tighter copy, a #1 callout, and the long audio note tucked away
i = h.index('<h2>A B-side nobody noticed</h2>') + len('<h2>A B-side nobody noticed</h2>')
j = h.index('<p class="listen">', i)
h = h[:i] + '''
        <p>The Winstons cut &ldquo;Amen, Brother&rdquo; in about twenty minutes as the flip side of &ldquo;Color Him Father,&rdquo; the song that won the Grammy. One minute and 26 seconds in, everyone else stops and drummer Gregory Coleman plays four bars alone. That&rsquo;s the break.</p>
        <p class="stat"><b>#1</b><span>the most-sampled track on WhoSampled, the biggest database of samples</span></p>
        ''' + h[j:]
m = re.search(r'<p class="note">The drums you hear on this page.*?</p>', h, re.S)
assert m
h = h[:m.start()] + '<details class="more"><summary>About the audio</summary>' + m.group(0) + '</details>' + h[m.end():]
h = sub(h, '<li><a target="_blank" rel="noopener" href="https://musicbrainz.org/recording/61ef31c0-d65b-4d76-b9bb-80eec6e107de">MusicBrainz</a>',
           '<li><a target="_blank" rel="noopener" href="https://en.wikipedia.org/wiki/WhoSampled">Wikipedia, &ldquo;WhoSampled&rdquo;</a> &mdash; the site&rsquo;s most-sampled track. Estimates of how many songs use the break range from about 2,000 to more than 6,000.</li>\n        <li><a target="_blank" rel="noopener" href="https://musicbrainz.org/recording/61ef31c0-d65b-4d76-b9bb-80eec6e107de">MusicBrainz</a>')
h = re.sub(r'\?v=\d+"', '?v=22"', h)
(root / 'index.html').write_text(h)

# ------------------------------------------------------------------ CSS
c = (root / 'style.css').read_text()
c = sub(c, ".step { min-height: 100vh; min-height: 100svh; display: flex; align-items: flex-end; justify-content: center; padding: 0 12px 14px; }",
           ".step { min-height: 100vh; min-height: 100svh; display: flex; align-items: flex-end; justify-content: center; padding: 0 16px max(18px, env(safe-area-inset-bottom)); }")
c = sub(c, "max-width: 560px; max-height: 58svh; overflow: auto; padding: 14px 20px 18px;", "max-width: 560px; max-height: 68svh; overflow: auto; padding: 14px 22px 22px;")
c += '''
.card .stat { display: flex; align-items: center; gap: 12px; margin: 12px 0 6px; padding: 10px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.card .stat b { font: 900 46px/.8 var(--display); color: var(--fg); letter-spacing: 0; }
.card .stat span { font: 600 12px/1.35 var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--fg); }
.card .more { margin-top: 8px; } .card .more summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; font: 600 11.5px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--fg2); } .card .more p.note { margin-top: 0; }
'''
(root / 'style.css').write_text(c)

# ------------------------------------------------------------------ JS
a = (root / 'app.js').read_text()
a = sub(a, "text: 'Four bars from 1969, borrowed by thousands of songs. Hear it, take it apart, chop your own.'", "text: 'The most sampled drum break in music history: four bars from 1969, hiding in thousands of songs. Hear it, take it apart, chop your own.'")
a = sub(a, "Math.max(top + 150, h - cardH - 26)", "Math.max(top + 150, h - cardH - 36)")
a = sub(a, "if (open) { $('#volNote').hidden = !Amen.Preview.volumeLocked();", "if (open) { $('#volNote').hidden = true;")
(root / 'app.js').write_text(a)

# ------------------------------------------------------------------ social image text
o = root / 'social' / 'og.html'
t = o.read_text()
t = sub(t, "A drum break from 1969 that built hip-hop, jungle and pop. Hear it, chop your own.", "The most sampled drum break in music history, in four bars from 1969. Hear it, chop your own.")
o.write_text(t)
print('patched')
