"""Serve clips from our own origin (audio/<id>.m4a) first; fall back to Apple's servers. Needed because Tableau's web-page frame blocks third-party calls."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
def sub(t, o, n):
    assert o in t, o[:80]; return t.replace(o, n, 1)
e = (root / 'engine.js').read_text()
e = sub(e, "    const getUrl = (id) => (urlMap[id] ?",
"    const LOCAL = new Set((window.AMEN_AUDIO || []).map(String)), localUrl = (id) => 'audio/' + id + '.m4a';\n    const getUrl = (id) => (LOCAL.has(String(id)) ? Promise.resolve(localUrl(id)) : urlMap[id] ?")
e = sub(e, "      const r = await fetch(await getUrl(id), { mode: 'cors' }); if (!r.ok) throw new Error('fetch ' + r.status);\n      const ab = await r.arrayBuffer();",
"      let r = null;\n      if (LOCAL.has(id)) { try { r = await fetch(localUrl(id)); if (!r.ok) r = null; } catch (err) { r = null; } }\n      if (!r) { r = await fetch(await lookupUrl(id), { mode: 'cors' }); if (!r.ok) throw new Error('fetch ' + r.status); }\n      const ab = await r.arrayBuffer();")
e = sub(e, "    const getRaw =", "    const lookupUrl = (id) => (urlMap[id] ? Promise.resolve(urlMap[id]) : once('u' + id, async () => { await lookup([id]); if (!urlMap[id]) throw new Error('no preview'); return urlMap[id]; }));\n    const getRaw =")
(root / 'engine.js').write_text(e)
h = (root / 'index.html').read_text()
h = sub(h, '<script src="tracks.js?v=44"></script>', '<script src="tracks.js?v=45"></script>\n<script src="audio.js?v=45"></script>')
h = re.sub(r'\?v=44"', '?v=45"', h)
(root / 'index.html').write_text(h)
print('ok')
