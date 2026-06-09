/* ============================================================
   Arslan Kazmi · Project Directory — client-side renderer
   Loads data/projects.json and renders everything in the browser.
   Grouping (category | library | keyword | language) + search +
   keyword filters are all client-side; no rebuild, no server calls.
   ============================================================ */

const GROUP_LABELS = {
  category: "Topic",
  library: "Library",
  keyword: "Keyword",
  language: "Language",
};

const state = {
  data: null,
  groupBy: "category",
  query: "",
  activeKeywords: new Set(),
};

const $ = (sel) => document.querySelector(sel);

/* ---------------- load ---------------- */
async function init() {
  let data;
  try {
    const res = await fetch("./data/projects.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    $("#groups").innerHTML =
      `<p class="empty">Couldn't load project data (${err.message}).<br>
       If you opened this file directly, run a local server: <code>python3 -m http.server</code></p>`;
    return;
  }

  state.data = data;
  state.groupBy = data.defaultGrouping || "category";

  renderProfile(data.profile);
  renderStats(data.projects);
  renderGroupByControl(data.groupings || ["category", "library", "keyword", "language"]);
  wireControls();
  render();
}

/* ---------------- profile / header ---------------- */
function renderProfile(p = {}) {
  if (p.name) { $("#profile-name").textContent = p.name; document.title = `${p.name} — Project Catalog`; }
  if (p.tagline) $("#profile-tagline").textContent = p.tagline;
  if (p.blurb) $("#profile-blurb").textContent = p.blurb;

  const links = [];
  if (p.github) links.push({ label: "GitHub", url: p.github, primary: true, icon: "↗" });
  if (p.email) links.push({ label: "Email", url: `mailto:${p.email}`, icon: "✉" });
  (p.links || []).forEach((l) => { if (l.url) links.push({ label: l.label, url: l.url, icon: "↗" }); });

  $("#profile-links").innerHTML = links
    .map((l) => `<a href="${esc(l.url)}"${l.url.startsWith("http") ? ' target="_blank" rel="noopener"' : ""} class="${l.primary ? "primary" : ""}">${esc(l.label)} <span aria-hidden="true">${l.icon || ""}</span></a>`)
    .join("");

  $("#footer-links").innerHTML = links
    .map((l) => `<a href="${esc(l.url)}"${l.url.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${esc(l.label)}</a>`)
    .join(" · ");
}

function renderStats(projects) {
  const cats = new Set(projects.map((p) => p.category).filter(Boolean));
  const libs = new Set(projects.flatMap((p) => p.libraries || []));
  const stats = [
    { dt: "Projects", dd: projects.length },
    { dt: "Topics", dd: cats.size },
    { dt: "Tools & libraries", dd: libs.size },
  ];
  $("#stats").innerHTML = stats.map((s) => `<div><dt>${s.dt}</dt><dd>${s.dd}</dd></div>`).join("");
}

/* ---------------- group-by control ---------------- */
function renderGroupByControl(groupings) {
  $("#groupby").innerHTML = groupings
    .map((g) => `<button role="tab" data-group="${g}" aria-selected="${g === state.groupBy}">${GROUP_LABELS[g] || g}</button>`)
    .join("");
}

function wireControls() {
  $("#groupby").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-group]");
    if (!btn) return;
    state.groupBy = btn.dataset.group;
    $("#groupby").querySelectorAll("button").forEach((b) =>
      b.setAttribute("aria-selected", String(b.dataset.group === state.groupBy)));
    render();
  });

  let t;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(t);
    const v = e.target.value;
    t = setTimeout(() => { state.query = v.trim().toLowerCase(); render(); }, 110);
  });

  const eraBtn = $("#era-toggle");
  if (eraBtn) eraBtn.addEventListener("click", () =>
    setEra(document.documentElement.getAttribute("data-era") === "90s" ? "" : "90s"));

  const viewBtn = $("#view-toggle");
  if (viewBtn) viewBtn.addEventListener("click", () =>
    setView(document.documentElement.getAttribute("data-view") === "plain" ? "" : "plain"));

  wireCopyKeywords();
}

