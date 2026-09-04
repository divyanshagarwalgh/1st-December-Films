"""Shared helpers for the Work Intelligence Index build (Phase 1).

Reads the Webflow token by path, never prints it. All raw pulls are cached under
index/raw/ (gitignored) so every step is resumable.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "raw")
OUT = os.path.join(ROOT, "out")
REPO = os.path.dirname(ROOT)
os.makedirs(RAW, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

SITE = "6a530ef3dd045382387c1010"
WORKS = "6a539a341dd7916d7208e658"
REFS = {
    "directors": "6a53a8a08a3b83a3ed93fd84",
    "awards": "6a53a734d2f5baa54274ddb7",
    "industries": "6a539afd6c828a117d0d2943",
    "services": "6a539cadd00e55970ea7e92a",
    "brands": "6a54ea2aa030395b4925092c",
}


def secret(name):
    return open(os.path.join(os.path.expanduser("~"), ".secrets", name), encoding="utf-8").read().strip()


def wf_get(path, params=None):
    url = "https://api.webflow.com/v2" + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + secret("webflow-token.txt"), "accept": "application/json"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 5:
                time.sleep(2 ** attempt)
                continue
            raise


def wf_all_items(cid):
    items, offset = [], 0
    while True:
        page = wf_get(f"/collections/{cid}/items", {"limit": 100, "offset": offset})
        items += page["items"]
        offset += 100
        if offset >= page["pagination"]["total"]:
            return items


def load(name, folder=RAW):
    with open(os.path.join(folder, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


def save(name, obj, folder=RAW):
    with open(os.path.join(folder, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def live(item):
    return not item.get("isDraft") and not item.get("isArchived")
