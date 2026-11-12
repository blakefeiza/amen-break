"""One-off patch: shorter card copy for the long scenes so phones never clip a card."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
h = (root / 'index.html').read_text()

def scene_bounds(name):
    i = h.index('data-scene="%s"' % name); j = h.index('</article>', i); return i, j

def set_first_p(name, html, drop_second=False):
    global h
    i, j = scene_bounds(name)
    seg = h[i:j]
    k = seg.index('</h2>')
    m = re.compile(r'<p>.*?</p>', re.S).search(seg, k)
    seg = seg[:m.start()] + '<p>' + html + '</p>' + seg[m.end():]
    if drop_second:
        m2 = re.compile(r'\s*<p>.*?</p>', re.S).search(seg, m.start() + len(html) + 7)
        seg = seg[:m2.start()] + seg[m2.end():]
    h = h[:i] + seg + h[j:]

def set_listen(name, html):
    global h
    i, j = scene_bounds(name); seg = h[i:j]
    seg = re.sub(r'<p class="listen">.*?</p>', '<p class="listen"><b>Listen for</b> ' + html + '</p>', seg, flags=re.S)
    h = h[:i] + seg + h[j:]

set_first_p('heard', 'This one drum pattern hides in thousands of songs. Press play and listen to the drums.')
set_listen('heard', 'a snappy &ldquo;boom, boom-chick&rdquo; and a rattling cymbal.')
set_first_p('djs', 'A DJ compilation, <i>Ultimate Breaks and Beats</i>, puts the break on a record made for looping, and Stetsasonic and Salt-N-Pepa sample it that year. Slow a record down and everything drops with it: a hip-hop drum kit.', drop_second=True)
set_listen('djs', 'the same beat, lower and heavier.')
set_first_p('jungle', 'Producers push it past 160 BPM and slice it into rolling, stuttering snares: jungle, then drum &amp; bass. Everything gets higher and tighter, like a record on fast-forward.')
set_listen('jungle', 'snares tumbling over each other.')
set_first_p('mainstream', 'By the 90s it has left the clubs. Primal Scream and The Prodigy use it, and in 1997 Bowie and Oasis both do. In 1999 it opens a cartoon set in the year 3000. More on that soon.')
set_listen('mainstream', 'that tumbling snare pattern in songs that aren&rsquo;t dance music.')
set_first_p('digital', 'So easy to cut up that it became a go-to for beat-makers. Breakcore shredded it to confetti. In 2004 Nate Harrison&rsquo;s short film <i>Can I Get an Amen?</i> asked where it came from and who owns it.')
set_first_p('today', 'Fifty-seven years on, producers are still chopping it. In 2026 the Library of Congress added &ldquo;Amen, Brother&rdquo; to the National Recording Registry.')
h = h.replace('data-tracks="DAMN|Ether|Geddup|The Real"', 'data-tracks="DAMN|Geddup|The Real"')
h = h.replace('Where else is it hiding? <span aria-hidden="true">&darr;</span>', 'More surprises <span aria-hidden="true">&darr;</span>')
h = re.sub(r'\?v=\d+"', '?v=26"', h)
(root / 'index.html').write_text(h)

c = (root / 'style.css').read_text()
c = c.replace("max-width: 560px; max-height: 68svh; overflow: auto;", "max-width: 560px; max-height: 74svh; overflow: auto;")
(root / 'style.css').write_text(c)
print('ok')
