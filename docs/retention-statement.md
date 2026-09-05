# Script retention statement

Shown on the /script page above the consent checkbox. Divyansh must sign off this wording before launch (Phase 3 acceptance). Do not change it without a new sign-off.

> **What happens to your script.** It is stored encrypted, read only by the First December Films production team, and never used to train any model. We keep it so we can follow up on your enquiry. Email mail@1stdecember.com with your reference and we delete it within two working days.

Consent line beside the checkbox:

> I have read how my script is handled and I am happy to be contacted about it.

## What makes each claim true

- "stored encrypted": the enquiry lives in a Webflow Cloud SQLite (D1) database, which Cloudflare encrypts at rest; transport is HTTPS end to end.
- "read only by the First December Films production team": the admin page is token protected and the notification email goes to the FDF address only.
- "never used to train any model": the Anthropic API does not train on API inputs; nothing is sent anywhere else.
- "deleted within two working days": the admin page has a "Delete script text" action that blanks the script, the analysis and the extracted fields while keeping the outcome log. Two working days is the promise to keep, so the inbox that receives the notification must be checked.

The deletion contact is mail@1stdecember.com as shown on the contact page. Change `contactEmail` in `src/pages/index.astro` if a different address should receive deletion requests.
