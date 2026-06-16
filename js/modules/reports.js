/* =========================================================================
 * Reports — profit & loss, top products, inventory valuation, exports
 * ========================================================================= */
(function () {
  let charts = [];
  function destroy() { charts.forEach((c) => c.destroy()); charts = []; }

  function load() {
    return Promise.all([
      DB.getAll("sales"), DB.getAll("purchases"), DB.getAll("expenses"),
      DB.getAll("products"), DB.getAll("rawMaterials"),
    ]).then(([sales, purchases, expenses, products, materials]) => ({ sales, purchases, expenses, products, materials }));
  }

  function csv(rows) {
    return rows.map((r) => r.map((c) => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\n");
  }
  function download(name, text, type = "text/csv") {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  function render($view) {
    destroy();
    return load().then((d) => {
      const revenue = d.sales.filter((s) => s.status !== "Cancelled").reduce((a, s) => a + (s.total || 0), 0);
      const purchaseSpend = d.purchases.filter((p) => p.status !== "Cancelled").reduce((a, p) => a + (p.total || 0), 0);
      const expenseTotal = d.expenses.reduce((a, e) => a + (e.amount || 0), 0);
      const cogsApprox = d.sales.filter((s) => s.status !== "Cancelled").reduce((a, s) =>
        a + (s.items || []).reduce((b, it) => { const p = d.products.find((x) => x.id === it.productId); return b + (p ? (p.cost || 0) * it.qty : 0); }, 0), 0);
      const grossProfit = revenue - cogsApprox;
      const netProfit = revenue - purchaseSpend - expenseTotal;
      const invValue = d.materials.reduce((a, m) => a + (m.stock || 0) * (m.cost || 0), 0) + d.products.reduce((a, p) => a + (p.stock || 0) * (p.cost || p.price || 0), 0);

      // P&L card
      const $pnl = $(`<div class="card p-5 mb-6">
        <div class="flex items-center justify-between mb-4"><h3 class="text-sm font-semibold text-slate-200">Profit &amp; Loss Summary</h3><button id="exp-pnl" class="btn-soft text-xs px-2 py-1 rounded-md">Export CSV</button></div>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div><div class="text-xs text-slate-500">Revenue</div><div class="text-xl font-bold text-emerald-300">${UI.money(revenue)}</div></div>
          <div><div class="text-xs text-slate-500">Est. COGS</div><div class="text-xl font-bold text-slate-200">${UI.money(cogsApprox)}</div></div>
          <div><div class="text-xs text-slate-500">Gross Profit</div><div class="text-xl font-bold ${grossProfit >= 0 ? "text-emerald-300" : "text-rose-300"}">${UI.money(grossProfit)}</div></div>
          <div><div class="text-xs text-slate-500">Purchases</div><div class="text-xl font-bold text-violet-300">${UI.money(purchaseSpend)}</div></div>
          <div><div class="text-xs text-slate-500">Expenses</div><div class="text-xl font-bold text-rose-300">${UI.money(expenseTotal)}</div></div>
          <div><div class="text-xs text-slate-500">Net Profit</div><div class="text-xl font-bold ${netProfit >= 0 ? "text-emerald-300" : "text-rose-300"}">${UI.money(netProfit)}</div></div>
        </div>
      </div>`);
      $view.append($pnl);

      // charts: top products + expense breakdown
      const $charts = $(`<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div class="card p-5"><h3 class="text-sm font-semibold text-slate-200 mb-3">Top Products by Revenue</h3><div class="chart-box" style="height:280px"><canvas id="rp-top"></canvas></div></div>
        <div class="card p-5"><h3 class="text-sm font-semibold text-slate-200 mb-3">Expenses by Category</h3><div class="chart-box" style="height:280px"><canvas id="rp-exp"></canvas></div></div>
      </div>`);
      $view.append($charts);

      // Inventory valuation table + export
      const invRows = [...d.materials.map((m) => ({ ...m, kind: "Material", val: (m.stock || 0) * (m.cost || 0) })), ...d.products.map((p) => ({ ...p, kind: "Product", val: (p.stock || 0) * (p.cost || p.price || 0) }))]
        .sort((a, b) => b.val - a.val);
      const $inv = $(`<div class="card overflow-hidden">
        <div class="flex items-center justify-between p-4 border-b border-slate-700"><h3 class="text-sm font-semibold text-slate-200">Inventory Valuation — ${UI.money(invValue)}</h3><button id="exp-inv" class="btn-soft text-xs px-2 py-1 rounded-md">Export CSV</button></div>
      </div>`);
      const columns = [
        { label: "Item", render: (r) => `<div class="text-slate-100">${UI.esc(r.name)}</div><div class="text-xs text-slate-500">${UI.esc(r.sku || "")}</div>` },
        { label: "Type", render: (r) => UI.badge(r.kind, r.kind === "Product" ? "blue" : "slate") },
        { label: "Stock", render: (r) => `${UI.num(r.stock)} ${UI.esc(r.unit || "")}` },
        { label: "Unit", render: (r) => UI.money(r.cost || r.price) },
        { label: "Value", render: (r) => `<span class="font-semibold text-slate-100">${UI.money(r.val)}</span>` },
      ];
      $inv.append(App.tableCard(columns, invRows, { emptyMsg: "No inventory" }).children());
      $view.append($inv);

      // wire exports
      $view.find("#exp-pnl").on("click", () => {
        download("profit-loss.csv", csv([["Metric", "Amount"], ["Revenue", revenue], ["COGS", cogsApprox], ["Gross Profit", grossProfit], ["Purchases", purchaseSpend], ["Expenses", expenseTotal], ["Net Profit", netProfit]]));
        UI.toast("Exported P&L");
      });
      $view.find("#exp-inv").on("click", () => {
        download("inventory-valuation.csv", csv([["Item", "SKU", "Type", "Stock", "Unit", "Unit Value", "Total Value"], ...invRows.map((r) => [r.name, r.sku, r.kind, r.stock, r.unit, r.cost || r.price, r.val])]));
        UI.toast("Exported inventory");
      });

      // build charts
      setTimeout(() => {
        Chart.defaults.color = "#94a3b8"; Chart.defaults.font.family = "Inter, sans-serif";
        const grid = "rgba(148,163,184,0.12)";

        // top products
        const prodRev = {};
        d.sales.filter((s) => s.status !== "Cancelled").forEach((s) => (s.items || []).forEach((it) => {
          const p = d.products.find((x) => x.id === it.productId); const name = p ? p.name : "Unknown";
          prodRev[name] = (prodRev[name] || 0) + it.qty * it.price;
        }));
        const top = Object.entries(prodRev).sort((a, b) => b[1] - a[1]).slice(0, 6);
        const c1 = document.getElementById("rp-top");
        if (c1) charts.push(new Chart(c1, { type: "bar", data: { labels: top.map((t) => t[0]), datasets: [{ data: top.map((t) => t[1]), backgroundColor: "#6366f1", borderRadius: 6 }] }, options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { color: grid }, beginAtZero: true }, y: { grid: { display: false } } } } }));

        const byCat = {};
        d.expenses.forEach((e) => (byCat[e.category || "Other"] = (byCat[e.category || "Other"] || 0) + (e.amount || 0)));
        const c2 = document.getElementById("rp-exp");
        if (c2) charts.push(new Chart(c2, { type: "pie", data: { labels: Object.keys(byCat), datasets: [{ data: Object.values(byCat), backgroundColor: ["#6366f1", "#34d399", "#fbbf24", "#fb7185", "#38bdf8", "#a78bfa", "#f472b6", "#fb923c", "#94a3b8"], borderWidth: 0 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { boxWidth: 10, padding: 8 } } } } }));
      }, 0);
    });
  }

  App.register("reports", { title: "Reports", subtitle: "Financial & inventory analytics", render });
})();
