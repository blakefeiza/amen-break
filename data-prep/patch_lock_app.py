"""Curation + wiring: only clips whose drums clearly show the break get a preview (and drive the record); the rest are subbed
out of the story cards, and in tiles / the echoes list they keep their facts but lose the play button."""
import json, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def sub(text, old, new):
    assert old in text, old[:100]
    return text.replace(old, new, 1)

# ------------------------------------------------------------------ tracks.js: record the audit
SCORES = json.loads('[["1604623517",0.57,0.73,90],["1422950131",0.57,0.78,100],["871784557",0.56,0.67,111],["724391093",0.47,0.61,108],["1478946359",0.52,0.73,102],["1444044414",0.51,0.69,103],["380906006",0.39,0.59,191],["1442938679",0.47,0.62,146],["1454134655",0.43,0.71,106],["1561221310",0.34,0.62,105],["1678850878",0.24,0.56,161],["1561221307",0.23,0.6,115],["200942406",0.42,0.67,190],["1517444929",0.24,0.56,176],["1551605863",0.25,0.55,153],["1053944740",0.24,0.63,158],["78495612",0.25,0.55,168],["1069838643",0.2,0.58,137],["1504583013",0.61,0.73,115],["1443159692",0.63,0.79,92],["584342983",0.28,0.58,85],["708682970",0.31,0.58,146],["1876721013",0.63,0.81,148],["1726653722",0.33,0.7,135],["574487127",0.49,0.58,125],["984610792",0.42,0.63,141],["1712766806",0.37,0.66,75],["1257259293",0.31,0.56,190],["1440833176",0.37,0.61,77],["1440890801",0.21,0.58,121],["1523668579",0.26,0.57,176],["6777980396",0.35,0.66,85],["1890291319",0.24,0.57,140]]')
by = {s[0]: s for s in SCORES}
p = root / 'tracks.js'
tracks = json.loads(p.read_text().split('=', 1)[1].rstrip().rstrip(';'))
kept = []
for t in tracks:
    s = by.get(str(t.get('itunesId')))
    if s:
        t['match'] = {'s4': s[1], 's1': s[2], 'bpm': s[3]}
        t['shows'] = s[1] >= 0.45
        if t['shows']: kept.append(t['artist'] + ' - ' + t['title'])
p.write_text('window.AMEN_TRACKS = ' + json.dumps(tracks, ensure_ascii=False, indent=1) + ';\n')
print(len(kept), 'clips show the pattern:', *kept, sep='\n  ')

# ------------------------------------------------------------------ HTML
h = (root / 'index.html').read_text()
h = sub(h, 'data-tracks="Straight Outta Compton|D\'You Know|Little Wonder" data-subs="The 1988 hip-hop landmark|Britpop, from Be Here Now|a rock legend&rsquo;s 1997 single"',
           'data-tracks="Futurama|Straight Outta Compton|The Game Compton" data-subs="The cartoon&rsquo;s theme song|The 1988 hip-hop landmark|West Coast rap, 2006"')
h = sub(h, 'data-tracks="Demon|The Crane|Come on My Selector"', 'data-tracks="Demon"')
h = sub(h, '        <ul class="tracks" data-tracks="Slip Inside|Poison"></ul>\n        <p class="listen"><b>Listen for</b> that tumbling snare pattern in songs that aren&rsquo;t dance music.</p>',
           '        <p class="small">Most of these hide the break under guitars and vocals, so there&rsquo;s no clean clip to play. The next chapters have ones you can hear.</p>')
h = sub(h, 'data-tracks="Aaron 2|steal the amen|Up the Box"', 'data-tracks="steal the amen|Up the Box"')
h = sub(h, '        <ul class="tracks" data-tracks="Ether|Geddup|The Real"></ul>\n', '        <p class="small">Modern bass producers chop it so finely that a 30-second clip rarely shows the pattern, so there&rsquo;s nothing to play here. The echoes chart below lists the ones that use it.</p>\n')
h = sub(h, 'The drums you hear on this page are rebuilt in your browser from published transcriptions. They are not the 1969 recording, and the groove&rsquo;s human timing is simplified. The 30-second Apple preview is the real track and may not reach the break.',
           'The drums you hear on this page are rebuilt in your browser from published transcriptions. They are not the 1969 recording, and the groove&rsquo;s human timing is simplified. The 30-second Apple preview is the real track and may not reach the break. When a clip plays, the record looks for the break&rsquo;s pattern in its drums and lights it up in time.')
h = sub(h, 'I kept tracks that have a working 30-second preview so every dot is playable, which leaves out many obscure samples.', 'Every listed track is documented as using the break, but only tracks whose 30-second clip clearly shows its drum pattern have a play button; in the others it is chopped up, buried, or later in the song.')
h = re.sub(r'\?v=\d+"', '?v=40"', h)
(root / 'index.html').write_text(h)

# ------------------------------------------------------------------ CSS
c = (root / 'style.css').read_text()
c += '''
.nopv { font: 500 11.5px var(--mono); color: #8b8a96; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; }
.tile-nopv { margin: 6px 0 0; font: 500 12.5px/1.45 var(--mono); color: inherit; opacity: .8; } .tile-nopv a { display: inline-flex; align-items: center; min-height: 44px; margin-right: 12px; color: inherit; text-underline-offset: 3px; }
'''
(root / 'style.css').write_text(c)

