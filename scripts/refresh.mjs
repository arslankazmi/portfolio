#!/usr/bin/env node
/* ============================================================
   refresh.mjs — sync data/projects.json with the GitHub API.
   Curation-aware: safe to run unattended (see .github/workflows/refresh.yml).

   - Fetches all public repos for the user; drops forks and archived.
   - For EXISTING entries: refreshes auto fields (language, updated,
     repo url, description fallback); leaves curated fields untouched.
   - For NEW repos: adds one ONLY if it looks AI/ML (isAiMl) AND is not
     in data.excludeRepos. Non-AI/ML or excluded repos are skipped and
     logged. New entries get a guessed category, topics as keywords,
     and featured:false for you to review/promote.
   - Never deletes entries.
   - Private entries (source:"private" — client case studies with no public
     repo) are skipped entirely: never matched, refreshed, or removed.

   Curated fields preserved: source, category, libraries, keywords, featured,
   name, description, client, highlights, writeup.

   Usage:  node scripts/refresh.mjs [--user <login>] [--include-forks] [--all]
     --all  also add new NON-AI/ML repos (category "Uncategorized").
   Requires Node 18+ (global fetch). Set GITHUB_TOKEN to raise the
   API rate limit (optional for public repos).
   ============================================================ */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "..", "data", "projects.json");

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const includeForks = args.includes("--include-forks");
const addAll = args.includes("--all"); // also add non-AI/ML new repos

const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const userLogin =
  getArg("--user", null) ||
  (data.profile?.github || "").replace(/.*github\.com\//, "").replace(/\/.*/, "") ||
  "arslankazmi";

const excludeRepos = new Set((data.excludeRepos || []).map((s) => s.toLowerCase()));

// --- AI/ML detection & category guessing for newly-discovered repos ---
const AI_ML_RE = /\b(ai|ml|machine[\s-]?learning|deep[\s-]?learning|llm|gpt|agent|rag|ocr|vision|cv|nlp|neural|model|transformer|pytorch|tensorflow|keras|langchain|langgraph|vlm|diffusion|embedding|dataset|data[\s-]?science|mlops|fine[\s-]?tun\w*|hugging[\s-]?face|notebook)\b/;
const AI_LANGS = new Set(["python", "jupyter notebook"]);

const repoText = (repo) =>
  `${repo.name} ${repo.description || ""} ${(repo.topics || []).join(" ")}`.toLowerCase();

function isAiMl(repo) {
  if (AI_LANGS.has((repo.language || "").toLowerCase())) return true;
  return AI_ML_RE.test(repoText(repo));
}

function guessCategory(repo) {
  const t = repoText(repo);
  if (/\b(agent|langgraph|langchain|llm|gpt|chat|rag|assistant|copilot)\b/.test(t)) return "AI Agents & LLMs";
  if (/\b(ocr|vision|image|document|doc[\s-]?ai|donut|vlm|detection|segmentation|cv)\b/.test(t)) return "Computer Vision / Document AI";
  if (/\b(fastapi|docker|mlops|template|serving|deploy\w*|pipeline|cml|kubernetes|k8s|ci\/cd)\b/.test(t)) return "MLOps & Templates";
  return "ML & Modeling";
}

const headers = { Accept: "application/vnd.github+json", "User-Agent": "portfolio-refresh" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

// Resolve a repo's live GitHub Pages URL (docs/demo site), or null if none is built.
// Only repos with has_pages are queried; transient failures return null (caller keeps any
// existing docs link unless Pages is genuinely off).
async function pagesUrlFor(repo) {
  if (!repo.has_pages) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${userLogin}/${repo.name}/pages`, { headers });
    if (!res.ok) return null;
    const j = await res.json();
    return j.status && j.html_url ? j.html_url : null;
  } catch (_) {
    return null;
  }
}

async function fetchAllRepos(user) {
  const repos = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://api.github.com/users/${user}/repos?per_page=100&page=${page}&sort=updated`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const batch = await res.json();
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

const CURATED = ["source", "category", "libraries", "keywords", "featured", "name", "description", "client", "highlights", "writeup"];

// Refresh an existing entry's auto fields in place. Returns true if found.
// Private entries (client case studies — source:"private", no public repo) are NEVER
// matched here, so the unattended GitHub sync can never overwrite or delete them, even
// if a private slug happens to collide with a real repo name.
function refreshExisting(existing, repo, pagesUrl) {
  const prior = existing.find((p) =>
    (p.source || "github") !== "private" && (p.slug === repo.name || p.repo === repo.html_url));
  if (!prior) return false;
  prior.repo = repo.html_url;
  prior.language = repo.language || null;
  prior.updated = repo.pushed_at || prior.updated || null;          // full ISO; UI slices to date
  prior.created ??= repo.created_at || null;                        // set once; creation never changes
  if (pagesUrl) prior.docs = pagesUrl;                              // live docs/demo page
  else if (!repo.has_pages) delete prior.docs;                      // drop only when Pages is off
  if (!prior.description) prior.description = repo.description || "";
  return true;
}

function makeEntry(repo, category, pagesUrl) {
  return {
    slug: repo.name,
    name: repo.name,
    repo: repo.html_url,
    ...(pagesUrl ? { docs: pagesUrl } : {}),
    description: repo.description || "",
    category,
    language: repo.language || null,
    libraries: [],
    keywords: repo.topics || [],
    featured: false,
    created: repo.created_at || null,
    updated: repo.pushed_at || null,
  };
}

(async () => {
  console.log(`Fetching repos for @${userLogin}…`);
  const repos = await fetchAllRepos(userLogin);
  const visible = repos.filter((r) => (includeForks || !r.fork) && !r.archived);
  console.log(`  ${repos.length} repos, ${visible.length} after dropping ${includeForks ? "" : "forks/"}archived.`);

  const projects = data.projects || (data.projects = []);
  const added = [];
  const skipped = [];

  for (const repo of visible) {
    const pagesUrl = await pagesUrlFor(repo);                            // live docs/demo page, if any
    if (refreshExisting(projects, repo, pagesUrl)) continue;             // already curated → just refreshed
    if (excludeRepos.has(repo.name.toLowerCase())) { skipped.push([repo.name, "excluded"]); continue; }
    const ai = isAiMl(repo);
    if (!ai && !addAll) { skipped.push([repo.name, "not AI/ML"]); continue; }
    const category = ai ? guessCategory(repo) : "Uncategorized";
    projects.push(makeEntry(repo, category, pagesUrl));
    added.push([repo.name, category]);
  }

  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n");

  const lines = [];
  lines.push(`Done. ${projects.length} projects total — ${added.length} added, ${skipped.length} skipped.`);
  if (added.length) lines.push("Added (new AI/ML repos):\n" + added.map(([n, c]) => `  + ${n}  →  ${c}`).join("\n"));
  if (skipped.length) lines.push("Skipped:\n" + skipped.map(([n, why]) => `  - ${n}  (${why})`).join("\n"));
  lines.push(`Curated fields preserved: ${CURATED.join(", ")}.`);
  if (added.length) lines.push("Review new entries in data/projects.json and refine category / keywords / libraries.");
  const out = lines.join("\n");
  console.log(out);

  // Surface the same summary in the GitHub Actions run, when present.
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { writeFileSync(process.env.GITHUB_STEP_SUMMARY, "### Portfolio refresh\n\n```\n" + out + "\n```\n", { flag: "a" }); } catch (_) {}
  }
})().catch((e) => { console.error("refresh failed:", e.message); process.exit(1); });
