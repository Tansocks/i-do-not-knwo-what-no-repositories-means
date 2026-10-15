// Pulls the source list, asks Claude to pull out CT multifamily projects of 30+
// units, and merges anything new into data/projects.json.
//
//   ANTHROPIC_API_KEY=sk-... node scripts/ingest.mjs            # merge new projects
//   ANTHROPIC_API_KEY=sk-... node scripts/ingest.mjs --dry-run  # print, change nothing
//
// New or changed records are written with review:true so nothing lands in the app
// unchecked. Open the project in the app and use "Mark checked" once verified.

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA = join(ROOT, "data", "projects.json");
const SOURCES = join(ROOT, "data", "sources.json");
const MODEL = process.env.MODEL || "claude-sonnet-5";
const DRY = process.argv.includes("--dry-run");
const KEY = process.env.ANTHROPIC_API_KEY;

const STAGES = ["proposed", "approved", "funded", "construction", "completed", "denied"];

const SCHEMA = `Return ONLY a JSON array (no prose, no markdown fences). One object per project:
{
  "name": string,                 // project name, or street address if unnamed
  "developer": string,            // "" if the article does not name one
  "town": string,                 // Connecticut town
  "county": string,               // Fairfield|Hartford|Litchfield|Middlesex|New Haven|New London|Tolland|Windham
  "address": string,
  "units": number,                // total units; omit the project if under 30
  "affordableUnits": number|null,
  "housingType": "Affordable"|"Mixed-income"|"Market rate"|"Not specified",
  "workType": "New construction"|"Conversion / adaptive reuse"|"Rehab / preservation",
  "affordable": string,           // short affordability note, e.g. "30% at 80% AMI"
  "program": string,              // e.g. "4% LIHTC", "Build For CT", "8-30g", ""
  "stage": ${JSON.stringify(STAGES)},
  "asOf": string,                 // "YYYY-MM" of the article
  "notes": string,                // one or two sentences of specifics
  "sourceName": string,
  "sourceUrl": string             // the URL you were given
}
Rules: only Connecticut; only 30 units or more; only residential development.
Never invent a developer, a unit count, or a date — leave the field empty instead.
If the page has no qualifying project, return [].`;

const slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

async function claude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  return JSON.parse(text.slice(start, end + 1));
}

// Crude but dependency-free: strip tags, collapse whitespace, cap length.
function textFromHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40000);
}

async function fetchSource(url) {
  const res = await fetch(url, {
    headers: { "user-agent": "ct-pipeline-tracker (contact: you@example.com)" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return textFromHtml(await res.text());
}

// Same project if the town matches and the name or address looks the same.
function findExisting(projects, candidate) {
  const key = (s) => slug(String(s || ""));
  return projects.find(
    (p) =>
      key(p.town) === key(candidate.town) &&
      (key(p.name) === key(candidate.name) ||
        (p.address && candidate.address && key(p.address) === key(candidate.address)))
  );
}

const CHANGED = ["stage", "units", "developer", "affordableUnits", "asOf"];

async function main() {
  if (!KEY) throw new Error("Set ANTHROPIC_API_KEY");
  const projects = JSON.parse(await readFile(DATA, "utf8"));
  const sources = JSON.parse(await readFile(SOURCES, "utf8"));

  let added = 0;
  let updated = 0;

  for (const source of sources) {
    let text;
    try {
      text = await fetchSource(source.url);
    } catch (err) {
      console.warn(`skip ${source.url}: ${err.message}`);
      continue;
    }

    let found = [];
    try {
      found = await claude(
        `${SCHEMA}\n\nSource name: ${source.name}\nSource URL: ${source.url}\n\nPage text:\n${text}`
      );
    } catch (err) {
      console.warn(`extract failed for ${source.url}: ${err.message}`);
      continue;
    }

    for (const candidate of found) {
      if (!candidate?.name || !candidate?.town || Number(candidate.units) < 30) continue;
      const existing = findExisting(projects, candidate);

      if (!existing) {
        projects.push({
          ...candidate,
          id: `${slug(candidate.town)}-${slug(candidate.name)}`,
          contacts: [],
          contactStatus: "Found by ingest; contact not looked up yet.",
          review: true,
          firstSeen: new Date().toISOString(),
        });
        added++;
        console.log(`+ ${candidate.town}: ${candidate.name} (${candidate.units} units)`);
        continue;
      }

      const diffs = CHANGED.filter(
        (f) => candidate[f] && String(candidate[f]) !== String(existing[f] ?? "")
      );
      // Only accept a newer article's version of a field.
      if (diffs.length && String(candidate.asOf || "") >= String(existing.asOf || "")) {
        for (const f of diffs) existing[f] = candidate[f];
        existing.review = true;
        existing.sourceName = candidate.sourceName;
        existing.sourceUrl = candidate.sourceUrl;
        updated++;
        console.log(`~ ${existing.town}: ${existing.name} → ${diffs.join(", ")}`);
      }
    }
  }

  console.log(`\n${added} added, ${updated} updated${DRY ? " (dry run, nothing written)" : ""}`);
  if (!DRY && (added || updated)) {
    await writeFile(DATA, JSON.stringify(projects, null, 2) + "\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
