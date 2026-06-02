#!/usr/bin/env node
/* ============================================================
   refresh.mjs — sync data/projects.json with the GitHub API.

   - Fetches all public repos for the user.
   - Drops forks and archived repos.
   - UPSERTS into projects.json:
       * preserves curated fields (category, libraries, keywords,
         featured, name, description override) for existing repos
       * refreshes auto fields (language, updated, repo url, and a
         description fallback) every run
       * appends brand-new repos with category "Uncategorized" so
         nothing is ever silently dropped
   - Never deletes entries (so you can keep curated repos even if the
     API filter would hide them). Remove unwanted ones by hand.

   Usage:  node scripts/refresh.mjs [--user <login>] [--include-forks]
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

const data = JSON.parse(readFileSync(DATA_PATH, "utf8"));
const userLogin =
  getArg("--user", null) ||
  (data.profile?.github || "").replace(/.*github\.com\//, "").replace(/\/.*/, "") ||
  "arslankazmi";

const headers = { Accept: "application/vnd.github+json", "User-Agent": "portfolio-refresh" };
if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

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

const CURATED = ["category", "libraries", "keywords", "featured", "name", "description"];

function upsert(existing, repo) {
  const prior = existing.find((p) => p.slug === repo.name || p.repo === repo.html_url);
  const auto = {
    slug: prior?.slug || repo.name,
    repo: repo.html_url,
    language: repo.language || null,
    updated: (repo.pushed_at || "").slice(0, 10) || prior?.updated || null,
  };
  if (prior) {
    // refresh auto fields; keep curated ones as-is
    Object.assign(prior, auto);
    if (!prior.description) prior.description = repo.description || "";
    // surface API topics that aren't yet curated keywords (non-destructive hint)
    return null;
  }
  return {
    slug: repo.name,
    name: repo.name,
    repo: repo.html_url,
    description: repo.description || "",
    category: "Uncategorized",
    language: repo.language || null,
    libraries: [],
    keywords: repo.topics || [],
    featured: false,
    updated: (repo.pushed_at || "").slice(0, 10) || null,
  };
}

(async () => {
  console.log(`Fetching repos for @${userLogin}…`);
  const repos = await fetchAllRepos(userLogin);
  const visible = repos.filter((r) => (includeForks || !r.fork) && !r.archived);
  console.log(`  ${repos.length} repos, ${visible.length} after dropping ${includeForks ? "" : "forks/"}archived.`);

  const projects = data.projects || (data.projects = []);
  let added = 0;
  for (const repo of visible) {
    const created = upsert(projects, repo);
    if (created) { projects.push(created); added++; console.log(`  + new: ${created.slug} (category=Uncategorized)`);}
  }

  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n");
  console.log(`Done. ${projects.length} projects total (${added} new). Curated fields preserved: ${CURATED.join(", ")}.`);
  if (added) console.log("Review new entries in data/projects.json and set their category / keywords / libraries.");
})().catch((e) => { console.error("refresh failed:", e.message); process.exit(1); });
