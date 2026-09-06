# The /script page: build sheet for the Webflow Designer

The page at `1stdecember.com/script` is built in the Designer and owns every visible element, every word of copy, the SEO settings and the JSON-LD. The Webflow Cloud app mounted at `/analyser` is the engine: it serves `embed.js` and `embed.css`, answers `/analyser/api/analyse`, keeps the private result pages at `/analyser/r/<id>` and the staff admin at `/analyser/admin`. The app root `/analyser` redirects to `/script`.

`embed.js` finds the page's elements by id. The ids below are the contract; `tests/embed.test.ts` fails if the script looks for an id this sheet does not list. Layout, classes, spacing and styling are yours. Copy marked "approved" was signed off in Phase 3 and should be pasted as written.

A working reference of this structure, wired to the live engine, is at `https://1stdecember.com/analyser/admin/preview` (staff only; open `/analyser/admin?token=<ADMIN_TOKEN>` once and the cookie carries over). Use it to see the intended order and behaviour while you build; it is not the public page.

## 1. Page settings

| Setting | Value |
|---|---|
| Page name | Script |
| Slug | `script` |
| Title tag | `Script analyser \| First December Films` |
| Meta description | Paste a script or a brief and get a producer's read from First December Films: what it is, how it would be produced, three comparable films from our catalogue and two directors. |
| Open Graph title and description | Same as above. |
| Open Graph image | The site's default OG image, or a new one at 1200 by 630. |
| Sitemap | Leave the page included (Designer pages go into the auto sitemap; that is one reason the page lives here). |
| Custom code, inside `<head>` | `<link rel="stylesheet" href="/analyser/embed.css">` |
| Custom code, before `</body>` | `<script src="/analyser/embed.js" defer></script>` |
| JSON-LD (SEO settings, structured data field) | The block in section 5. |

Both paths are relative to the host, so the page also works on `first-december-films.webflow.io` after a publish.

## 2. Structure and ids

The page keeps the site header and footer it already has. Between them, in this order. The same structure, written in the site's own classes and ready for the Webflow builder tools, is in `docs/designer-page-sections.html`.

### A. Intro wrapper: `fdf-intro`

A Div Block (or Section) with the id `fdf-intro`. It holds the hero copy and the form. The script hides it while an analysis runs and shows it again on Start over. Do not add `fdf-hidden` to it.

**Hero copy (approved):**

- Eyebrow: `Script analyser`
- H1: `Paste the script.`
- Paragraph: `See how we would make it. A producer's read on your script or brief, grounded in the films we have actually made: what it is, how it would be produced, three comparable films from our catalogue, two directors, and the things we would push on before the first call.`
- Small note: `Takes about a minute. Written by a model that has read our catalogue and is told to be honest rather than kind.`

**The form.** A Webflow Form Block is required, because the notification is Webflow's own form submission. Select the Form element inside it (not the Form Block wrapper) and set Form name `Script Analyser`. If the settings panel offers an ID field, set `fdf-form`; if it does not, leave it, the script finds the form through the textarea. Leave Action, Method and every integration empty. Optional custom attribute on the Form: `data-lead-form` with an empty value (the site's attribution script fills its hidden fields into forms carrying it; the script adds the attribute itself if it is missing).

How the two submits work: the visitor's press of Analyse is caught by the script and starts the analysis, Webflow never sees it. About a second later, when the app has returned the reference, the script appends four hidden fields (Reference, Result-Link, Admin-Link, Kind) and hands the form to Webflow's handler once. Webflow stores the submission in the Forms tab and sends the notification email the form's settings define. No hidden fields need to be built in the Designer. The site's Turnstile bot check runs inside Webflow's handler as it does on the contact form.

