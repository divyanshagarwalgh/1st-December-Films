"""Step 6 of the index build: ten random rows beside their sources, for the owner to check
that nothing was invented. Writes docs/index-review-<date>.md."""
import datetime
import random
import re
import sys

from common import *

works = {w["id"]: w for w in load("works")}
rows = json.load(open(os.path.join(REPO, "data", "works-index.json"), encoding="utf-8"))
yt = load("yt_index")
seed = sys.argv[1] if len(sys.argv) > 1 else datetime.date.today().isoformat()
random.seed(seed)
sample = random.sample([r for r in rows if r["is_published"]], 10)


def strip_html(s):
    return re.sub(r"[ \t]+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def yt_for(wid):
    v = (yt.get(wid) or {}).get("video_id")
    p = os.path.join(RAW, "yt", v + ".json") if v else None
    if p and os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    return None


out = [f"# Index review sample ({seed})", "",
       "Ten random published rows. Left: what went into D1. Right: the sources it came from. Check that nothing on the left is absent from the right.", ""]
for r in sample:
    w = works[r["id"]]
    fd = w["fieldData"]
    y = yt_for(r["id"])
    out += [f"## {r['client']}: {r['campaign']} ({(r['year'] or '')[:4]})", "",
            f"Slug `{r['slug']}`, confidence **{r['confidence']}**, case study: {'yes' if r['has_case_study'] else 'no'}, YouTube: {'yes' if y else 'no'}", "",
            "### Indexed record", "",
            f"- format: {r['format']} | duration: {r['duration_seconds']} s | language: {r['language']}",
            f"- industry: {', '.join(r['industry'])} | brief type: {r['brief_type']} | complexity: {r['complexity']}",
            f"- device: {r['narrative_device']}",
            f"- tone: {', '.join(r['tone'])} | flags: {', '.join(r['flags'])} | celebrity: {r['celebrity']}",
            f"- director: {r['director']} (slug {r['director_slug']}) | awards: {', '.join(r['awards']) or 'none'}",
            f"- outcome: {r['outcome']}", "",
            f"> {r['reference_for']}", "",
            "### Sources", "",
            f"- CMS: client {fd.get('client')}, campaign {fd.get('campaign-name')}, agency {fd.get('agency')}, duration {fd.get('video-duration')}",
            f"- CMS meta description: {fd.get('meta-description')}",
            f"- CMS summary: {strip_html(fd.get('project-summary'))[:300] or 'empty'}",
            f"- CMS impact: {strip_html(fd.get('impact'))[:300] or 'empty'}",
            f"- CMS project details: {strip_html(fd.get('project-details'))[:300] or 'empty'}",
            f"- CMS full credits: {strip_html(fd.get('full-credits'))[:300] or 'empty'}"]
    if y:
        out += [f"- YouTube title: {y.get('title')}", f"- YouTube description (first 700 chars): {(y.get('description') or '')[:700].replace(chr(10), ' / ')}"]
    body = strip_html(fd.get("content-body-rich-text"))
    if body:
        out += [f"- Case study (first 500 chars): {body[:500]}"]
    out += [f"- Video: {r['video_url']}", ""]
path = os.path.join(REPO, "docs", f"index-review-{seed}.md")
with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(out))
print("wrote", path)
