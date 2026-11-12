"""Build tracks.js for the Amen break app.

Pool   : MusicBrainz 'samples material' relations of the 1969 recording (CC0) in mb_sampled_by.json,
         plus tracks whose Wikipedia articles state they use the Amen break (WIKI below).
Filter : only tracks with a working 30-second Apple preview (iTunes Search API) are kept, except the
         handful in KEEP_NO_PREVIEW that the story depends on.
"""
import json, re, sys, time, unicodedata, urllib.request, urllib.parse

BUCKETS = [
    ("hiphop", ["stetsasonic", "salt", "n.w.a", "3rd bass", "rob base", "mantronix", "clipping", "kendrick", "the game"]),
    ("jungle", ["ltj bukem", "source direct", "l double", "tango", "top cat", "dem 2", "prodigy"]),
    ("screen", ["christopher tyng", "hideki naganuma", "jun senoue"]),
    ("pop",    ["oasis", "bran van", "mura masa", "内田有紀", "руки вверх", "amalee", "bowie", "primal scream", "björk", "bjork", "ciara"]),
    ("bass",   ["joyride", "zeds dead", "g jones", "smeedge", "djkirara", "duuzu", "gnb chili", "jane remover", "known to be lethal", "galantis", "system f"]),
]
def bucket(artist):
    a = artist.lower()
    for key, needles in BUCKETS:
        if any(n in a for n in needles):
            return key
    return "idm"

# (title, artist, year, wikipedia article that states the sample)
WIKI = [
    ("King of the Beats", "Mantronix", 1988, "Mantronix"),
    ("Keep It Going Now", "Rob Base & DJ E-Z Rock", 1988, "Amen break"),
    ("D'You Know What I Mean?", "Oasis", 1997, "Be Here Now (album)"),
    ("Slip Inside This House", "Primal Scream", 1991, "Screamadelica"),
    ("Little Wonder", "David Bowie", 1997, "Little Wonder (David Bowie song)"),
    ("Compton", "The Game", 2006, "Doctor's Advocate"),
    ("Crystalline", "Björk", 2011, "Crystalline (song)"),
    ("Up the Box", "Andy Stott", 2012, "Luxury Problems (Andy Stott album)"),
    ("No Money", "Galantis", 2016, "No Money (song)"),
    ("Jackie (B.M.F)", "Ciara", 2015, "Jackie (Ciara album)"),
    ("untitled 05 | 09.21.2014.", "Kendrick Lamar", 2016, "Untitled Unmastered"),
]
# extra search terms / accepted titles when the plain "artist title" search misses
OVERRIDES = {
    "I Desire": dict(term="Salt-N-Pepa Hot, Cool & Vicious I Desire", accept="idesire"),
    "King of the Beats": dict(term="Mantronix In Full Effect King of the Beats", accept="kingofthebeats", reject="lesson"),
    "Futurama Original Series Theme (TV version)": dict(term="Christopher Tyng Futurama Main Theme", accept="futuramamaintheme", note="Extended version"),
    "Bomber Barbara": dict(term="Hideki Naganuma Bomber Barbara Jet Set Radio Future", accept="bomberbarbara"),
    "Poison": dict(term="The Prodigy Poison", accept="poison", reject="rat"),
}
KEEP_NO_PREVIEW = set()   # filled after review

def norm(s):
    return re.sub(r"[^\w]+", "", unicodedata.normalize("NFKD", s).lower())
def search(term, country="us"):
    u = "https://itunes.apple.com/search?" + urllib.parse.urlencode({"term": term, "entity": "song", "limit": 12, "country": country})
    for _ in range(3):
        try:
            return json.load(urllib.request.urlopen(u, timeout=20))["results"]
        except Exception as e:
            time.sleep(8)
    return []

raw = json.load(open("mb_sampled_by.json"))
seen, tracks = set(), []
for r in sorted(raw, key=lambda x: (x["year"] if x["year"].isdigit() else "9999", x["title"])):
    if not r["year"].isdigit() or any(d in r["title"].lower() for d in ["original karaoke mix", "(part 2)"]):
        continue
    key = re.sub(r"\W+", "", r["title"].lower())
    if key in seen: continue
    seen.add(key)
    tracks.append(dict(id=r["id"], title=r["title"], artist=r["artist"], year=int(r["year"]), bucket=bucket(r["artist"]), source="musicbrainz", mbid=r["id"]))
for t, a, y, art in WIKI:
    tracks.append(dict(id="wp-" + re.sub(r"\W+", "", t.lower()), title=t, artist=a, year=y, bucket=bucket(a), source="wikipedia", wiki=art))
tracks.sort(key=lambda x: (x["year"], x["title"]))

def pick(results, accept_title, accept_artist, reject=None, year=None):
    best = None
    for r in results:
        if not r.get("previewUrl"): continue
        nr = norm(r["trackName"])
        if not nr.startswith(accept_title[:14]) or (reject and reject in nr): continue
        if accept_artist and accept_artist[:6] not in norm(r["artistName"]): continue
        d = abs(int(r["releaseDate"][:4]) - year) if year else 0
        if best is None or d < best[0]: best = (d, r)
    return best[1] if best else None

for t in tracks:
    first = norm(t["artist"].split()[0].split("&")[0])
    ov = OVERRIDES.get(t["title"])
    hit = None
    for term, country in [(t["artist"] + " " + t["title"], "us")] + ([(ov["term"], "us")] if ov else []):
        res = search(term, country)
        hit = pick(res, ov["accept"] if ov else norm(t["title"]), first, ov.get("reject") if ov else "lesson", t["year"])
        time.sleep(3.1)
        if hit: break
    if not hit and re.search(r"[^\x00-\x7f]", t["artist"] + t["title"]):   # non-Latin titles: try other storefronts
        for c in ("jp", "ru", "gb"):
            hit = pick(search(t["title"], c), norm(t["title"]), None, None, t["year"]); time.sleep(3.1)
            if hit: break
    if hit:
        t["itunesId"] = hit["trackId"]
        if ov and ov.get("note"): t["previewNote"] = ov["note"]
        print("OK  ", t["year"], t["artist"], "-", t["title"], "=>", hit["artistName"], "-", hit["trackName"], hit["releaseDate"][:4])
    else:
        print("none", t["year"], t["artist"], "-", t["title"])

final = [t for t in tracks if t.get("itunesId") or t["title"] in KEEP_NO_PREVIEW]
open("../tracks.js", "w").write("window.AMEN_TRACKS = " + json.dumps(final, ensure_ascii=False, indent=1) + ";\n")
print(len(final), "of", len(tracks), "tracks written")
