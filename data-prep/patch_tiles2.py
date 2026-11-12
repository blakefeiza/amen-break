"""Drop Andy Stott as a featured example, show the C418 title once, and give every tile in 'Wait, that has it?' a play button."""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def sub(text, old, new):
    assert old in text, old[:100]
    return text.replace(old, new, 1)

a = (root / 'app.js').read_text()
a = ''.join(l for l in a.splitlines(True) if not (l.lstrip().startswith("{ key: 'steal the amen'") or l.lstrip().startswith("{ key: 'up the box'")))
a = sub(a, "    const play = t.itunesId && t.shows !== false;", "    const play = !!t.itunesId;   // the record sits out this section, so every clip plays, whether or not it maps to the pattern")
a = sub(a, "const PRIME_IDS = [...new Set(TRACKS.filter((t) => t.shows !== false).map((t) => t.itunesId).concat([427200416, 1442919795]))];", "const PRIME_IDS = [...new Set(TRACKS.map((t) => t.itunesId).concat([427200416, 1442919795]))];")
(root / 'app.js').write_text(a)

h = (root / 'index.html').read_text()
h = sub(h, 'data-tracks="steal the amen|Up the Box"', 'data-tracks="steal the amen"')
h = re.sub(r'\?v=\d+"', '?v=43"', h)
(root / 'index.html').write_text(h)

p = root / 'tracks.js'
tracks = json.loads(p.read_text().split('=', 1)[1].rstrip().rstrip(';'))
for t in tracks:
    if t['title'] == 'Up the Box': t['shows'] = False
p.write_text('window.AMEN_TRACKS = ' + json.dumps(tracks, ensure_ascii=False, indent=1) + ';\n')
print('ok')
