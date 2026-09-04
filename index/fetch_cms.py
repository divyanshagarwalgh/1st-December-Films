"""Step 1 of the index build: pull Works and the reference collections over REST."""
from common import *

works = wf_all_items(WORKS)
save("works", works)
print("works", len(works), "| live", sum(1 for w in works if live(w)))
for name, cid in REFS.items():
    items = wf_all_items(cid)
    save(name, {i["id"]: i for i in items})
    print(name, len(items), "| live", sum(1 for i in items if live(i)))
