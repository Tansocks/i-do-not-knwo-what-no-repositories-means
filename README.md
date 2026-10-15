# CT multifamily pipeline

Tracks Connecticut residential developments of 30 or more units: who is building
them, what stage they are in, how many units are affordable, and who to call.

Started from a Claude artifact; this repo is the standalone version.

```
data/projects.json   the whole dataset (47 projects to start) — plain JSON, edit by hand if you like
ct-multifamily-pipeline.csv  spreadsheet export (npm run export)
data/sources.json    the pages the ingest script reads
web/index.html       the app: filters, developer view, contacts view, CSV export
server.mjs           serves web/ and a small REST API over projects.json (no dependencies)
scripts/ingest.mjs   fetches sources, asks Claude for new projects, merges them in
.github/workflows/   runs the ingest on a schedule and commits the result
```

## Run it

```bash
node --version      # needs 20+
npm start           # http://localhost:3000
```

Everything you add or edit in the browser is written straight back to
`data/projects.json`, so `git diff` shows exactly what changed.

To get a spreadsheet, run `npm run export`. It writes `ct-multifamily-pipeline.csv`
in the repo root, sorted by units.

## Keep it updating

```bash
export ANTHROPIC_API_KEY=sk-...
npm run ingest:dry   # see what it would add, change nothing
npm run ingest       # merge into data/projects.json
```

The script fetches each page in `data/sources.json`, strips it to text, and asks
Claude to return any Connecticut project of 30+ units as structured JSON. New
projects are appended; existing ones are updated only when a newer article
disagrees about stage, units, developer, affordable units or date.

**Everything the ingest touches is flagged `review: true`.** Treat those as leads
to confirm, not facts. Clear the flag once you have checked the source.

To run it on a schedule, push this repo to GitHub, add `ANTHROPIC_API_KEY` under
Settings → Secrets → Actions, and the workflow in `.github/workflows/ingest.yml`
runs each weekday morning and commits any changes.

## Deploy

The server is a single file with no dependencies, so anything that runs Node
works: Fly.io, Render, Railway, a small VPS, or a container. Two things to add
before it is on the public internet:

1. **Auth.** The API has none. Anyone who can reach it can edit or delete.
2. **A real database.** A JSON file is fine for one editor and a few hundred
   rows. Past that, move to SQLite or Postgres — the API surface is three
   endpoints, so the swap is small.

## Data notes

- Stages: `proposed`, `approved`, `funded`, `construction`, `completed`, `denied`.
- Housing types: `Affordable`, `Mixed-income`, `Market rate`, `Not specified`.
- Contacts are business contacts pulled from ZoomInfo, listed by company rather
  than by project. Several projects still have none; each says where to look.
- Records marked "verify" in `notes` are from 2025 announcements and may be out
  of date.