/* ---------------- view modes (rich / 90s / plain) ----------------
   data-era="90s" (easter egg) and data-view="plain" (raw HTML table)
   are mutually exclusive — turning one on clears the other. */
function syncEraButton(era) {
  const btn = $("#era-toggle");
  if (!btn) return;
  const is90s = (era ?? document.documentElement.getAttribute("data-era")) === "90s";
  btn.setAttribute("aria-pressed", String(is90s));
  btn.textContent = is90s ? "🖥️ back to now" : "💾 90s";
}

function syncViewButton(view) {
  const btn = $("#view-toggle");
  if (!btn) return;
  const plain = (view ?? document.documentElement.getAttribute("data-view")) === "plain";
  btn.setAttribute("aria-pressed", String(plain));
  btn.textContent = plain ? "🖥️ rich view" : "📄 plain";
}

function setEra(era) {
  const root = document.documentElement;
  if (era === "90s") { root.setAttribute("data-era", "90s"); root.removeAttribute("data-view"); }
  else root.removeAttribute("data-era");
  syncEraButton(era);
  syncViewButton("");
  try { localStorage.setItem("ak-era", era); if (era === "90s") localStorage.setItem("ak-view", ""); } catch (_) {}
}

function setView(view) {
  const root = document.documentElement;
  if (view === "plain") { root.setAttribute("data-view", "plain"); root.removeAttribute("data-era"); }
  else root.removeAttribute("data-view");
  syncViewButton(view);
  syncEraButton("");
  try { localStorage.setItem("ak-view", view); if (view === "plain") localStorage.setItem("ak-era", ""); } catch (_) {}
}

/* ---------------- copy all keywords (A–Z, comma-separated) ---------------- */
function allKeywordsSorted() {
  const seen = new Map(); // lowercased -> first-seen original casing
  (state.data?.projects || []).forEach((p) =>
    (p.keywords || []).forEach((k) => {
      const key = k.toLowerCase();
      if (!seen.has(key)) seen.set(key, k);
    }));
  return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function wireCopyKeywords() {
  const btn = $("#copy-keywords");
  if (!btn) return;
  const label = btn.textContent;
  btn.addEventListener("click", async () => {
    const text = allKeywordsSorted().join(", ");
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
      try { // fallback for file:// or older browsers
        const ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.focus(); ta.select();
        ok = document.execCommand("copy"); ta.remove();
      } catch (_) {}
    }
    if (!ok) { try { window.prompt("Copy the keywords:", text); ok = true; } catch (_) {} }
    btn.textContent = ok ? "✓ copied" : "⚠ couldn't copy";
    setTimeout(() => { btn.textContent = label; }, 1500);
  });
}

/* ---------------- latest project (creation date + last commit combined) ----------------
   Combined recency = created + last-commit, as epoch sums. Full ISO timestamps in the
   data break sub-day ties (e.g. two repos created the same day). */
