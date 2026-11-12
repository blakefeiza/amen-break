import json, time, urllib.request, urllib.parse, re
UA = {'User-Agent': 'amen-break-explorer/0.1'}
def get(u):
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25))

# 1) every Winstons "Amen, Brother" recording in MusicBrainz and its sampled-by relations
q = urllib.parse.quote('recording:"Amen Brother" AND artist:"The Winstons"')
d = get('https://musicbrainz.org/ws/2/recording/?query=%s&fmt=json&limit=100' % q)
recs = [r for r in d['recordings'] if 'winstons' in ''.join(a['name'] for a in r['artist-credit'] if isinstance(a, dict)).lower()]
print(len(recs), 'winstons recordings')
extra = {}
for r in recs:
    time.sleep(1.1)
    j = get('https://musicbrainz.org/ws/2/recording/%s?inc=recording-rels&fmt=json' % r['id'])
    rels = [x for x in j.get('relations', []) if x['type'] == 'samples material' and x['direction'] == 'backward']
    print(r['id'], r['title'], r.get('first-release-date'), len(rels))
    for x in rels:
        rc = x['recording']; extra[rc['id']] = {'id': rc['id'], 'title': rc['title'], 'artist': ''.join(a['name'] + a.get('joinphrase', '') for a in rc.get('artist-credit', []))}
json.dump(list(extra.values()), open('mb_extra.json', 'w'), indent=1)
print(len(extra), 'unique sampled-by across all winstons recordings')

# 2) Wikipedia articles that mention the Amen break
for term in ['"Amen break"', '"Amen, Brother" sample']:
    s = get('https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'list': 'search', 'srsearch': term, 'srlimit': 60, 'format': 'json'}))
    print('---', term)
    for h in s['query']['search']:
        print(h['title'], '|', re.sub('<[^>]+>', '', h['snippet'])[:110])
