# Work Intelligence Index: build notes (5 September 2026)

Built by `index/fetch_cms.py`, `index/fetch_youtube.py`, `index/extract.py`, `index/build_directors.py`,
`index/emit_seed.py`. Re-run in that order after CMS changes; every step is cached and resumable, and
`extract.py` only re-calls Claude for items whose sources changed. Model: claude-opus-5.

## Inputs

| Source | Count |
|---|---|
| Works items over REST | 161 (156 live, 5 draft or archived) |
| YouTube metadata (yt-dlp, title, description, duration) | 154 of 154 items with a URL, zero failures; 7 items have no URL |
| Case studies (`content-body-rich-text`) | 17 |
| CMS `awards` references | 12 items, 172 award references |
| CMS `industries` | 142 items |
| CMS `full-credits` | 31 items |

`project-summary` is mixed: 64 items hold a director credit, 78 hold prose (many under 30 characters),
14 are empty. The build skips any value matching `Director:` and any value shorter than 60 characters,
and passes the rest to the extractor labelled as unverified marketing copy.

## Output

| Confidence | Rows |
|---|---|
| high | 59 |
| medium | 80 |
| low | 22 |

Low confidence is concentrated in the 13 Razorpay dealer films (short uploads with only a title and a
credit line) and a handful of brand tiles with no film description anywhere.

Format: TVC 68, digital film 56, brand film 15, series 11, anthem 6, other 3, short 2.
Complexity: complex 92, standard 60, contained 9. The complex band is wide because the rule counts
celebrity, crowd or multi-location as complex on its own.

Director on 158 rows (3 have none). `director_slug` set on 138 rows; it is null on the 19 Shivin and
Sunny films, the 1 Roopali Singhal film and the 3 with no director, because only the 9 live directors
may ever be linked or suggested.

## Facts the owner should confirm

- **malaysia-airlines**: CMS reference says Ronak Chugh, the FDF YouTube title says Atul Kattukaran.
  The index follows the YouTube title, per the standing rule. Unresolved since the case study work.
- The 20 rows with an `outcome` sentence took it only from a case study or a numeric claim in CMS copy.
  The other 141 have none, on purpose.
- `celebrity` is set on 48 rows, only where a source names the person.
