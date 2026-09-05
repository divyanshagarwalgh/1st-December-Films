// Phase 2 acceptance: run every scripts/briefs/*.txt through the analyser and collect the outputs.
// Usage: node scripts/run-briefs.mjs [baseUrl] [only-prefix]
// Needs the admin token (bypasses the rate limit) at ~/.secrets/fdf-admin-token.txt.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const base = (process.argv[2] || "https://fdf-script-staging.webflow.io").replace(/\/$/, "");
const only = process.argv[3] || "";
const token = fs.readFileSync(path.join(os.homedir(), ".secrets", "fdf-admin-token.txt"), "utf8").trim();
const dir = path.join("scripts", "briefs");
const outDir = path.join("scripts", "out");
fs.mkdirSync(outDir, { recursive: true });
const index = JSON.parse(fs.readFileSync(path.join("data", "works-index.json"), "utf8"));
const titles = Object.fromEntries(index.map((r) => [r.id, `${r.client}: ${r.campaign} (${(r.year || "").slice(0, 4)})`]));

function htmlToText(h) {
  return h
    .replace(/<h2>/g, "\n\n## ").replace(/<\/h2>/g, "\n")
    .replace(/<li>/g, "\n- ").replace(/<\/li>/g, "")
    .replace(/<p>/g, "\n\n").replace(/<\/p>/g, "")
    .replace(/<ul>|<\/ul>/g, "")
    .replace(/<a href="([^"]+)">([^<]+)<\/a>/g, "[$2]($1)")
    .replace(/<\/?strong>/g, "**")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .trim();
}

async function runOne(file) {
  const text = fs.readFileSync(path.join(dir, file), "utf8");
  const n = file.slice(0, 2);
  const started = Date.now();
  const res = await fetch(base + "/api/analyse", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + token },
    body: JSON.stringify({ email: `test+${n}@1stdecember.com`, company: "Phase 2 run", text, attribution: { "Lead Source": "test / phase2", "Landing Page": "/script", "Visit Count": "1", "Device": "script" } }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text();
    return { file, error: `${res.status} ${body.slice(0, 300)}`, ms: Date.now() - started };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let html = "";
  let meta = null, done = null, error = null, firstDeltaMs = null;
  const sections = [];
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) !== -1) {
      const frame = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = (frame.match(/^event: (.*)$/m) || [])[1];
      const data = (frame.match(/^data: (.*)$/m) || [])[1];
      if (!ev || !data) continue;
      const d = JSON.parse(data);
      if (ev === "meta") meta = d;
      else if (ev === "delta") { if (firstDeltaMs === null) firstDeltaMs = Date.now() - started; html += d.html; }
      else if (ev === "section") sections.push(d.key);
      else if (ev === "done") done = d;
      else if (ev === "error") error = d;
    }
  }
  return { file, meta, done, error, sections, html, ms: Date.now() - started, firstDeltaMs };
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt") && f.startsWith(only)).sort();
const report = [`# Phase 2 outputs, ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC, against ${base}`, ""];
for (const f of files) {
  process.stdout.write(f + " ... ");
  let r;
  try {
    r = await runOne(f);
  } catch (e) {
    r = { file: f, error: String(e), ms: 0 };
  }
  const text = r.html ? htmlToText(r.html) : "";
  fs.writeFileSync(path.join(outDir, f.replace(".txt", ".md")), `# ${f}\n\n${text}\n\n---\n${JSON.stringify({ meta: r.meta, done: r.done, error: r.error, ms: r.ms, firstDeltaMs: r.firstDeltaMs }, null, 1)}\n`);
  const cited = (r.done?.cited || []).map((id) => titles[id] || id);
  report.push(`## ${f}`, "", `kind ${r.done?.kind ?? r.meta?.kind ?? "?"} | candidates ${r.meta?.candidates ?? "?"} | first text ${r.firstDeltaMs ?? "?"} ms | total ${Math.round(r.ms / 1000)} s | cited ${cited.length}: ${cited.join("; ") || "none"} | directors: ${(r.done?.directors || []).join(", ") || "none"}${r.error ? ` | ERROR ${JSON.stringify(r.error)}` : ""}`, "", text || "(no output)", "");
  console.log(r.error ? "ERROR " + JSON.stringify(r.error).slice(0, 120) : `${r.done?.kind} ${Math.round(r.ms / 1000)}s cited ${cited.length}`);
}
const stamp = new Date().toISOString().slice(0, 10);
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync(path.join("docs", `phase2-outputs-${stamp}.md`), report.join("\n"));
console.log("wrote docs/phase2-outputs-" + stamp + ".md");
