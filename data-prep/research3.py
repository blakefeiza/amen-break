import json, re, time, urllib.request, urllib.parse
UA = {'User-Agent': 'amen-break-explorer/0.1'}
def get(u):
    for _ in range(4):
        try: return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=25))
        except Exception as e:
            time.sleep(10)
    return {}
def search(q, n=6):
    d = get('https://en.wikipedia.org/w/api.php?' + urllib.parse.urlencode({'action': 'query', 'list': 'search', 'srsearch': q, 'srlimit': n, 'format': 'json'}))
    time.sleep(2.5)
    return [(h['title'], re.sub('<[^>]+>', '', h['snippet']).replace('&quot;', '"').replace('&#039;', "'")[:170]) for h in d.get('query', {}).get('search', [])]
for q in ['Powerpuff Girls theme "Amen break"', '"You Know I\'m No Good" "Amen break"', '"The Perfect Drug" Nine Inch Nails "Amen break"', 'Lupe Fiasco "Streets on Fire" "Amen break"', '"Amen break" Eurovision 2024', '"Amen break" commercial advertisement', '"Amen break" video game soundtrack', '"Amen break" Tyler, the Creator', '"Amen break" 2023 OR 2024 OR 2025 single', '"Amen break" Skrillex OR "Kill the Noise" OR Eprom', '"amen break" Slipknot "(sic)" track', '"Amen break" Amy Winehouse']:
    print('##', q)
    for t, s in search(q): print('  ', t, '|', s)
