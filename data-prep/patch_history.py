"""One-off patch: three more history chapters (1991-99, 2004-12, 2020-now) and a 'Hiding in plain sight' section."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def sub(text, old, new, count=1):
    assert old in text, old[:90]
    return text.replace(old, new, count)

# ------------------------------------------------------------------ HTML
h = (root / 'index.html').read_text()
h = sub(h, 'data-tracks="Futurama|Straight Outta Compton|Little Wonder" data-subs="The cartoon&rsquo;s theme song|The 1988 hip-hop landmark|a rock legend&rsquo;s 1997 single"',
           'data-tracks="Straight Outta Compton|D\'You Know|Little Wonder" data-subs="The 1988 hip-hop landmark|Britpop, from Be Here Now|a rock legend&rsquo;s 1997 single"')
h = sub(h, 'data-tracks="Demon|The Crane|Poison|Come on My Selector"', 'data-tracks="Demon|The Crane|Come on My Selector"')
h = sub(h, '\n        <a class="btn btn--primary" href="#lab">Your turn <span aria-hidden="true">&darr;</span></a>', '')

chapters = '''
    <article class="step" data-scene="mainstream">
      <div class="card">
        <p class="kicker">1991 &ndash; 1999</p>
        <h2>Then the mainstream finds out</h2>
        <p>By the 90s the break has left the clubs. Primal Scream put it on <i>Screamadelica</i>, The Prodigy used it on &ldquo;Poison,&rdquo; and in 1997 Bowie and Oasis both used it. In 1999 it opens a cartoon set in the year 3000. More on that one in a moment.</p>
        <ul class="tracks" data-tracks="Slip Inside|Poison"></ul>
        <p class="listen"><b>Listen for</b> that tumbling snare pattern in songs that aren&rsquo;t dance music at all.</p>
      </div>
    </article>

    <article class="step" data-scene="digital">
      <div class="card">
        <p class="kicker">2004 &ndash; 2012</p>
        <h2>Everyone&rsquo;s first chop</h2>
        <p>The break is so easy to cut up that it became a go-to for beat-makers. Breakcore shredded it to confetti. One composer even titled a track &ldquo;If you don&rsquo;t know what to do just steal the amen break.&rdquo; In 2004 Nate Harrison&rsquo;s short film <i>Can I Get an Amen?</i> explored where it came from and who owns a sound like this.</p>
        <ul class="tracks" data-tracks="Aaron 2|steal the amen|Up the Box"></ul>
      </div>
    </article>

    <article class="step" data-scene="today">
      <div class="card">
        <p class="kicker">2020 &rarr; now</p>
        <h2>It&rsquo;s still going</h2>
        <p>Fifty-seven years on, bass producers are still chopping it. In 2026 the Library of Congress added &ldquo;Amen, Brother&rdquo; to the National Recording Registry, preserving seven seconds of drumming as part of America&rsquo;s sound heritage.</p>
        <ul class="tracks" data-tracks="DAMN|Ether|Geddup|The Real"></ul>
        <a class="btn btn--primary" href="#plain">Where else is it hiding? <span aria-hidden="true">&darr;</span></a>
      </div>
    </article>
'''
i = h.index('data-scene="jungle"'); j = h.index('</article>', i) + len('</article>')
h = h[:j] + '\n' + chapters + h[j:]

plain = '''<!-- ============================================================ HIDING IN PLAIN SIGHT -->
<section class="plain" id="plain">
  <div class="wrap">
    <p class="kicker">Hiding in plain sight</p>
    <h2 class="h-big">Wait, that has it?</h2>
    <p class="lead">You expect it in jungle and hip-hop. You don&rsquo;t expect it in a cartoon theme, an R&amp;B single or a radio dance hit. Press play and listen to the drums.</p>
    <ul class="tiles" id="tiles" aria-label="Surprising places the Amen break shows up"></ul>
    <p class="note wide">Previews are 30-second clips, so the break may sit elsewhere in the full song. Facts come from Wikipedia and MusicBrainz.</p>
  </div>
</section>

'''
h = sub(h, '<!-- ============================================================ CHOP LAB -->', plain + '<!-- ============================================================ CHOP LAB -->')
h = sub(h, '<a href="#lab">Chop it</a>', '<a href="#plain">Surprises</a><a href="#lab">Chop it</a>')
h = re.sub(r'\?v=\d+"', '?v=21"', h)
(root / 'index.html').write_text(h)

# ------------------------------------------------------------------ CSS
c = (root / 'style.css').read_text()
c += '''
/* ---------- hiding in plain sight */
.plain { position: relative; z-index: 3; background: radial-gradient(90% 60% at 100% 0%, rgba(45, 226, 255, .08), transparent 60%), var(--ink); padding: 84px 0 70px; border-top: 1px solid var(--line); }
.tiles { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 14px; grid-template-columns: 1fr; }
.tile { position: relative; display: flex; flex-direction: column; gap: 6px; padding: 18px 18px 16px; border: 1px solid var(--line); border-radius: 4px; background: rgba(255, 255, 255, .03); color: var(--paper); transition: background .25s, color .25s, border-color .25s; }
.tile-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tile-tag { font: 700 11.5px var(--mono); letter-spacing: .14em; text-transform: uppercase; border: 1.5px solid currentColor; padding: 3px 9px; }
.tile-year { font: 900 44px/.85 var(--display); color: transparent; -webkit-text-stroke: 1.2px currentColor; }
.tile h3 { margin: 6px 0 0; font: 800 clamp(26px, 6vw, 34px)/.95 var(--display); text-transform: uppercase; }
.tile-by { margin: 0; font-size: 14px; opacity: .82; }
.tile-line { margin: 4px 0 8px; font-size: 15px; line-height: 1.45; max-width: 46ch; }
.tile .btn { align-self: flex-start; margin-top: auto; }
.tile .tile-eq { display: none; }
.tile.is-playing { background: var(--paper); color: #0b0b10; border-color: var(--paper); }
.tile.is-playing .btn { border-color: #0b0b10; color: #c40d45; }
.tile.is-playing :focus-visible { outline-color: #0b0b10; }
.tile.is-playing .tile-eq { display: inline-flex; align-items: flex-end; gap: 2px; height: 14px; margin-right: auto; margin-left: 10px; }
.tile-eq i { width: 3px; height: 4px; background: currentColor; animation: eq .9s ease-in-out infinite; } .tile-eq i:nth-child(2) { animation-delay: -.3s; } .tile-eq i:nth-child(3) { animation-delay: -.6s; }
.tile--hero h3 { font-size: clamp(40px, 10vw, 76px); }
.tile--hero .tile-year { font-size: clamp(64px, 16vw, 130px); }
.tile--hero .tile-line { font-size: 17px; }
@media (min-width: 760px) { .tiles { grid-template-columns: repeat(2, 1fr); } .tile--hero { grid-column: 1 / -1; } }
@media (min-width: 1100px) { .tiles { grid-template-columns: repeat(3, 1fr); } .plain { padding: 130px 0 110px; } .tile--hero { grid-column: 1 / -1; display: grid; grid-template-columns: minmax(0, 1fr) auto; column-gap: 40px; padding: 28px 32px; } .tile--hero .tile-top { grid-column: 2; grid-row: 1 / span 5; flex-direction: column; align-items: flex-end; justify-content: space-between; } .tile--hero > :not(.tile-top) { grid-column: 1; } }
'''
(root / 'style.css').write_text(c)

# ------------------------------------------------------------------ JS
a = (root / 'app.js').read_text()
a = sub(a, "side = { djs: 1, escape: 1, jungle: 1 };", "side = { djs: 'B', escape: 'B', jungle: 'B', mainstream: 'C', digital: 'C', today: 'C' };")
a = sub(a, "'<span>Side ' + (side[s.dataset.scene] ? 'B' : 'A') + '</span>", "'<span>Side ' + (side[s.dataset.scene] || 'A') + '</span>")
a = sub(a, "const AUTO = { heard: 'Futurama', djs: 'Bust That Groove', escape: 'Straight Outta Compton', jungle: 'Demon' };",
           "const AUTO = { heard: 'Little Wonder', djs: 'Bust That Groove', escape: 'Straight Outta Compton', jungle: 'Demon', mainstream: 'Slip Inside', digital: 'Aaron 2', today: 'The Real' };")
# scenes
m = re.search(r"    jungle: \{ layout: 'side', bpm: 168,[^\n]*\n", a)
assert m
a = a[:m.end()] + """    mainstream: { layout: 'side', bpm: 136, bar: [1, 1, 1, 1], center: () => ['1997', 'GOES MAINSTREAM'] },
    digital: { layout: 'side', bpm: 140, bar: [1, 1, 1, 1], center: () => ['2004', 'EVERYONE\\u2019S FIRST CHOP'] },
    today: { layout: 'side', bpm: 150, bar: [1, 1, 1, 1], center: () => ['NOW', 'STILL GOING'] },