| Field | Element | ID | Name | Settings |
|---|---|---|---|---|
| Script | Text Area | `fdf-text` | `text` | Required. Label `Your script or brief*`. Placeholder `Paste a script or a brief. Scene directions, voice-over, dialogue, or a one-page brief all work.` |
| Email | Input, type Email | `fdf-email` | `email` | Required. Label `Email*`. Placeholder `you@agency.com`. Autocomplete `email`. |
| Company | Input, type Plain | `fdf-company` | `company` | Optional. Label `Company`. Placeholder `Brand or agency`. Autocomplete `organization`. |
| Honeypot | Input, type Plain, inside a Div Block set to Display: None | `fdf-website` | `website` | Optional but recommended. Bots fill it, people never see it, the app treats a filled value as spam. |
| Retention statement | Text Block or Rich Text | none | | Approved wording, verbatim, in section 3. Sits above the checkbox. |
| Consent | Checkbox | `fdf-consent` | `consent` | Required. Label text: `I have read how my script is handled and I am happy to be contacted about it.` |
| Error line | Text Block | `fdf-error` | | Add the class `fdf-hidden`. Custom attribute `role` = `alert`. Empty; the script writes into it. Style it as an error (the app used a pale red background with dark red text). |
| Submit | Submit Button | `fdf-submit` | | Button text `Analyse the script`. Waiting text `Reading`. |
| Note under the button | Text Block | none | | `Three analyses per email address per day. Your script stays with First December Films.` |

### B. Analysis block: `fdf-analysis`

A Section or Div Block with the id `fdf-analysis` and the class `fdf-hidden`. Hidden until a run starts. Inside, in this order:

| Part | Element | ID | Notes |
|---|---|---|---|
| Eyebrow | Text Block | none | `Script analyser` |
| Bar text | Text Block | `fdf-bar-text` | Initial text `Analysing your script. This takes about a minute, and the text appears here as it is written.` To change the three states the script writes here, set custom attributes `data-busy`, `data-done`, `data-none` on this element. |
| Start over | Button or Link Block | `fdf-restart` | Text `Start over`. Secondary style. |
| Status row | Div Block containing the two below | none | The app kept this sticky at the top so the reader always sees where the model is. Optional. |
| Status dot | Div Block, empty | `fdf-dot` | `embed.css` sizes and animates it; turns yellow when done. |
| Status text | Text Block | `fdf-status-text` | Initial text `Reading the script`. |
| Output | Div Block, empty | `fdf-output` | The analysis streams into it as headings, paragraphs, bullets and links. `embed.css` styles those; override from page code if you want. Give it the width you want. |
| CTA block | Div Block | `fdf-cta` | Add the class `fdf-hidden`. Shown when the analysis finishes. |
| CTA text | Text Block inside the CTA block | none | `Want to talk this through with a producer? Send us the reference and we will pick it up from here.` |
| Talk to a producer | Link Block or Button, inside the CTA block | `fdf-cta-contact` | Text `Talk to a producer`. Any href; the script sets it to the contact page with the reference. |
| Keep a link | Link Block or Button, inside the CTA block | `fdf-cta-link` | Text `Keep a link to this analysis`. Secondary style. The script sets the href to the private result page. |
| Reference | Text Block inside the CTA block | `fdf-reference` | Empty; the script writes `Reference xxxxxxxx. Quote it when you write to us.` Mono style suits it. |

### C. Content sections, below the analysis block

These are what make the page rank and what an answer engine quotes. Plain Designer elements, your layout. Copy in section 4. The FAQ must match the questions and answers in the JSON-LD word for word.

## 3. Retention statement (approved, do not edit without a new sign-off)

> **What happens to your script.** It is stored encrypted, read only by the First December Films production team, and never used to train any model. We keep it so we can follow up on your enquiry. Email mail@1stdecember.com with your reference and we delete it within two working days.

Link `mail@1stdecember.com` to `mailto:mail@1stdecember.com`.

## 4. Copy for the content sections

Written for review. British spelling, no dashes, no praise. Change what you like, then keep the FAQ and the JSON-LD in step.

### What comes back

For a script:

- **The read.** What the script actually is in plain terms, the device it relies on, and the single thing it needs to land.
- **Beat sheet.** The beats of the film as the script implies them, one line each.
- **Runtime and format.** An estimate with the reasoning shown, and the format it reads as: TVC, digital film, anthem, series or brand film.
- **Production breakdown.** Locations, cast size, day or night, the flags that change a shoot (VFX, kids, animals, stunts, crowd, celebrity, water, period, vehicles), and a complexity band: contained, standard or complex, with one sentence on what drives it.
- **Three comparable films.** From the films we have made, each with one sentence on what it shares with your script, linked to the film on this site.
- **Two directors.** From our roster, each tied to two credits.
- **What we would push on.** What is unclear, what will get expensive, where the idea is doing the least work, and what you would be asked on the first call.

