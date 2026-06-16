/* =========================================================================
 * Dashboard — KPIs, charts, alerts, recent activity
 * ========================================================================= */
(function () {
  let charts = [];
  function destroyCharts() { charts.forEach((c) => c.destroy()); charts = []; }

  function load() {
    return Promise.all([
      DB.getAll("sales"), DB.getAll("purchases"), DB.getAll("expenses"),
      DB.getAll("products"), DB.getAll("rawMaterials"), DB.getAll("workOrders"),
      DB.getAll("customers"),
    ]).then(([sales, purchases, expenses, products, materials, workOrders, customers]) =>
      ({ sales, purchases, expenses, products, materials, workOrders, customers })
    );
  }

  function monthKey(d) { return (d || "").slice(0, 7); }

  function render($view) {
    destroyCharts();
    return load().then((d) => {
      const s = App.settings();
      const threshold = s.lowStockThreshold || 10;

      const revenue = d.sales.filter((x) => x.status !== "Cancelled").reduce((a, x) => a + (x.total || 0), 0);
      const collected = d.sales.reduce((a, x) => a + (x.paid || 0), 0);
      const outstanding = revenue - collected;
      const purchaseSpend = d.purchases.filter((x) => x.status !== "Cancelled").reduce((a, x) => a + (x.total || 0), 0);
      const expenseTotal = d.expenses.reduce((a, x) => a + (x.amount || 0), 0);
      const profit = revenue - purchaseSpend - expenseTotal;

      const lowStock = [
        ...d.materials.filter((m) => (m.stock || 0) <= (m.reorder || threshold)).map((m) => ({ ...m, kind: "Material" })),
        ...d.products.filter((p) => (p.stock || 0) <= (p.reorder || threshold)).map((p) => ({ ...p, kind: "Product" })),
      ];
      const openWO = d.workOrders.filter((w) => w.status === "Planned" || w.status === "In Progress");
      const inventoryValue =
        d.materials.reduce((a, m) => a + (m.stock || 0) * (m.cost || 0), 0) +
        d.products.reduce((a, p) => a + (p.stock || 0) * (p.cost || p.price || 0), 0);

      const $g = $(`<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"></div>`);
      $g.append(App.statCard({ label: "Revenue", value: UI.money(revenue), icon: "trending-up", tone: "emerald", sub: `${UI.money(outstanding)} outstanding` }));
      $g.append(App.statCard({ label: "Net Profit", value: UI.money(profit), icon: "dollar-sign", tone: profit >= 0 ? "indigo" : "rose", sub: `${UI.money(expenseTotal)} expenses` }));
      $g.append(App.statCard({ label: "Inventory Value", value: UI.money(inventoryValue), icon: "package", tone: "sky", sub: `${d.products.length} products · ${d.materials.length} materials` }));
      $g.append(App.statCard({ label: "Open Work Orders", value: openWO.length, icon: "cog", tone: "amber", sub: `${lowStock.length} low-stock alerts` }));
      $view.append($g);

      // Charts row
      const $charts = $(`
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div class="card p-5 lg:col-span-2">
            <h3 class="text-sm font-semibold text-slate-200 mb-3">Revenue vs Spend (6 months)</h3>
            <div class="chart-box" style="height:260px"><canvas id="chart-trend"></canvas></div>
          </div>
          <div class="card p-5">
            <h3 class="text-sm font-semibold text-slate-200 mb-3">Inventory by Category</h3>
            <div class="chart-box" style="height:260px"><canvas id="chart-cat"></canvas></div>
          </div>
        </div>`);
      $view.append($charts);

      // Bottom row: alerts + recent
      const $bottom = $(`<div class="grid grid-cols-1 lg:grid-cols-2 gap-4"></div>`);

      // Low stock alerts
      const $alerts = $(`<div class="card p-5"></div>`);
      $alerts.append(`<div class="flex items-center justify-between mb-3"><h3 class="text-sm font-semibold text-slate-200">Low Stock Alerts</h3>${UI.badge(lowStock.length + " items", lowStock.length ? "red" : "green")}</div>`);
      if (lowStock.length === 0) {
        $alerts.append(`<p class="text-sm text-slate-500 py-4">All stock levels are healthy. 👍</p>`);
      } else {
        const $list = $(`<div class="space-y-2 max-h-72 overflow-y-auto"></div>`);
        lowStock.slice(0, 12).forEach((item) => {
          $list.append(`<div class="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-700/50">
            <div><div class="text-sm text-slate-200">${UI.esc(item.name)}</div><div class="text-xs text-slate-500">${item.kind} · ${UI.esc(item.sku || "")}</div></div>
            <div class="text-right"><div class="text-sm font-semibold text-rose-300">${UI.num(item.stock)} ${UI.esc(item.unit || "")}</div><div class="text-xs text-slate-500">reorder ${UI.num(item.reorder || threshold)}</div></div>
          </div>`);
        });
        $alerts.append($list);
      }
      $bottom.append($alerts);

      // Recent activity (latest sales + purchases)
      const activity = [
        ...d.sales.map((x) => ({ date: x.date, type: "Sale", label: x.number || "Sale", amount: x.total, tone: "emerald" })),
        ...d.purchases.map((x) => ({ date: x.date, type: "Purchase", label: x.number || "Purchase", amount: -(x.total || 0), tone: "amber" })),
        ...d.expenses.map((x) => ({ date: x.date, type: "Expense", label: x.description || "Expense", amount: -(x.amount || 0), tone: "rose" })),
      ].filter((a) => a.date).sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 10);

      const $recent = $(`<div class="card p-5"></div>`);
      $recent.append(`<h3 class="text-sm font-semibold text-slate-200 mb-3">Recent Activity</h3>`);
      if (activity.length === 0) {
        $recent.append(`<p class="text-sm text-slate-500 py-4">No activity yet.</p>`);
      } else {
        const $list = $(`<div class="space-y-2 max-h-72 overflow-y-auto"></div>`);
        activity.forEach((a) => {
          $list.append(`<div class="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-700/50">
            <div class="flex items-center gap-3">
              ${UI.badge(a.type, a.tone)}
              <div><div class="text-sm text-slate-200">${UI.esc(a.label)}</div><div class="text-xs text-slate-500">${UI.date(a.date)}</div></div>
            </div>
            <div class="text-sm font-semibold ${a.amount >= 0 ? "text-emerald-300" : "text-rose-300"}">${a.amount >= 0 ? "+" : "-"}${UI.money(Math.abs(a.amount))}</div>
          </div>`);
        });
        $recent.append($list);
      }
      $bottom.append($recent);
      $view.append($bottom);

      // Build charts after DOM is in place
      setTimeout(() => buildCharts(d), 0);
    });
  }

  function buildCharts(d) {
    const gridColor = "rgba(148,163,184,0.12)";
    const tick = "#94a3b8";
    Chart.defaults.color = tick;
    Chart.defaults.font.family = "Inter, sans-serif";

    // Trend: last 6 months
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(dt.toISOString().slice(0, 7));
    }
    const label = (m) => new Date(m + "-01").toLocaleDateString(undefined, { month: "short" });
    const rev = months.map((m) => d.sales.filter((x) => monthKeySafe(x.date) === m).reduce((a, x) => a + (x.total || 0), 0));
    const spend = months.map((m) =>
      d.purchases.filter((x) => monthKeySafe(x.date) === m).reduce((a, x) => a + (x.total || 0), 0) +
      d.expenses.filter((x) => monthKeySafe(x.date) === m).reduce((a, x) => a + (x.amount || 0), 0)
    );

    const ctx1 = document.getElementById("chart-trend");
    if (ctx1) {
      charts.push(new Chart(ctx1, {
        type: "line",
        data: {
          labels: months.map(label),
          datasets: [
            { label: "Revenue", data: rev, borderColor: "#34d399", backgroundColor: "rgba(52,211,153,.12)", fill: true, tension: .35 },
            { label: "Spend", data: spend, borderColor: "#fb7185", backgroundColor: "rgba(251,113,133,.12)", fill: true, tension: .35 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 12 } } }, scales: { x: { grid: { color: gridColor } }, y: { grid: { color: gridColor }, beginAtZero: true } } },
      }));
    }

    // Category doughnut
    const catMap = {};
    d.products.forEach((p) => { catMap[p.category || "Other"] = (catMap[p.category || "Other"] || 0) + (p.stock || 0) * (p.cost || p.price || 0); });
    d.materials.forEach((m) => { catMap[m.category || "Other"] = (catMap[m.category || "Other"] || 0) + (m.stock || 0) * (m.cost || 0); });
    const ctx2 = document.getElementById("chart-cat");
    if (ctx2) {
      charts.push(new Chart(ctx2, {
        type: "doughnut",
        data: {
          labels: Object.keys(catMap),
          datasets: [{ data: Object.values(catMap), backgroundColor: ["#6366f1", "#34d399", "#fbbf24", "#fb7185", "#38bdf8", "#a78bfa", "#f472b6"], borderWidth: 0 }],
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { position: "bottom", labels: { boxWidth: 10, padding: 10 } } } },
      }));
    }
  }
  function monthKeySafe(d) { return (d || "").slice(0, 7); }

  App.register("dashboard", { title: "Dashboard", subtitle: "Workshop overview at a glance", render });
})();
