# Project Catalog — portfolio site

A static, dependency-free portfolio that lists my GitHub projects, features the AI / ML /
data-science work, and lets visitors **group by Topic, Library, Keyword, or Language** —
all switched live in the browser, no rebuild. Built to be served from GitHub Pages at
`https://arslankazmi.github.io/portfolio/`.

## How it works

- **`data/projects.json`** is the single source of truth. Each project entry references a
  specific repo and carries hand-curated `keywords` (chosen to be attractive to Upwork
  clients), `libraries`, a `category`, and a `featured` flag.
- **`index.html` + `styles.css` + `app.js`** render everything client-side from that JSON.
- Grouping, search, and keyword filters are pure frontend — switching the grouping just
  re-renders; nothing is fetched again.
- The page opens with a **spotlight band**: a **★ Featured** column (curated `featured: true`
  entries) and a **🆕 Latest** column. Latest is computed, not curated — it picks the project
  with the highest combined `created` + `updated` recency, so it stays correct as repos change.
- `created` / `updated` are stored as full ISO timestamps (the UI shows them as `YYYY-MM-DD`);
  full precision lets Latest break same-day ties between repos.
- A project's `docs` field (when set) is its live GitHub Pages docs/demo URL. Cards link to the
  **docs page by default** and show both **Docs** and **Code** links (the plain table has a Docs
  column too). `refresh.mjs` auto-fills `docs` from each repo's Pages API, so it stays current.

## Run locally

`fetch()` of the JSON is blocked under `file://`, so use a tiny static server:

```bash
cd portfolio
python3 -m http.server 8000
# open http://localhost:8000
```

## Refresh project data from GitHub

```bash
node scripts/refresh.mjs            # uses the login in profile.github
node scripts/refresh.mjs --user arslankazmi
GITHUB_TOKEN=ghp_xxx node scripts/refresh.mjs   # higher rate limit (optional)
```

The script is **curation-aware**:
- **Existing entries** — refreshes auto fields (language, last-updated, repo URL) and
  **preserves** your curated `category`, `libraries`, `keywords`, `featured`, and any
  custom `name`/`description`.
- **New repos** — adds one only if it looks **AI/ML** (Python/Jupyter, or name/description/
  topics matching AI/ML/LLM/CV/data terms) **and** isn't listed in `excludeRepos`. New
  entries get a guessed `category`, topics as `keywords`, and `featured: false` for review.
- Forks and archived repos are excluded by default. Flags: `--include-forks`, and `--all`
  to also add non-AI/ML new repos (as `Uncategorized`).
- Nothing is ever deleted. To hide a repo, add its name to `excludeRepos` in
  `data/projects.json`.

## Auto-update (daily, hands-off)

`.github/workflows/refresh.yml` runs `scripts/refresh.mjs` **daily** (and on the manual
*Run workflow* button), then commits any change to `data/projects.json`. Because Pages
deploys from `main`, that commit publishes the update automatically — newly-created AI/ML
repos show up on the site within a day, no action needed. Refine a new entry's category or
keywords whenever you like by editing `data/projects.json`.

## Editing content

Open `data/projects.json` and edit:
- `profile` — name, tagline, blurb, links (add your LinkedIn URL).
- `categoryOrder` — controls the order of the default (Topic) grouping.
- each project's `keywords` / `libraries` — these power the Keyword/Library groupings,
  the filter chips, and the per-project Upwork tags.

## Deploy

1. Push this folder as the repo `arslankazmi/portfolio`.
2. **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`.**
3. Live at `https://arslankazmi.github.io/portfolio/`.