function latestProject() {
  const projects = state.data?.projects || [];
  const score = (p) => (Date.parse(p.created || "") || 0) + (Date.parse(p.updated || "") || 0);
  let best = null, bestScore = -Infinity;
  for (const p of projects) {
    const s = score(p);
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best;
}

/* ---------------- plain view: raw HTML table ---------------- */
function renderPlain() {
  const host = $("#plain-view");
  if (!host || !state.data) return;
  const projects = state.data.projects || [];
  const rows = projects.map((p) => `
      <tr>
        <td><a href="${esc(p.repo)}">${esc(p.name)}</a></td>
        <td>${p.docs ? `<a href="${esc(p.docs)}">docs</a>` : ""}</td>
        <td>${esc(p.description || "")}</td>
        <td>${esc(p.category || "")}</td>
        <td>${esc(p.language || "")}</td>
        <td>${esc((p.libraries || []).join(", "))}</td>
        <td>${esc((p.keywords || []).join(", "))}</td>
        <td>${esc((p.created || "").slice(0, 10))}</td>
        <td>${esc((p.updated || "").slice(0, 10))}</td>
      </tr>`).join("");
  const gh = state.data.profile?.github || "https://github.com/arslankazmi";
  host.innerHTML = `
    <h2>${esc(state.data.profile?.name || "")} — Projects</h2>
    <table border="1" cellpadding="6" cellspacing="0">
      <thead>
        <tr><th>Project (code)</th><th>Docs</th><th>Description</th><th>Topic</th><th>Language</th><th>Libraries</th><th>Keywords</th><th>Created</th><th>Updated</th></tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
    <p><a href="${esc(gh)}">All repositories on GitHub &rarr;</a></p>`;
}

function bumpHitCounter() {
  const el = $("#hit-counter");
  if (!el) return;
  let n = 0;
  try { n = parseInt(localStorage.getItem("ak-hits") || "0", 10) || 0; } catch (_) {}
  n += 1;
  try { localStorage.setItem("ak-hits", String(n)); } catch (_) {}
  el.textContent = String(13370 + n).padStart(6, "0"); // a respectable 90s visitor count
}

/* ---------------- filtering ---------------- */
function matchesFilters(p) {
  // keyword chips (AND across selected)
  for (const kw of state.activeKeywords) {
    if (!(p.keywords || []).map((k) => k.toLowerCase()).includes(kw.toLowerCase())) return false;
  }
  // free-text search across name/desc/keywords/libraries/category/language
  if (state.query) {
    const hay = [p.name, p.description, p.category, p.language,
      ...(p.keywords || []), ...(p.libraries || [])]
      .filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(state.query)) return false;
  }
  return true;
}

/* ---------------- grouping ---------------- */
function buildGroups(projects) {
  const dim = state.groupBy;
  const map = new Map();
  const push = (key, p) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  };

  projects.forEach((p) => {
    if (dim === "library") {
      const libs = p.libraries || [];
      if (libs.length) libs.forEach((l) => push(l, p)); else push("Other", p);
    } else if (dim === "keyword") {
      const kws = p.keywords || [];
      if (kws.length) kws.forEach((k) => push(k, p)); else push("Other", p);
    } else if (dim === "language") {
      push(p.language || "Other / Docs", p);
    } else {
      push(p.category || "Uncategorized", p);
    }
  });

  let keys = [...map.keys()];
  const order = state.data.categoryOrder || [];
  if (dim === "category" && order.length) {
    keys.sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
    });
  } else {
    // most-populated first, then alpha; "Other"-ish buckets last
    keys.sort((a, b) => {
      const oa = /other/i.test(a), ob = /other/i.test(b);
      if (oa !== ob) return oa ? 1 : -1;
      return map.get(b).length - map.get(a).length || a.localeCompare(b);
    });
  }
  return keys.map((k) => ({ key: k, items: map.get(k) }));
}

/* ---------------- render ---------------- */
function render() {
  const all = state.data.projects;
  const filtered = all.filter(matchesFilters);

  renderActiveFilters();

  // Spotlight band (Featured + Latest) — only on the default grouping, with no active filters.
  const spotlight = $("#spotlight");
  const noFilter = !state.query && state.activeKeywords.size === 0;
  const onDefaultGroup = state.groupBy === (state.data.defaultGrouping || "category");
  const featured = all.filter((p) => p.featured);
  const latest = latestProject();
  if (noFilter && onDefaultGroup && (featured.length || latest)) {
    spotlight.hidden = false;
    $("#featured").innerHTML = featured.map((p, i) => card(p, i)).join("");
    $("#latest").innerHTML = latest ? card(latest, 0, { latest: true }) : "";
    $("#latest-section").hidden = !latest;
  } else {
    spotlight.hidden = true;
  }

  const groups = buildGroups(filtered);
  const container = $("#groups");
  $("#empty").hidden = filtered.length !== 0;

  container.innerHTML = groups.map((g) => {
    const cards = g.items.map((p, i) => card(p, i)).join("");
    return `
      <section class="group">
        <div class="group-bar"></div>
        <div class="section-head">
          <h2>${esc(g.key)}</h2>
          <span class="section-count">${g.items.length} project${g.items.length === 1 ? "" : "s"}</span>
        </div>
        <div class="card-grid">${cards}</div>
      </section>`;
  }).join("");

  wireKeywordChips();
  renderPlain();
}

