// Minimal server: serves web/ and a JSON API backed by data/projects.json.
// No dependencies — Node 20+ only. Start with: npm start
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const DATA = join(ROOT, "data", "projects.json");
const PORT = process.env.PORT || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

let writeQueue = Promise.resolve();

async function readProjects() {
  return JSON.parse(await readFile(DATA, "utf8"));
}

// Serialize writes so two requests can't clobber the file.
function mutate(fn) {
  writeQueue = writeQueue.then(async () => {
    const projects = await readProjects();
    const next = await fn(projects);
    await writeFile(DATA, JSON.stringify(next, null, 2) + "\n");
  });
  return writeQueue;
}

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { "content-type": TYPES[".json"], "cache-control": "no-store" });
  res.end(text);
}

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = decodeURIComponent(url.pathname);

  try {
    if (path === "/api/projects" && req.method === "GET") {
      return json(res, 200, await readProjects());
    }

    const match = path.match(/^\/api\/projects\/(.+)$/);
    if (match) {
      const id = match[1];

      if (req.method === "PUT") {
        let incoming;
        try {
          incoming = await body(req);
        } catch {
          return json(res, 400, { error: "body must be JSON" });
        }
        if (!incoming.name || !incoming.town) {
          return json(res, 400, { error: "name and town are required" });
        }
        if (!(Number(incoming.units) >= 30)) {
          return json(res, 400, { error: "projects must have 30 or more units" });
        }
        await mutate((projects) => {
          const record = { ...incoming, id, updatedAt: new Date().toISOString() };
          const i = projects.findIndex((p) => p.id === id);
          if (i === -1) projects.push(record);
          else projects[i] = { ...projects[i], ...record };
          return projects;
        });
        return json(res, 200, { ok: true, id });
      }

      if (req.method === "DELETE") {
        await mutate((projects) => projects.filter((p) => p.id !== id));
        return json(res, 200, { ok: true, id });
      }
    }

    // Static files out of web/
    const file = path === "/" ? "/index.html" : path;
    if (file.includes("..")) return json(res, 400, { error: "bad path" });
    const buf = await readFile(join(ROOT, "web", file));
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(buf);
  } catch (err) {
    if (err.code === "ENOENT") return json(res, 404, { error: "not found" });
    console.error(err);
    json(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, () => console.log(`CT pipeline running at http://localhost:${PORT}`));
