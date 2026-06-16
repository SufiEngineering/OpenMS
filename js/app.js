/* =========================================================================
 * Workshop Manager by Sufi — Application core (multi-page)
 * Each module registers a render function; every HTML page boots exactly one
 * route, derived from its filename. Navigation between modules is real page
 * navigation (handled by links in the shell).
 * ========================================================================= */
window.App = (function () {
  // route -> { title, subtitle, render($view) }
  const routes = {};
  function register(name, def) { routes[name] = def; }

  let _settings = null;
  function settings() { return _settings; }
  function brandName() { return (_settings && _settings.brandName) || "Workshop Manager by Sufi"; }
  function refreshSettings() {
    return DB.getSettings().then((s) => {
      _settings = s;
      UI.setCurrency(s.currency);
      applyBranding(s);
      $("#hdr-company").text(s.company || "Workshop");
      if (window.Shell && Shell.applyBrand) Shell.applyBrand(s);
      return s;
    });
  }

  /* ---- White-label branding ------------------------------------------- */
  // Injects an accent-colour stylesheet so the whole app re-themes from a
  // single setting, and keeps the document title in sync with the brand.
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ""));
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 79, g: 70, b: 229 };
  }
  function applyBranding(s) {
    const accent = s.accent || "#4f46e5";
    const c = hexToRgb(accent);
    const rgba = (a) => `rgba(${c.r},${c.g},${c.b},${a})`;
    let style = document.getElementById("brand-style");
    if (!style) { style = document.createElement("style"); style.id = "brand-style"; document.head.appendChild(style); }
    style.textContent =
      `.btn-primary{background:${accent};}` +
      `.btn-primary:hover{background:${rgba(0.85)};}` +
      `.nav-link.active{background:${rgba(0.18)};color:${accent};}` +
      `.form-input:focus{border-color:${accent};box-shadow:0 0 0 3px ${rgba(0.15)};}` +
      `.brand-badge{background:${accent};}`;
  }

  function pageFor(route) { return (window.Shell ? Shell.pageFor(route) : (route === "dashboard" ? "index.html" : route + ".html")); }
  function go(route) { location.href = pageFor(route); }

  function routeFromPath() {
    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const r = file.replace(/\.html?$/, "");
    return (r === "" || r === "index") ? "dashboard" : r;
  }

  // Render (or re-render) the current page's module into #view.
  function render(route) {
    const def = routes[route];
    const $view = $("#view").empty();
    if (!def) { $view.html(`<div class="text-rose-400 p-6">Unknown page: ${UI.esc(route)}</div>`); return; }
    $("#page-title").text(def.title || route);
    $("#page-subtitle").text(def.subtitle || "");
    document.title = brandName() + " — " + (def.title || route);
    Promise.resolve(def.render($view)).then(() => { if (window.lucide) lucide.createIcons(); })
      .catch((err) => { console.error(err); $view.html(`<div class="text-rose-400 p-6">Error: ${UI.esc(err.message || err)}</div>`); });
  }

  function bootPage(route) {
    route = route || routeFromPath();
    DB.open()
      .then(() => DB.seedIfEmpty())
      .then(refreshSettings)
      .then(() => { Shell.build(route); })
      .then(refreshSettings)
      .then(() => render(route))
      .catch((err) => {
        console.error(err);
        const root = document.getElementById("app") || document.body;
        root.innerHTML = `<div class="text-rose-400 p-6">Failed to initialise: ${UI.esc(err.message || err)}</div>`;
      });
  }

  /* ---- Shared render helpers used across modules ----------------------- */

  function toolbar({ search, actions }) {
    const $bar = $(`<div class="flex flex-wrap items-center justify-between gap-3 mb-4"></div>`);
    if (search) {
      $bar.append(`<div class="relative">
        <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"></i>
        <input class="tb-search form-input pl-9 w-72" placeholder="${UI.esc(search)}" />
      </div>`);
    } else { $bar.append(`<div></div>`); }
    const $right = $(`<div class="flex items-center gap-2"></div>`);
    (actions || []).forEach((a) => {
      const $b = $(`<button class="btn ${a.class || "btn-primary"}">${a.icon ? `<i data-lucide="${a.icon}" class="w-4 h-4"></i>` : ""}${UI.esc(a.label)}</button>`);
      $b.on("click", a.onClick);
      $right.append($b);
    });
    $bar.append($right);
    return $bar;
  }

  function statCard({ label, value, icon, tone = "indigo", sub }) {
    const tones = {
      indigo: "from-indigo-500/20 to-indigo-600/5 text-indigo-300",
      emerald: "from-emerald-500/20 to-emerald-600/5 text-emerald-300",
      amber: "from-amber-500/20 to-amber-600/5 text-amber-300",
      rose: "from-rose-500/20 to-rose-600/5 text-rose-300",
      sky: "from-sky-500/20 to-sky-600/5 text-sky-300",
      violet: "from-violet-500/20 to-violet-600/5 text-violet-300",
    };
    return `<div class="card p-5">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-xs text-slate-400">${UI.esc(label)}</div>
          <div class="text-2xl font-bold text-slate-100 mt-1">${value}</div>
          ${sub ? `<div class="text-xs text-slate-500 mt-1">${sub}</div>` : ""}
        </div>
        <div class="w-11 h-11 rounded-xl bg-gradient-to-br ${tones[tone]} flex items-center justify-center">
          <i data-lucide="${icon}" class="w-5 h-5"></i>
        </div>
      </div>
    </div>`;
  }

  function tableCard(columns, rows, opts = {}) {
    const $card = $(`<div class="card overflow-hidden"></div>`);
    if (rows.length === 0) {
      $card.append(UI.empty(opts.emptyMsg || "No records yet", opts.emptyIcon || "inbox"));
      return $card;
    }
    const head = columns.map((c) => `<th class="${c.thClass || ""}">${UI.esc(c.label)}</th>`).join("");
    const $tableWrap = $(`<div class="overflow-x-auto max-h-[70vh] overflow-y-auto"><table class="data"><thead><tr>${head}</tr></thead><tbody></tbody></table></div>`);
    const $tbody = $tableWrap.find("tbody");
    rows.forEach((row) => {
      const $tr = $("<tr></tr>");
      columns.forEach((c) => {
        const content = c.render ? c.render(row) : UI.esc(row[c.key]);
        $tr.append(`<td class="${c.tdClass || ""}">${content == null ? "" : content}</td>`);
      });
      if (opts.onRowClick) { $tr.addClass("cursor-pointer"); $tr.on("click", (e) => { if (!$(e.target).closest(".no-row").length) opts.onRowClick(row); }); }
      $tbody.append($tr);
    });
    $card.append($tableWrap);
    return $card;
  }

  function rowActions(buttons) {
    return `<div class="no-row flex items-center gap-1 justify-end">` +
      buttons.map((b) => `<button class="icon-btn ${b.cls || ""}" data-act="${b.act}" title="${UI.esc(b.title || "")}"><i data-lucide="${b.icon}" class="w-4 h-4"></i></button>`).join("") +
      `</div>`;
  }

  function wireSearch($view, getRows, renderList) {
    $view.find(".tb-search").on("input", function () {
      const q = $(this).val().toLowerCase();
      const filtered = q ? getRows().filter((r) => JSON.stringify(r).toLowerCase().includes(q)) : getRows();
      renderList(filtered);
    });
  }

  return { register, bootPage, render, go, pageFor, routeFromPath, settings, brandName, refreshSettings, applyBranding, toolbar, statCard, tableCard, rowActions, wireSearch };
})();

$(function () { App.bootPage(); });
