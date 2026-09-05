// Automated checks over scripts/out/*.md after a run-briefs pass: dashes, money, AI tells,
// heading order, citation counts, dropped markers, refusal path. Prints a table and exits 1 on a hard failure.
import fs from "node:fs";
import path from "node:path";

const outDir = path.join("scripts", "out");
const EM = String.fromCharCode(8212), EN = String.fromCharCode(8211);
const MONEY = /₹|\bRs\.?\s?\d|\bINR\b|\blakhs?\b|\bcrores?\b|\brupees?\b/i;
const TELLS = ["seamless", "elevate", "testament", "delve", "not just", "in a world where", "moreover", "furthermore", "game-changer", "game changer"];
const SCRIPT_H = ["The read", "Beat sheet", "Runtime and format", "Production breakdown", "Three comparable films", "Two directors", "What we would push on"];
const BRIEF_H = ["The read", "Three comparable films", "Two directors", "The questions we would ask"];

let hard = 0;
const rows = [];
for (const f of fs.readdirSync(outDir).filter((x) => x.endsWith(".md")).sort()) {
  const raw = fs.readFileSync(path.join(outDir, f), "utf8");
  const [body, metaJson] = raw.split("\n---\n");
  let meta = {};
  try { meta = JSON.parse(metaJson || "{}"); } catch {}
  const kind = meta.done?.kind ?? meta.meta?.kind ?? "?";
  const headings = [...body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  const expected = kind === "script" ? SCRIPT_H : kind === "brief" ? BRIEF_H : [];
  const headingsOk = expected.length === 0 ? (kind === "none" ? headings.length === 0 : false) : JSON.stringify(headings) === JSON.stringify(expected);
  const dashes = (body.match(new RegExp(`[${EM}${EN}]`, "g")) || []).length;
  const money = MONEY.test(body);
  const tells = TELLS.filter((t) => body.toLowerCase().includes(t));
  const cited = meta.done?.cited?.length ?? 0;
  const directors = meta.done?.directors?.length ?? 0;
  const pushOn = (body.split(/^## What we would push on$/m)[1] || "").split(/^## /m)[0];
  const pushBullets = (pushOn.match(/^- /gm) || []).length;
  const questions = (body.split(/^## The questions we would ask$/m)[1] || "").split(/^## /m)[0];
  const qBullets = (questions.match(/^- /gm) || []).length;
  const words = body.split(/\s+/).filter(Boolean).length;
  const problems = [];
  if (dashes) problems.push(`${dashes} dashes`);
  if (money) problems.push("MONEY");
  if (tells.length) problems.push("tells: " + tells.join(","));
  if (meta.error) problems.push("ERROR " + meta.error.code);
  if (!headingsOk) problems.push("headings: " + headings.join(" / "));
  if (kind === "script" && (cited < 2 || cited > 8)) problems.push(`cited ${cited}`);
  if (kind === "script" && (pushBullets < 3 || pushBullets > 6)) problems.push(`push-on bullets ${pushBullets}`);
  if (kind === "brief" && (qBullets < 5 || qBullets > 8)) problems.push(`question bullets ${qBullets}`);
  if ((kind === "script" || kind === "brief") && directors !== 2) problems.push(`directors ${directors}`);
  if (dashes || money || meta.error) hard++;
  rows.push({ file: f.slice(0, 34), kind, words, s: Math.round((meta.ms || 0) / 1000), first: meta.firstDeltaMs ?? "", cited, dirs: directors, push: pushBullets || qBullets, problems: problems.join("; ") || "ok" });
}
console.table(rows);
console.log(hard ? `${hard} hard failure(s)` : "no hard failures");
process.exit(hard ? 1 : 0);
