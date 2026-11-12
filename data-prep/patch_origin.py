"""One-off patch: shorter origin card so it fits on a phone; secondary links live inside the fold."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
h = (root / 'index.html').read_text()
i = h.index('data-scene="origin"'); j = h.index('</article>', i)
new = '''data-scene="origin">
      <div class="card">
        <p class="kicker">1969</p>
        <h2>A B-side nobody noticed</h2>
        <p>The Winstons recorded &ldquo;Amen, Brother&rdquo; in about twenty minutes as a B-side. At 1:26 everyone else stops, and drummer Gregory Coleman plays four bars alone. That&rsquo;s the break.</p>
        <p class="stat"><b>#1</b><span>the most-sampled track on WhoSampled, the biggest database of samples</span></p>
        <p class="listen"><b>Listen for</b> the whole band dropping out so that only the drums are left.</p>
        <div class="facts"><span><b>1:26</b>starts</span><span><b>4</b>bars</span><span><b>~136</b>BPM</span><span><b>7s</b>long</span></div>
        <div class="row">
          <button class="btn btn--primary" data-act="playBreak"><span class="play-ico" aria-hidden="true"></span><span class="bk-label">Hear the break</span></button>
          <button class="btn" data-preview="427200416"><span class="play-ico" aria-hidden="true"></span><span class="pv-label">Original, 30s</span></button>
        </div>
        <details class="more"><summary>About the audio and the song</summary>
          <p class="note">The drums you hear on this page are rebuilt in your browser from published transcriptions. They are not the 1969 recording, and the groove&rsquo;s human timing is simplified. The 30-second Apple preview is the real track and may not reach the break.</p>
          <div class="rowline"><span>The tune it&rsquo;s built on</span><button class="btn btn--sm" data-preview="1442919795"><span class="play-ico" aria-hidden="true"></span><span class="pv-label">The Impressions, 1964</span></button></div>
        </details>
      </div>
    '''
h = h[:i] + new + h[j:]
h = re.sub(r'\?v=\d+"', '?v=24"', h)
(root / 'index.html').write_text(h)
print('ok')
