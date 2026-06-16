/* =========================================================================
 * Workshop Manager by Sufi — Page Shell
 * Injects the sidebar + header chrome into each standalone page so the
 * markup is defined once. Nav items are real links to per-module pages.
 * ========================================================================= */
window.Shell = (function () {
  // [route, label, icon, section]
  const NAV = [
    ["dashboard", "Dashboard", "layout-dashboard", ""],
    ["pos", "Point of Sale", "scan-line", "Sell"],
    ["sales", "Sales & Invoices", "receipt", "Sell"],
    ["materials", "Raw Materials", "package", "Inventory"],
    ["products", "Products", "boxes", "Inventory"],
    ["boms", "Bill of Materials", "list-tree", "Inventory"],
    ["movements", "Stock Movements", "arrow-left-right", "Inventory"],
    ["production", "Production", "cog", "Operations"],
    ["purchases", "Purchases", "shopping-cart", "Operations"],
    ["expenses", "Expenses", "wallet", "Operations"],
    ["customers", "Customers", "users", "People & Assets"],
    ["suppliers", "Suppliers", "truck", "People & Assets"],
    ["employees", "Employees", "hard-hat", "People & Assets"],
    ["machines", "Machines", "wrench", "People & Assets"],
    ["reports", "Reports", "bar-chart-3", "Insights"],
    ["settings", "Settings", "settings", "Insights"],
  ];

  function pageFor(route) { return route === "dashboard" ? "index.html" : route + ".html"; }

  function brandMark(s) {
    s = s || (window.App && App.settings()) || {};
    if (s.logo) return `<img src="${s.logo}" alt="logo" class="w-9 h-9 rounded-lg object-cover" />`;
    return `<div class="brand-badge w-9 h-9 rounded-lg flex items-center justify-center">
      <i data-lucide="factory" class="w-5 h-5 text-white"></i>
    </div>`;
  }

  function initial(s) {
    const n = (s && (s.company || s.brandName)) || "Workshop";
    return UI.esc(n.trim().charAt(0).toUpperCase() || "W");
  }

  // Re-apply brand text/logo to an already-built shell (used after a settings save).
  function applyBrand(s) {
    s = s || (window.App && App.settings()) || {};
    const $name = $("#brand-name"), $tag = $("#brand-tagline");
    if ($name.length) $name.text(s.brandName || "Workshop Manager by Sufi");
    if ($tag.length) $tag.text(s.brandTagline || "Workshop Manager");
    const $mark = $("#brand-mark");
    if ($mark.length) { $mark.html(brandMark(s)); if (window.lucide) lucide.createIcons(); }
    $("#hdr-avatar").text(initial(s));
  }

  function build(activeRoute) {
    const s = (window.App && App.settings()) || {};
    let lastSection = null;
    const navHtml = NAV.map(([route, label, icon, section]) => {
      let prefix = "";
      if (section && section !== lastSection) { prefix = `<div class="nav-section">${section}</div>`; lastSection = section; }
      const active = route === activeRoute ? " active" : "";
      return `${prefix}<a class="nav-link${active}" href="${pageFor(route)}"><i data-lucide="${icon}" class="w-4 h-4"></i> ${label}</a>`;
    }).join("");

    const html = `
      <div class="flex h-screen overflow-hidden">
        <aside class="w-64 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
          <a href="index.html" class="flex items-center gap-2.5 px-5 h-16 border-b border-slate-800 no-underline">
            <div id="brand-mark">${brandMark(s)}</div>
            <div>
              <div id="brand-name" class="font-bold text-slate-100 leading-tight">${UI.esc(s.brandName || "Workshop Manager by Sufi")}</div>
              <div id="brand-tagline" class="text-[10px] text-slate-500">${UI.esc(s.brandTagline || "Workshop Manager")}</div>
            </div>
          </a>
          <nav class="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">${navHtml}</nav>
          <div class="px-4 py-3 border-t border-slate-800 text-[11px] text-slate-600">
            <div class="flex items-center gap-2"><i data-lucide="database" class="w-3.5 h-3.5"></i> Local IndexedDB</div>
          </div>
        </aside>

        <div class="flex-1 flex flex-col overflow-hidden">
          <header class="h-16 shrink-0 bg-slate-900/80 backdrop-blur border-b border-slate-800 flex items-center justify-between px-6">
            <div>
              <h1 id="page-title" class="text-lg font-semibold text-slate-100">…</h1>
              <p id="page-subtitle" class="text-xs text-slate-500"></p>
            </div>
            <div class="flex items-center gap-3">
              <div class="relative hidden md:block">
                <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"></i>
                <input id="global-search" placeholder="Quick search…" class="form-input pl-9 w-64" />
              </div>
              <div class="text-right">
                <div id="hdr-company" class="text-sm font-medium text-slate-200">${UI.esc(s.company || "Workshop")}</div>
                <div class="text-[11px] text-slate-500" id="hdr-date"></div>
              </div>
              <div id="hdr-avatar" class="brand-badge w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold">${initial(s)}</div>
            </div>
          </header>
          <main id="view" class="flex-1 overflow-y-auto p-6 anim-fadein"></main>
        </div>
      </div>
      <div id="toast-host" class="fixed top-4 right-4 z-[60] space-y-2"></div>`;

    const root = document.getElementById("app") || document.body;
    root.innerHTML = html;

    $("#hdr-date").text(new Date().toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "long", day: "numeric" }));

    // Global search → navigate to the most relevant page.
    $("#global-search").on("keydown", function (e) {
      if (e.key !== "Enter") return;
      const q = $(this).val().trim().toLowerCase();
      const map = { pos: "pos", checkout: "pos", till: "pos", product: "products", material: "materials", customer: "customers", supplier: "suppliers", sale: "sales", invoice: "sales", purchase: "purchases", expense: "expenses", employee: "employees", machine: "machines", production: "production", order: "production", bom: "boms", report: "reports" };
      const hit = Object.keys(map).find((k) => q.includes(k));
      if (hit) location.href = pageFor(map[hit]);
      else UI.toast("Try: product, customer, sale, purchase…", "info");
    });

    if (window.lucide) lucide.createIcons();
  }

  return { build, applyBrand, pageFor, NAV };
})();
