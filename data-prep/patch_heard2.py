"""The opening card no longer repeats N.W.A, who belong to the 1988 card."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
h = (root / 'index.html').read_text()
old = 'data-tracks="Futurama|Straight Outta Compton|The Game Compton" data-subs="The cartoon&rsquo;s theme song|The 1988 hip-hop landmark|West Coast rap, 2006"'
assert old in h
h = h.replace(old, 'data-tracks="Futurama|The Game Compton" data-subs="The cartoon&rsquo;s theme song|West Coast rap, 2006"', 1)
h = re.sub(r'\?v=\d+"', '?v=44"', h)
(root / 'index.html').write_text(h)
print('ok')
