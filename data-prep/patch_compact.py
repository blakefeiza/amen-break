"""One-off patch: compact cards on phones so no content is clipped and the record stays visible."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def sub(text, old, new):
    assert old in text, old[:90]
    return text.replace(old, new, 1)

h = (root / 'index.html').read_text()
h = sub(h, "<p>The Winstons recorded &ldquo;Amen, Brother&rdquo; in about twenty minutes as a B-side. At 1:26 everyone else stops, and drummer Gregory Coleman plays four bars alone. That&rsquo;s the break.</p>",
           "<p>The Winstons recorded &ldquo;Amen, Brother&rdquo; as a B-side. At 1:26 everyone else stops and drummer Gregory Coleman plays four bars alone. That&rsquo;s the break.</p>")
h = sub(h, "<span>the most-sampled track on WhoSampled, the biggest database of samples</span>", "<span>most-sampled track on WhoSampled</span>")
h = sub(h, "<p class=\"listen\"><b>Listen for</b> the whole band dropping out so that only the drums are left.</p>", "<p class=\"listen\"><b>Listen for</b> the band dropping out, leaving only drums.</p>")
h = sub(h, '<span class="pv-label">Original, 30s</span>', '<span class="pv-label">Original 30s</span>')
h = re.sub(r'\?v=\d+"', '?v=25"', h)
(root / 'index.html').write_text(h)

c = (root / 'style.css').read_text()
c += '''
/* ---------- compact cards on phones: nothing clipped, record stays in view */
@media (max-width: 859px) {
  .card { padding: 12px 20px 18px; }
  .cat { padding-bottom: 6px; margin-bottom: 10px; }
  .card .kicker { margin-bottom: 8px; padding: 2px 8px; }
  .card h2 { margin-bottom: 8px; }
  .card p { margin-bottom: 6px; }
  .card .stat { margin: 8px 0 4px; padding: 8px 0; } .card .stat b { font-size: 40px; }
  .card .listen { margin: 8px 0 2px; padding: 8px 10px; }
  .facts { margin: 10px 0 2px; } .facts b { font-size: 24px; }
  .card .row { margin-top: 10px; gap: 8px; } .card .row .btn { padding: 10px 14px; letter-spacing: .05em; }
  .card .tracks li { padding: 5px 0; }
  .card .more { margin-top: 4px; }
}
'''
(root / 'style.css').write_text(c)
print('ok')