For a brief: the read, three comparable films, two directors, and the questions we would ask before recommending anything.

### How it works

1. Paste the script or the brief, add your email and press Analyse.
2. The tool reads it against more than 160 films and nine directors from our catalogue and writes the analysis in front of you, section by section, in about a minute.
3. Keep the link, or send us the reference and a producer picks it up from there.

### Who it is for

Brands and agencies with a script or a brief in hand, before the first production call. Producers who want to know how a script reads to another production house. Writers who want a production read rather than praise.

### What it will not do

It does not quote a budget or a shoot-day count. It gives a complexity band and says what drives it. It does not write a treatment and it does not rewrite the script. It does not praise. If what you paste is not a script or a brief, it says so and asks for the script.

### Questions people ask

1. **Is the script analyser free to use?**
   Yes. Three analyses per email address per day. There is no account and no payment. Your script is stored so the team can follow up on your enquiry.
2. **What do I get back?**
   A read of what the script is, a beat sheet, a runtime and format estimate, a production breakdown with a complexity band, three comparable films from the First December Films catalogue, two directors from the roster, and the points a producer would push on.
3. **Does it give a budget or a shoot-day count?**
   No. It gives a complexity band, contained, standard or complex, and one sentence on what drives it. Budgets come from a conversation with a producer, not from a tool.
4. **Who reads my script?**
   The First December Films production team. The script is stored encrypted and is never used to train any model. Email mail@1stdecember.com with your reference and it is deleted within two working days.
5. **Can I paste a brief instead of a script?**
   Yes. A one page brief works. The tool then gives the read, three comparable films, two directors and the questions a producer would ask before recommending anything.
6. **Where do the comparable films come from?**
   From the films First December Films has actually made. Every comparable links to that film on this site so you can watch it, and the tool cannot name a film that is not in the catalogue.
7. **Which directors can it suggest?**
   Only directors currently on the First December Films roster. Each suggestion is tied to two credits from the catalogue.
8. **How long does it take?**
   About a minute. The analysis appears as it is written, section by section, and you can keep a link to it afterwards.
9. **Is the analysis written by a person?**
   No. It is written by a model that has read the catalogue and is told to be honest rather than kind. A producer reads your script when you get in touch.

The FAQ text above has no apostrophes or ampersands on purpose: the same sentences go into the JSON-LD, and script data does not decode HTML entities.

## 5. JSON-LD for the page

