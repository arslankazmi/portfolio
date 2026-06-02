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
  if (p.name) { $("#profile-name").textContent = p.name; document.title = `${p.name} — Project Directory`; }
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

  $("#theme-toggle").addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    $("#theme-toggle .theme-icon").textContent = next === "light" ? "☀" : "☾";
    try { localStorage.setItem("ak-theme", next); } catch (_) {}
  });

  const eraBtn = $("#era-toggle");
  if (eraBtn) eraBtn.addEventListener("click", () =>
    setEra(document.documentElement.getAttribute("data-era") === "90s" ? "" : "90s"));
}

/* ---------------- easter egg: 90s mode ---------------- */
function setEra(era) {
  const root = document.documentElement;
  if (era === "90s") root.setAttribute("data-era", "90s");
  else root.removeAttribute("data-era");
  const btn = $("#era-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", String(era === "90s"));
    btn.textContent = era === "90s" ? "🖥️ back to now" : "💾 90s";
  }
  try { localStorage.setItem("ak-era", era); } catch (_) {}
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

  // Featured strip — only meaningful with no active filters/search.
  const featuredSection = $("#featured-section");
  const noFilter = !state.query && state.activeKeywords.size === 0;
  const featured = all.filter((p) => p.featured);
  if (noFilter && featured.length) {
    featuredSection.hidden = false;
    $("#featured").innerHTML = featured.map((p, i) => card(p, i)).join("");
  } else {
    featuredSection.hidden = true;
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

function card(p, i) {
  const featured = p.featured ? " is-featured" : "";
  const star = p.featured ? `<span class="star" title="Featured">★</span>` : "";
  const lang = p.language
    ? `<span class="lang-pill"><span class="lang-dot"></span>${esc(p.language)}</span>` : "";
  const libs = (p.libraries || [])
    .map((l) => `<span class="tag lib">${esc(l)}</span>`).join("");
  const kws = (p.keywords || [])
    .map((k) => `<span class="tag kw${state.activeKeywords.has(k) ? " active" : ""}" data-kw="${esc(k)}" role="button" tabindex="0">${esc(k)}</span>`).join("");
  const updated = p.updated ? `<span class="updated">updated ${esc(p.updated)}</span>` : "<span></span>";
  const delay = `style="animation-delay:${Math.min(i * 35, 350)}ms"`;

  return `
    <article class="card${featured}" ${delay}>
      <div class="card-head">
        <h3><a href="${esc(p.repo)}" target="_blank" rel="noopener">${esc(p.name)}</a></h3>
        ${star}
      </div>
      <p class="card-desc">${esc(p.description || "")}</p>
      <div class="meta-row">${lang}${libs ? `<span class="tag-group-label">stack</span>${libs}` : ""}</div>
      ${kws ? `<div class="tags">${kws}</div>` : ""}
      <div class="card-foot">
        <a class="repo-link" href="${esc(p.repo)}" target="_blank" rel="noopener">View on GitHub <span aria-hidden="true">→</span></a>
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
    const t = localStorage.getItem("ak-theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
    if (localStorage.getItem("ak-era") === "90s") document.documentElement.setAttribute("data-era", "90s");
  } catch (_) {}
})();

document.addEventListener("DOMContentLoaded", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const icon = $("#theme-toggle .theme-icon");
  if (icon) icon.textContent = cur === "light" ? "☀" : "☾";

  const eraBtn = $("#era-toggle");
  if (eraBtn && document.documentElement.getAttribute("data-era") === "90s") {
    eraBtn.setAttribute("aria-pressed", "true");
    eraBtn.textContent = "🖥️ back to now";
  }
  bumpHitCounter();
  init();
});
