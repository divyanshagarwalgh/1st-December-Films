"""Step 3 of the index build: one Claude extraction call per Works item.
Resumable: skips items that already have out/<id>.json. Structured output via messages.parse."""
import hashlib
import re
import sys
import time
from typing import Literal, Optional

import anthropic
from pydantic import BaseModel

from common import *

SYSTEM = open(os.path.join(ROOT, "prompts", "extract_system.txt"), encoding="utf-8").read()
MODEL = "claude-opus-5"
client = anthropic.Anthropic(api_key=secret("anthropic-key-1st-december-films.txt"))

works = load("works")
yt = load("yt_index")
dirs = load("directors")
awards = load("awards")
inds = load("industries")


class Extract(BaseModel):
    format: Literal["TVC", "digital film", "anthem", "series", "brand film", "case study film", "short", "other"]
    language: Optional[str]
    industry: list[str]
    brief_type: Optional[Literal["launch", "festive", "cause", "product demo", "brand film", "performance", "recruitment", "other"]]
    narrative_device: Optional[str]
    tone: list[str]
    celebrity: Optional[str]
    complexity: Literal["contained", "standard", "complex"]
    flags: list[Literal["vfx", "kids", "animals", "stunts", "crowd", "night", "multi_location", "water", "period", "music_led", "sport", "food", "vehicle", "animation"]]
    outcome: Optional[str]
    reference_for: str
    confidence: Literal["high", "medium", "low"]
    confidence_reason: str


def names(ids, table):
    return [table[i]["fieldData"]["name"] for i in (ids or []) if i in table]


def strip_html(s):
    s = re.sub(r"<br\s*/?>|</p>|</li>|</h\d>", "\n", s or "")
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&#39;", "'").replace("&quot;", '"')
    return re.sub(r"[ \t]+", " ", s).strip()


def yt_for(w):
    v = (yt.get(w["id"]) or {}).get("video_id")
    p = os.path.join(RAW, "yt", v + ".json") if v else None
    if p and os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return None


def sources_for(w):
    fd = w["fieldData"]
    y = yt_for(w)
    summary = strip_html(fd.get("project-summary"))
    if re.match(r"^Directors?\s*:", summary) or len(summary) < 60:
        summary = ""  # director credits and stubs are not description text
    parts = [
        f"CLIENT: {fd.get('client')}",
        f"CAMPAIGN: {fd.get('campaign-name')}",
        f"YEAR (CMS date, often the upload date): {(fd.get('year') or '')[:10]}",
        f"AGENCY (CMS): {fd.get('agency') or ''}",
        f"DIRECTORS (CMS reference): {', '.join(names(fd.get('directors'), dirs))}",
        f"INDUSTRIES (CMS): {', '.join(names(fd.get('industries'), inds))}",
        f"AWARDS (CMS reference, verified list): {', '.join(names(fd.get('awards'), awards))}",
        f"DURATION (CMS): {fd.get('video-duration') or ''}",
        f"META TITLE (CMS): {fd.get('meta-title') or ''}",
        f"META DESCRIPTION (CMS): {fd.get('meta-description') or ''}",
    ]
    if summary:
        parts.append(f"CMS SUMMARY (marketing copy, unverified): {summary}")
    impact = strip_html(fd.get("impact"))
    if impact:
        parts.append(f"CMS IMPACT (marketing copy, unverified unless it states a number or award): {impact[:1500]}")
    details = strip_html(fd.get("project-details"))
    if details:
        parts.append(f"CMS PROJECT DETAILS: {details[:1500]}")
    credits = strip_html(fd.get("full-credits"))
    if credits:
        parts.append(f"CMS FULL CREDITS:\n{credits[:3000]}")
    if y:
        parts += [
            f"YOUTUBE TITLE: {y.get('title')}",
            f"YOUTUBE DURATION SECONDS: {y.get('duration')}",
            f"YOUTUBE UPLOAD DATE: {y.get('upload_date')}",
            f"YOUTUBE CHANNEL: {y.get('channel')}",
            f"YOUTUBE DESCRIPTION:\n{(y.get('description') or '')[:6000]}",
        ]
    body = strip_html(fd.get("content-body-rich-text"))
    if body:
        parts.append(f"CASE STUDY (written by the production house, verified against sources):\n{body[:14000]}")
    return "\n".join(parts), bool(body), y


def extract_one(w):
    out = os.path.join(OUT, w["id"] + ".json")
    src, has_cs, y = sources_for(w)
    h = hashlib.sha1(src.encode("utf-8")).hexdigest()
    if os.path.exists(out):
        with open(out, encoding="utf-8") as f:
            if json.load(f).get("source_hash") == h:
                return None  # sources unchanged since last extraction
    t0 = time.time()
    msg = client.messages.parse(
        model=MODEL,
        max_tokens=4000,
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": src}],
        output_format=Extract,
    )
    if msg.stop_reason == "refusal" or msg.parsed_output is None:
        return f"FAILED {w['fieldData']['slug']} {msg.stop_reason}"
    rec = msg.parsed_output.model_dump()
    rec.update({
        "id": w["id"],
        "slug": w["fieldData"]["slug"],
        "has_case_study": has_cs,
        "source_hash": h,
        "yt_title": y.get("title") if y else None,
        "yt_duration": y.get("duration") if y else None,
        "usage": msg.usage.model_dump(),
        "model": MODEL,
    })
    with open(out, "w", encoding="utf-8") as f:
        json.dump(rec, f, ensure_ascii=False, indent=1)
    u = msg.usage
    return f"{w['fieldData']['slug'][:50]:50s} {rec['confidence']:6s} in={u.input_tokens} cached={u.cache_read_input_tokens} out={u.output_tokens} {time.time()-t0:.0f}s"


def main(limit=None, workers=3):
    from concurrent.futures import ThreadPoolExecutor, as_completed
    todo = works if limit is None else works[:limit]
    done = skipped = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(extract_one, w): w for w in todo}
        for fut in as_completed(futures):
            try:
                line = fut.result()
            except Exception as e:  # noqa: BLE001
                line = f"ERROR {futures[fut]['fieldData']['slug']}: {e}"
            if line is None:
                skipped += 1
                continue
            done += 1
            print(line, flush=True)
    print(f"\nextracted {done}, unchanged {skipped}, total items {len(todo)}", flush=True)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)
