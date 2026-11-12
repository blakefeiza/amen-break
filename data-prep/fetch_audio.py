"""Download each track's 30-second Apple preview into audio/<id>.mp3 so the page can serve it from its own origin."""
import json, pathlib, subprocess, urllib.request
root = pathlib.Path(__file__).resolve().parent.parent
tracks = json.loads((root / 'tracks.js').read_text().split('=', 1)[1].rstrip().rstrip(';'))
ids = sorted({str(t['itunesId']) for t in tracks if t.get('itunesId')} | {'427200416', '1442919795'})
urls = {}
for country in ('us', 'gb'):
    miss = [i for i in ids if i not in urls]
    if not miss: break
    j = json.load(urllib.request.urlopen('https://itunes.apple.com/lookup?id=' + ','.join(miss) + '&country=' + country))
    for x in j['results']:
        if x.get('previewUrl'): urls[str(x['trackId'])] = x['previewUrl']
(root / 'audio').mkdir(exist_ok=True)
ok = []
for i, u in urls.items():
    d = urllib.request.urlopen(u).read(); src = root / 'audio' / (i + '.m4a'); src.write_bytes(d)
    # MP3, because some embedded browsers (Tableau's included) can't decode AAC
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(src), '-vn', '-ac', '2', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '128k', str(src.with_suffix('.mp3'))], check=True); src.unlink(); ok.append(int(i))
(root / 'audio.js').write_text('window.AMEN_AUDIO = ' + json.dumps(sorted(ok)) + ';\n')
print(len(ok), 'of', len(ids), 'saved; missing:', [i for i in ids if i not in urls])
