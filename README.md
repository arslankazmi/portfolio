# Project Directory — portfolio site

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

The script **upserts**: it refreshes auto fields (language, last-updated, repo URL) for
existing entries while **preserving** your curated `category`, `libraries`, `keywords`,
`featured`, and any custom `name`/`description`. New repos are appended with
`category: "Uncategorized"` so nothing is silently dropped — review and categorize them.
Forks and archived repos are excluded by default (`--include-forks` to keep forks).

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