Paste into the page's structured data field. It links to the site-wide Organization and WebSite nodes by their existing ids, so the graph reads as one site.

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://1stdecember.com/script#webpage",
      "url": "https://1stdecember.com/script",
      "name": "Script analyser | First December Films",
      "description": "Paste a script or a brief and get a producer read from First December Films: what it is, how it would be produced, three comparable films from the catalogue and two directors.",
      "inLanguage": "en-IN",
      "isPartOf": { "@id": "https://1stdecember.com/#website" },
      "about": { "@id": "https://1stdecember.com/#organization" },
      "mainEntity": { "@id": "https://1stdecember.com/script#app" },
      "breadcrumb": { "@id": "https://1stdecember.com/script#breadcrumb" }
    },
    {
      "@type": "WebApplication",
      "@id": "https://1stdecember.com/script#app",
      "name": "Script analyser",
      "url": "https://1stdecember.com/script",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Any",
      "browserRequirements": "Requires JavaScript",
      "isAccessibleForFree": true,
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR" },
      "provider": { "@id": "https://1stdecember.com/#organization" },
      "description": "Paste a script or a brief and get a producer read grounded in the films First December Films has made: what it is, how it would be produced, three comparable films and two directors.",
      "featureList": [
        "The read: what the script is and the single thing it needs to land",
        "Beat sheet",
        "Runtime and format estimate with the reasoning shown",
        "Production breakdown with a complexity band: contained, standard or complex",
        "Three comparable films from the First December Films catalogue",
        "Two directors from the roster, each tied to two credits",
        "What a producer would push on before the first call"
      ]
    },
    {
      "@type": "FAQPage",
      "@id": "https://1stdecember.com/script#faq",
      "mainEntity": [
        { "@type": "Question", "name": "Is the script analyser free to use?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. Three analyses per email address per day. There is no account and no payment. Your script is stored so the team can follow up on your enquiry." } },
        { "@type": "Question", "name": "What do I get back?", "acceptedAnswer": { "@type": "Answer", "text": "A read of what the script is, a beat sheet, a runtime and format estimate, a production breakdown with a complexity band, three comparable films from the First December Films catalogue, two directors from the roster, and the points a producer would push on." } },
        { "@type": "Question", "name": "Does it give a budget or a shoot-day count?", "acceptedAnswer": { "@type": "Answer", "text": "No. It gives a complexity band, contained, standard or complex, and one sentence on what drives it. Budgets come from a conversation with a producer, not from a tool." } },
        { "@type": "Question", "name": "Who reads my script?", "acceptedAnswer": { "@type": "Answer", "text": "The First December Films production team. The script is stored encrypted and is never used to train any model. Email mail@1stdecember.com with your reference and it is deleted within two working days." } },
        { "@type": "Question", "name": "Can I paste a brief instead of a script?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. A one page brief works. The tool then gives the read, three comparable films, two directors and the questions a producer would ask before recommending anything." } },
        { "@type": "Question", "name": "Where do the comparable films come from?", "acceptedAnswer": { "@type": "Answer", "text": "From the films First December Films has actually made. Every comparable links to that film on this site so you can watch it, and the tool cannot name a film that is not in the catalogue." } },
        { "@type": "Question", "name": "Which directors can it suggest?", "acceptedAnswer": { "@type": "Answer", "text": "Only directors currently on the First December Films roster. Each suggestion is tied to two credits from the catalogue." } },
        { "@type": "Question", "name": "How long does it take?", "acceptedAnswer": { "@type": "Answer", "text": "About a minute. The analysis appears as it is written, section by section, and you can keep a link to it afterwards." } },
        { "@type": "Question", "name": "Is the analysis written by a person?", "acceptedAnswer": { "@type": "Answer", "text": "No. It is written by a model that has read the catalogue and is told to be honest rather than kind. A producer reads your script when you get in touch." } }
      ]
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://1stdecember.com/script#breadcrumb",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://1stdecember.com/" },
        { "@type": "ListItem", "position": 2, "name": "Script analyser", "item": "https://1stdecember.com/script" }
      ]
    }
  ]
}
```

## 6. Classes the script toggles

- `fdf-hidden` on `fdf-analysis`, `fdf-cta` and `fdf-error` (you add it in the Designer; the script adds and removes it). Defined in `embed.css` as display none.
- `is-done` on `fdf-dot` when the analysis finishes.
- `is-busy` on `fdf-submit` while a run is in progress, if you want to style that state.
- `fdf-cursor` on `fdf-output` while text is streaming, which draws the blinking block.

## 7. Form notifications (Site settings, Forms)

The app sends no email. Set the notification on the Script Analyser form in Webflow:

- Recipients: mail@1stdecember.com, ganeshpareek@1stdecember.com, imranpatel@1stdecember.com, ankitsingh@1stdecember.com.
- Reply-To: `{{ Email }}` so a reply goes to the visitor.
- Subject: `Script analyser: {{ Reference }} from {{ Email }}`.
- Message: the default field list is fine. It carries the script, the company, the fourteen attribution fields, the reference and the two links (result page for the analysis, admin page for status and deletion).

## 8. After the build

1. Publish the site (this is Phase 5 step 4; nothing else is waiting to go out).
2. I verify from a phone, logged out: paste, stream, click a film link and a director link, the row lands with attribution, the Webflow submission appears in the Forms tab with the reference and links, the email arrives, the admin shows the row.
3. robots.txt, llms.txt and the nav link follow as Phase 5 steps 6 to 8.