# ------------------------------------------------------------------ app.js
a = (root / 'app.js').read_text()
a = sub(a, "const AUTO = { heard: 'Little Wonder', djs: 'Bust That Groove', escape: 'Straight Outta Compton', jungle: 'Demon', mainstream: 'Slip Inside', digital: 'Aaron 2', today: 'The Real' };",
           "const AUTO = { heard: 'Futurama', djs: 'Bust That Groove', escape: 'Straight Outta Compton', jungle: 'Demon', digital: 'steal the amen' };")
a = sub(a, "const t = findTrack(k); return t ? { t, sub: subs[i] } : null; })", "const t = findTrack(k); return t && t.shows !== false ? { t, sub: subs[i] } : null; })")
a = sub(a, "const PRIME_IDS = [...new Set(TRACKS.map((t) => t.itunesId).concat([427200416, 1442919795]))];", "const PRIME_IDS = [...new Set(TRACKS.filter((t) => t.shows !== false).map((t) => t.itunesId).concat([427200416, 1442919795]))];")
i = a.index("  // \"Wait, that has it?\" tiles")
j = a.index("  document.addEventListener('click', (e) => {\n    const b = e.target.closest('[data-preview]'); if (!b) return;")
tiles = r'''  // "Wait, that has it?" tiles: every claim below is from Wikipedia or MusicBrainz. Only clips that really show the pattern get a play button.
  const TILES = [
    { key: 'futurama', tag: 'A cartoon', hero: true, line: 'The opening theme of Futurama is built on it. A later remix of the theme swapped the break for newly recorded drums.' },
    { key: 'steal the amen', tag: 'Game-music composer', line: 'C418, who scored Minecraft, titled this track “If you don’t know what to do just steal the amen break.”' },
    { key: 'up the box', tag: 'Experimental electronic', line: 'A flanged Amen break runs through “Up the Box” on Andy Stott’s 2012 album Luxury Problems.' },
    { key: 'crystalline', tag: 'Art-pop', line: 'Björk’s song ends in a drum & bass section that uses the break.' },
    { key: 'jackie (b', tag: 'R&B', line: 'Yes, even here. The track samples “Amen, Brother.”' },
    { key: 'untitled 05', tag: 'Rap', line: 'A downtempo, jazz-flavored Kendrick Lamar track with the break underneath.' },
    { key: 'no money', tag: 'Radio dance hit', line: 'A big Galantis hit. The break lands most clearly at 1:44, past the end of the 30-second preview.' },
    { key: 'second 2 none', tag: 'Indie electronic', line: 'Mura Masa and Christine and the Queens sample it.' },
    { key: 'digital circuit', tag: 'Game composer', line: 'From the composer best known for the Sonic the Hedgehog games. MusicBrainz lists it as sampling the break.' },
  ];
  $('#tiles').innerHTML = TILES.map((d) => {
    const t = findTrack(d.key); if (!t) return '';
    const play = t.itunesId && t.shows !== false;
    return '<li class="tile' + (d.hero ? ' tile--hero' : '') + '"><div class="tile-top"><span class="tile-tag">' + esc(d.tag) + '</span><span class="tile-eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="tile-year" aria-label="' + t.year + '">' + t.year + '</span></div>' +
      '<h3>' + esc(t.title.replace(/ Original Series Theme \(TV version\)/, ' theme')) + '</h3><p class="tile-by">' + esc(t.artist) + '</p><p class="tile-line">' + esc(d.line) + '</p>' +
      (play ? '<button class="btn btn--sm" data-preview="' + t.itunesId + '" aria-label="Play 30-second preview of ' + esc(t.title) + ' by ' + esc(t.artist) + '"><span class="play-ico"></span><span class="pv-label">Listen</span></button>'
        : '<p class="tile-nopv">No preview: the break isn’t clear in the first 30 seconds.<br><a target="_blank" rel="noopener" href="' + apple(t) + '">Apple Music &nearr;</a><a target="_blank" rel="noopener" href="' + youtube(t) + '">YouTube &nearr;</a></p>') + '</li>';
  }).join('');
'''
a = a[:i] + tiles + a[j:]
a = sub(a, """'<button class="btn btn--sm" data-preview="' + t.itunesId + '" aria-label="Preview ' + esc(t.title) + '"><span class="play-ico"></span><span class="pv-label">30s</span></button>' +""",
           """(t.shows !== false ? '<button class="btn btn--sm" data-preview="' + t.itunesId + '" aria-label="Preview ' + esc(t.title) + '"><span class="play-ico"></span><span class="pv-label">30s</span></button>' : '<span class="nopv" title="The break isn\\u2019t clear in the 30-second clip">no clip</span>') +""")
a = sub(a, "let k = tour.i; while (k < rows.length && rows[k].hidden) k++;", "let k = tour.i; while (k < rows.length && (rows[k].hidden || order[k].shows === false)) k++;")
a = sub(a, "if (fx[i].b === 0) dotPulse = 1;", "if (fx[i].voice === 'kick') dotPulse = 1;")
(root / 'app.js').write_text(a)
print('app ok')
