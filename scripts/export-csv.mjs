// Writes every tracked project to a CSV spreadsheet, one row per project.
//
//   node scripts/export-csv.mjs                 # ct-multifamily-pipeline.csv in the repo root
//   node scripts/export-csv.mjs path/to/out.csv

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA = join(ROOT, "data", "projects.json");
const OUT = process.argv[2] || join(ROOT, "ct-multifamily-pipeline.csv");

const COLUMNS = [
  "name", "developer", "town", "county", "address", "units", "housingType",
  "affordableUnits", "affordable", "program", "workType", "stage", "asOf",
  "contacts", "contactStatus", "notes", "sourceName", "sourceUrl", "review",
];

const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

const contactsText = (list) =>
  (list || [])
    .map((c) => [c.name, c.title, c.email, c.phone, c.mobile].filter(Boolean).join(", "))
    .join(" ; ");

const projects = JSON.parse(await readFile(DATA, "utf8"))
  .sort((a, b) => (Number(b.units) || 0) - (Number(a.units) || 0));

const rows = projects.map((p) =>
  COLUMNS.map((c) => cell(c === "contacts" ? contactsText(p.contacts) : p[c])).join(",")
);

await writeFile(OUT, [COLUMNS.join(","), ...rows].join("\n") + "\n");
console.log(`Wrote ${projects.length} projects to ${OUT}`);
