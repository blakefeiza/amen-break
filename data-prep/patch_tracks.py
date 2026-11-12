"""Second pass over tracks.js after build_tracks.py: drop wrong preview matches, add hand-verified ones."""
import json, re
p = "../tracks.js"
tracks = json.loads(open(p).read().split("=", 1)[1].rstrip().rstrip(";"))
DROP = {"Only You", "Takedown (from “KPop Demon Hunters”)"}          # iTunes matched a different artist / a lofi cover
tracks = [t for t in tracks if t["title"] not in DROP and not t["title"].startswith("Takedown")]
for t in tracks:
    t.pop("previewNote", None)                                                  # Futurama match is the TV version, as listed
tracks += [
    dict(id="wp-kingofthebeats", title="King of the Beats", artist="Mantronix", year=1988, bucket="hiphop", source="wikipedia", wiki="Mantronix", itunesId=724391093, itunesCountry="gb"),
    dict(id="wp-untitled05", title="untitled 05 | 09.21.2014.", artist="Kendrick Lamar", year=2016, bucket="hiphop", source="wikipedia", wiki="Untitled Unmastered", itunesId=1440833176),
]
tracks.sort(key=lambda x: (x["year"], x["title"]))
open(p, "w").write("window.AMEN_TRACKS = " + json.dumps(tracks, ensure_ascii=False, indent=1) + ";\n")
from collections import Counter
print(len(tracks), Counter(t["bucket"] for t in tracks))
