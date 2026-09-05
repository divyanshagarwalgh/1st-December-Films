"""Step 4 of the index build: the directors table, live directors only.

credits: every Works item whose CMS directors reference names them OR whose FDF YouTube title
names them (pattern "Brand | Director | EP | First December Films"). strengths: one short
Claude summary per director drawn from the reference_for paragraphs of their films."""
import re
import sys

import anthropic

from common import *

works = load("works")
dirs = load("directors")
yt = load("yt_index")
MODEL = "claude-opus-5"

live_dirs = {i: d for i, d in dirs.items() if live(d)}
slug_to_id = {d["fieldData"]["slug"]: i for i, d in dirs.items()}
# Films Divyansh has confirmed as co-directed: every listed director gets the credit; the row's
# director text names both and director_slug takes the first.
CO_DIRECTED = {"malaysia-airlines": ["ronak-chugh", "atul-kattukaran"]}
by_name = {d["fieldData"]["name"].lower(): i for i, d in dirs.items()}  # all 12, for title matching


def strip_html(s):
    return re.sub(r"[ \t]+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def yt_meta(w):
    v = (yt.get(w["id"]) or {}).get("video_id")
    p = os.path.join(RAW, "yt", v + ".json") if v else None
    if p and os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            j = json.load(f)
            return j.get("title") or "", j.get("channel") or ""
    return "", ""


def director_from_title(title, channel=""):
    """FDF upload titles carry the director: 'Brand | Director | EP | First December Films' or
    'Brand : Film | Director | EP'. Any pipe-separated segment naming a director wins."""
    if "|" not in title:
        return None
    if "first december" not in title.lower() and "1stdecember" not in channel.lower().replace(" ", ""):
        return None
    for p in [p.strip() for p in title.split("|")]:
        key = p.lower().replace(" and ", " & ")
        if key in by_name:
            return by_name[key]
        for name, i in by_name.items():
            if len(key) > 3 and (name in key or key in name):
                return i
    return None


def resolve_directors(w):
    """Returns a list of director item ids for a work: the confirmed co-direction list, else the
    YouTube-title director, else the CMS reference."""
    fd = w["fieldData"]
    if fd["slug"] in CO_DIRECTED:
        return [slug_to_id[s] for s in CO_DIRECTED[fd["slug"]] if s in slug_to_id]
    from_title = director_from_title(*yt_meta(w))
    cms = (fd.get("directors") or [None])[0]
    chosen = from_title or cms
    return [chosen] if chosen and chosen in dirs else []


def resolve_director(w):
    """Returns (director_name, director_item_id). Co-directed films name both, slug of the first."""
    ids = resolve_directors(w)
    if not ids:
        return None, None
    return " and ".join(dirs[i]["fieldData"]["name"] for i in ids), ids[0]


def main():
    out_recs = {f[:-5]: json.load(open(os.path.join(OUT, f), encoding="utf-8")) for f in os.listdir(OUT) if f.endswith(".json") and not f.startswith("_")}
    credits = {i: [] for i in live_dirs}
    conflicts = []
    for w in works:
        if not live(w):
            continue
        ids = resolve_directors(w)
        fd = w["fieldData"]
        cms = (fd.get("directors") or [None])[0]
        if ids and cms and cms not in ids:
            conflicts.append((fd["slug"], dirs[cms]["fieldData"]["name"], " and ".join(dirs[i]["fieldData"]["name"] for i in ids)))
        for did in ids:
            if did in credits:
                credits[did].append({"work_id": w["id"], "slug": fd["slug"], "client": fd.get("client"), "campaign": fd.get("campaign-name"), "year": (fd.get("year") or "")[:4]})
    client = anthropic.Anthropic(api_key=secret("anthropic-key-1st-december-films.txt"))
    previous = {}
    if "--refresh" not in sys.argv and os.path.exists(os.path.join(OUT, "_directors.json")):
        previous = {d["slug"]: d.get("strengths") for d in load("_directors", OUT)}
    rows = []
    for did, d in live_dirs.items():
        fd = d["fieldData"]
        cr = sorted(credits[did], key=lambda c: c["year"], reverse=True)
        paras = [out_recs[c["work_id"]]["reference_for"] for c in cr if c["work_id"] in out_recs]
        strengths = previous.get(fd["slug"])
        if paras and not strengths:
            msg = client.messages.create(
                model=MODEL, max_tokens=2500, output_config={"effort": "low"},
                system="You write one paragraph, 50 to 80 words, British spelling, no em dashes, no en dashes, no film titles, no client names, no superlatives, describing what kinds of scripts this ad film director is a strong fit for, based only on the reference paragraphs for their films. Plain, specific, producer's voice.",
                messages=[{"role": "user", "content": f"Director: {fd['name']}\nBio (CMS): {strip_html(fd.get('short-bio') or fd.get('full-bio') or '')[:1500]}\n\nReference paragraphs for their films:\n\n" + "\n\n".join(paras[:25])}],
            )
            strengths = "".join(b.text for b in msg.content if b.type == "text").strip()
            if not strengths:
                print("  no text for", fd["name"], msg.stop_reason, flush=True)
        rows.append({
            "slug": fd["slug"], "name": fd["name"],
            "bio": strip_html(fd.get("full-bio") or fd.get("short-bio") or "")[:2000] or None,
            "credits": cr, "strengths": strengths, "film_count": len(cr),
        })
        print(f"{fd['name']:22s} {len(cr):3d} films | strengths {'ok' if strengths else 'none'}", flush=True)
    save("_directors", rows, OUT)
    save("_director_conflicts", conflicts, OUT)
    print(f"\n{len(rows)} live directors written; {len(conflicts)} CMS vs YouTube-title conflicts logged")


if __name__ == "__main__":
    main()