function renderActiveFilters() {
  const el = $("#active-filters");
  if (state.activeKeywords.size === 0) { el.innerHTML = ""; return; }
  const pills = [...state.activeKeywords]
    .map((k) => `<button class="filter-pill" data-kw="${esc(k)}">${esc(k)} <span class="x" aria-hidden="true">×</span></button>`)
    .join("");
  el.innerHTML = pills + `<button class="filter-clear" id="clear-filters">clear all</button>`;
  el.querySelectorAll(".filter-pill").forEach((b) =>
    b.addEventListener("click", () => toggleKeyword(b.dataset.kw)));
  $("#clear-filters").addEventListener("click", () => { state.activeKeywords.clear(); render(); });
}

function card(p, i, opts = {}) {
  const featured = p.featured ? " is-featured" : "";
  const latestCls = opts.latest ? " is-latest" : "";
  const star = p.featured ? `<span class="star" title="Featured">★</span>` : "";
  const newBadge = opts.latest ? `<span class="new-badge" title="Newest project">NEW</span>` : "";
  const docs = p.docs || "";                 // project docs/demo page (GitHub Pages), when deployed
  const primary = docs || p.repo;            // title links to docs when available, else the repo
  const lang = p.language
    ? `<span class="lang-pill"><span class="lang-dot"></span>${esc(p.language)}</span>` : "";
  const libs = (p.libraries || [])
    .map((l) => `<span class="tag lib">${esc(l)}</span>`).join("");
  const kws = (p.keywords || [])
    .map((k) => `<span class="tag kw${state.activeKeywords.has(k) ? " active" : ""}" data-kw="${esc(k)}" role="button" tabindex="0">${esc(k)}</span>`).join("");
  const updated = p.updated ? `<span class="updated">updated ${esc((p.updated).slice(0, 10))}</span>` : "<span></span>";
  const delay = `style="animation-delay:${Math.min(i * 35, 350)}ms"`;

  return `
    <article class="card${featured}${latestCls}" ${delay}>
      <div class="card-head">
        <h3><a href="${esc(primary)}" target="_blank" rel="noopener">${esc(p.name)}</a></h3>
        <span class="badges">${newBadge}${star}</span>
      </div>
      <p class="card-desc">${esc(p.description || "")}</p>
      <div class="meta-row">${lang}${libs ? `<span class="tag-group-label">stack</span>${libs}` : ""}</div>
      ${kws ? `<div class="tags">${kws}</div>` : ""}
      <div class="card-foot">
        <span class="card-links">
          ${docs ? `<a class="docs-link" href="${esc(docs)}" target="_blank" rel="noopener">Docs <span aria-hidden="true">↗</span></a>` : ""}
          <a class="repo-link" href="${esc(p.repo)}" target="_blank" rel="noopener">${docs ? "Code" : "View on GitHub"} <span aria-hidden="true">→</span></a>
        </span>
        ${updated}
      </div>
    </article>`;
}

function wireKeywordChips() {
  document.querySelectorAll(".tag.kw").forEach((chip) => {
    const kw = chip.dataset.kw;
    chip.addEventListener("click", () => toggleKeyword(kw));
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleKeyword(kw); }
    });
  });
}

function toggleKeyword(kw) {
  if (state.activeKeywords.has(kw)) state.activeKeywords.delete(kw);
  else state.activeKeywords.add(kw);
  render();
}

/* ---------------- util ---------------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* restore stored prefs before paint (no flash of the wrong theme/era) */
(function restorePrefs() {
  try {
    const root = document.documentElement;
    // dev theme is dark-only; no light/theme restore. era and view are mutually exclusive.
    if (localStorage.getItem("ak-era") === "90s") root.setAttribute("data-era", "90s");
    if (localStorage.getItem("ak-view") === "plain") {
      root.setAttribute("data-view", "plain");
      root.removeAttribute("data-era");
    }
  } catch (_) {}
})();

document.addEventListener("DOMContentLoaded", () => {
  syncEraButton();
  syncViewButton();
  bumpHitCounter();
  init();
});
