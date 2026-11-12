"""Follow-up: when one featured track is fading out, wait for it before fading the next one in."""
import pathlib
root = pathlib.Path(__file__).resolve().parent.parent
a = (root / 'app.js').read_text()
old = """    clearTimeout(autoT);
    if (autoId && autoScene !== name) { Amen.Preview.fadeStop(900); autoId = null; }          // leaving a featured section"""
new = """    clearTimeout(autoT);
    if (autoId && autoScene !== name) { Amen.Preview.fadeStop(900); autoId = null; delay = Math.max(delay || 0, 1600); }   // let the old one fade out first"""
assert old in a
a = a.replace(old, new)
(root / 'app.js').write_text(a)
print('ok')
