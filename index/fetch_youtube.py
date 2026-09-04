"""Step 2 of the index build: YouTube title, description and duration for every Works item
with a video URL. yt-dlp -J with --js-runtimes node, no subtitles, a randomised sleep between
calls, cached per video id so the run is resumable."""
import random
import re
import subprocess
import sys
import time

from common import *

works = load("works")
YT = os.path.join(RAW, "yt")
os.makedirs(YT, exist_ok=True)


def vid(url):
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})", url or "")
    return m.group(1) if m else None


KEEP = ["id", "title", "description", "duration", "upload_date", "channel", "channel_id", "uploader",
        "view_count", "like_count", "language", "tags", "categories", "availability"]
index = {}
fetched = failed = skipped = 0
for n, w in enumerate(works, 1):
    fd = w["fieldData"]
    url = fd.get("video-url-youtube") or (fd.get("video-embed-url") or {}).get("url")
    v = vid(url)
    if not v:
        index[w["id"]] = {"video_id": None, "url": url, "reason": "no youtube url"}
        skipped += 1
        continue
    path = os.path.join(YT, v + ".json")
    if not os.path.exists(path):
        r = subprocess.run([sys.executable, "-m", "yt_dlp", "-J", "--js-runtimes", "node", "--no-warnings",
                            "--no-playlist", "https://www.youtube.com/watch?v=" + v],
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0 or not r.stdout.strip():
            err = (r.stderr or "").strip().splitlines()
            index[w["id"]] = {"video_id": v, "url": url, "reason": "yt-dlp failed: " + (err[-1][:200] if err else "no output")}
            failed += 1
            print(f"{n:3d} FAIL {fd.get('slug')} {v}: {index[w['id']]['reason']}", flush=True)
            time.sleep(random.uniform(4, 7))
            continue
        j = json.loads(r.stdout)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({k: j.get(k) for k in KEEP}, f, ensure_ascii=False, indent=1)
        fetched += 1
        print(f"{n:3d} ok   {fd.get('slug')} {v}", flush=True)
        time.sleep(random.uniform(4, 7))
    index[w["id"]] = {"video_id": v, "url": url, "reason": None}
save("yt_index", index)
ok = sum(1 for x in index.values() if x["reason"] is None)
print(f"\ndone: {ok} of {len(index)} items have YouTube metadata | fetched now {fetched} | failed {failed} | no url {skipped}")