""" + a[m.end():]
# tiles
a = sub(a, "  document.addEventListener('click', (e) => {\n    const b = e.target.closest('[data-preview]'); if (!b) return;", r"""  // "Wait, that has it?" tiles: every claim below is from Wikipedia or MusicBrainz
  const TILES = [
    { key: 'futurama', tag: 'A cartoon', hero: true, line: 'The opening theme of Futurama is built on it. A later remix of the theme swapped the break for newly recorded drums.' },
    { key: 'crystalline', tag: 'Art-pop', line: 'Björk’s song ends in a drum & bass section that uses the break.' },
    { key: 'jackie (b', tag: 'R&B', line: 'Yes, even here. The track samples “Amen, Brother.”' },
    { key: 'untitled 05', tag: 'Rap', line: 'A downtempo, jazz-flavored Kendrick Lamar track with the break underneath.' },
    { key: 'no money', tag: 'Radio dance hit', line: 'A big Galantis hit. The break lands most clearly at 1:44, past the end of the 30-second preview.' },
    { key: 'second 2 none', tag: 'Indie electronic', line: 'Mura Masa and Christine and the Queens sample it.' },
    { key: 'the game compton', tag: 'West Coast rap', line: 'The same break N.W.A used on “Straight Outta Compton,” rediscovered in 2006.' },
    { key: 'digital circuit', tag: 'Game composer', line: 'From the composer best known for the Sonic the Hedgehog games. MusicBrainz lists it as sampling the break.' },
  ];
  $('#tiles').innerHTML = TILES.map((d) => {
    const t = findTrack(d.key); if (!t || !t.itunesId) return '';
    return '<li class="tile' + (d.hero ? ' tile--hero' : '') + '"><div class="tile-top"><span class="tile-tag">' + esc(d.tag) + '</span><span class="tile-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="tile-year" aria-label="' + t.year + '">' + t.year + '</span></div>' +
      '<h3>' + esc(t.title.replace(/ Original Series Theme \(TV version\)/, ' theme')) + '</h3><p class="tile-by">' + esc(t.artist) + '</p><p class="tile-line">' + esc(d.line) + '</p>' +
      '<button class="btn btn--sm" data-preview="' + t.itunesId + '" aria-label="Play 30-second preview of ' + esc(t.title) + ' by ' + esc(t.artist) + '"><span class="play-ico"></span><span class="pv-label">Listen</span></button></li>';
  }).join('');
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-preview]'); if (!b) return;""")
a = sub(a, "b.classList.toggle('is-loading', state === 'loading');", "b.classList.toggle('is-loading', state === 'loading'); const tile = b.closest('.tile'); if (tile) tile.classList.toggle('is-playing', state === 'playing');")
(root / 'app.js').write_text(a)
print('patched')
