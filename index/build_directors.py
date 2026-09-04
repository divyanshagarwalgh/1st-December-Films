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
by_name = {d["fieldData"]["name"].lower(): i for i, d in dirs.items()}  # all 12, for title matching


def strip_html(s):
    return re.sub(r"[ \t]+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def yt_title(w):
    v = (yt.get(w["id"]) or {}).get("video_id")
    p = os.path.join(RAW, "yt", v + ".json") if v else None
    if p and os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f).get("title") or ""
    return ""


def director_from_title(title):
    """'Brand | Director | EP | First December Films' -> director item id, or None."""
    parts = [p.strip() for p in title.split("|")]
    if len(parts) < 3 or "first december" not in title.lower():
        return None
    for p in parts[1:-1]:
        key = p.lower().replace(" and ", " & ")
        if key in by_name:
            return by_name[key]
        for name, i in by_name.items():
            if name in key or key in name:
                return i
    return None


def resolve_director(w):
    """Returns (director_name, director_item_id). YouTube title wins over the CMS reference."""
    fd = w["fieldData"]
    from_title = director_from_title(yt_title(w))
    cms = (fd.get("directors") or [None])[0]
    chosen = from_title or cms
    if not chosen or chosen not in dirs:
        return None, None
    return dirs[chosen]["fieldData"]["name"], chosen


def main():
    out_recs = {f[:-5]: json.load(open(os.path.join(OUT, f), encoding="utf-8")) for f in os.listdir(OUT) if f.endswith(".json") and not f.startswith("_")}
    credits = {i: [] for i in live_dirs}
    conflicts = []
    for w in works:
        if not live(w):
            continue
        name, did = resolve_director(w)
        fd = w["fieldData"]
        cms = (fd.get("directors") or [None])[0]
        if did and cms and did != cms:
            conflicts.append((fd["slug"], dirs[cms]["fieldData"]["name"], name))
        if did in credits:
            credits[did].append({"work_id": w["id"], "slug": fd["slug"], "client": fd.get("client"), "campaign": fd.get("campaign-name"), "year": (fd.get("year") or "")[:4]})
    client = anthropic.Anthropic(api_key=secret("anthropic-key-1st-december-films.txt"))
    rows = []
    for did, d in live_dirs.items():
        fd = d["fieldData"]
        cr = sorted(credits[did], key=lambda c: c["year"], reverse=True)
        paras = [out_recs[c["work_id"]]["reference_for"] for c in cr if c["work_id"] in out_recs]
        strengths = None
        if paras:
            msg = client.messages.create(
                model=MODEL, max_tokens=600,
                system="You write one paragraph, 50 to 80 words, British spelling, no em dashes, no en dashes, no film titles, no client names, no superlatives, describing what kinds of scripts this ad film director is a strong fit for, based only on the reference paragraphs for their films. Plain, specific, producer's voice.",
                messages=[{"role": "user", "content": f"Director: {fd['name']}\nBio (CMS): {strip_html(fd.get('short-bio') or fd.get('full-bio') or '')[:1500]}\n\nReference paragraphs for their films:\n\n" + "\n\n".join(paras[:25])}],
            )
            strengths = "".join(b.text for b in msg.content if b.type == "text").strip()
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
