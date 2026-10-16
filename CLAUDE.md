# Context for Claude Code

A tracker for Connecticut residential developments of 30+ units. The user works
in Connecticut real estate and uses this to know who is building what, at what
stage, and who to contact.

## Shape of the code

- `server.mjs` — Node 20, no dependencies, no framework. Serves `web/` and three
  endpoints: `GET /api/projects`, `PUT /api/projects/:id`, `DELETE /api/projects/:id`.
  Writes go through a promise queue so the JSON file can't be clobbered.
- `web/index.html` — one file: markup, CSS, and vanilla JS. No build step, no
  bundler, no framework. Keep it that way unless asked.
- `scripts/ingest.mjs` — fetches `data/sources.json`, calls the Anthropic API,
  merges results into `data/projects.json`.
- `data/projects.json` — the source of truth. An array of project objects.

## A project record

```json
{
  "id": "town-slug-name-slug",
  "name": "", "developer": "", "town": "", "county": "", "address": "",
  "units": 0, "affordableUnits": null,
  "housingType": "Affordable | Mixed-income | Market rate | Not specified",
  "workType": "New construction | Conversion / adaptive reuse | Rehab / preservation",
  "affordable": "", "program": "",
  "stage": "proposed | approved | funded | construction | completed | denied",
  "asOf": "YYYY-MM",
  "contacts": [{ "name": "", "title": "", "email": "", "phone": "", "mobile": "" }],
  "contactStatus": "why there is no contact yet, and where to look",
  "notes": "", "sourceName": "", "sourceUrl": ""
}
```

## Rules that matter here

- **Never invent data.** No made-up developers, unit counts, contacts, or dates.
  If a source doesn't say, leave the field empty and note where to find it.
- **Every project keeps `sourceUrl`.** The user checks sources before acting.
- Anything the ingest adds or changes gets `review: true`.
- Contacts are business contacts. Don't add personal phone numbers or addresses,
  and drop anything flagged Do Not Call.
- The stage colors and layout in `web/index.html` are deliberate. Ask before
  restyling.

## Good next things to build

- Auth before deploying anywhere public.
- Move `data/projects.json` to SQLite once it passes a few hundred rows.
- A change log: append stage changes with dates so you can see how fast a
  project moved.
- Town planning-agenda scrapers (each town posts its own PDFs) to catch projects
  before they reach the news.
- Email or Slack digest of what the last ingest added.
