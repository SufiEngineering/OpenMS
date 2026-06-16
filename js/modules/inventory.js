/* =========================================================================
 * Inventory — Raw Materials, Finished Products, and Stock Movements
 * Shared engine since materials and products differ only in price/cost fields.
 * ========================================================================= */
window.Inventory = (function () {

  // Log a stock movement and apply the delta to the item.
  function adjustStock({ itemId, itemType, store, delta, reason, ref }) {
    return DB.get(store, itemId).then((item) => {
      if (!item) return;
      item.stock = Math.max(0, (item.stock || 0) + delta);
      return DB.put(store, item).then(() =>
        DB.put("stockMovements", {
          id: DB.uuid(), itemId, itemType, itemName: item.name,
          date: new Date().toISOString().slice(0, 10),
          qty: delta, reason: reason || (delta >= 0 ? "Adjustment in" : "Adjustment out"),
          ref: ref || "", balance: item.stock,
        })
      );
    });
  }

  /* ---- Generic entity (materials/products) ----------------------------- */
  function makeEntity(cfg) {
    // cfg: { store, itemType, valueField:'cost'|'price', valueLabel }
    let cache = [];

    function render($view) {
      return DB.getAll(cfg.store).then((rows) => {
        cache = rows.sort((a, b) => a.name.localeCompare(b.name));
        const $bar = App.toolbar({
          search: "Search " + cfg.itemType.toLowerCase() + "…",
          actions: [{ label: "Add " + cfg.itemType, icon: "plus", onClick: () => openForm() }],
        });
        $view.append($bar);
        const $list = $(`<div></div>`);
        $view.append($list);
        renderList(cache);
        App.wireSearch($view, () => cache, renderList);

        function renderList(rows) {
          const threshold = (App.settings() || {}).lowStockThreshold || 10;
          const columns = [
            { label: "SKU", render: (r) => `<span class="text-slate-400 text-xs font-mono">${UI.esc(r.sku || "—")}</span>` },
            { label: "Name", render: (r) => `<div class="font-medium text-slate-100">${UI.esc(r.name)}</div><div class="text-xs text-slate-500">${UI.esc(r.category || "")}</div>` },
            { label: "Stock", render: (r) => {
              const low = (r.stock || 0) <= (r.reorder || threshold);
              return `<span class="font-semibold ${low ? "text-rose-300" : "text-slate-200"}">${UI.num(r.stock)}</span> <span class="text-xs text-slate-500">${UI.esc(r.unit || "")}</span> ${low ? UI.badge("low", "red") : ""}`;
            } },
            { label: cfg.valueLabel, render: (r) => UI.money(r[cfg.valueField]) },
            { label: "Value", render: (r) => UI.money((r.stock || 0) * (r[cfg.valueField] || 0)) },
            { label: "", thClass: "text-right", render: (r) => App.rowActions([
              { act: "adjust", icon: "arrow-up-down", title: "Adjust stock" },
              { act: "edit", icon: "pencil", title: "Edit" },
              { act: "del", icon: "trash-2", title: "Delete", cls: "hover:text-rose-400" },
            ]) },
          ];
          const totalVal = rows.reduce((a, r) => a + (r.stock || 0) * (r[cfg.valueField] || 0), 0);
          $list.empty();
          $list.append(`<div class="flex gap-4 mb-3 text-sm text-slate-400">
            <span>${rows.length} items</span><span class="text-slate-600">•</span>
            <span>Total value: <span class="text-slate-200 font-semibold">${UI.money(totalVal)}</span></span>
          </div>`);
          const $card = App.tableCard(columns, rows, { emptyMsg: "No " + cfg.itemType.toLowerCase() + " yet", emptyIcon: "package" });
          $card.find("[data-act]").on("click", function () {
            const idx = $(this).closest("tr").index();
            const row = rows[idx];
            const act = $(this).data("act");
            if (act === "edit") openForm(row);
            else if (act === "del") del(row);
            else if (act === "adjust") openAdjust(row);
          });
          $list.append($card);
          if (window.lucide) lucide.createIcons();
        }

        function reload() { return DB.getAll(cfg.store).then((r) => { cache = r.sort((a, b) => a.name.localeCompare(b.name)); renderList(cache); }); }

        function openForm(row) {
          const r = row || {};
          UI.openModal({
            title: (row ? "Edit " : "Add ") + cfg.itemType,
            body: `<div class="grid grid-cols-2 gap-3">
              ${UI.field({ name: "sku", label: "SKU", value: r.sku, span: "col-span-1" })}
              ${UI.field({ name: "category", label: "Category", value: r.category, span: "col-span-1" })}
              ${UI.field({ name: "name", label: "Name", value: r.name, required: true })}
              ${UI.field({ name: "unit", label: "Unit", value: r.unit || "pcs", span: "col-span-1" })}
              ${UI.field({ name: "reorder", label: "Reorder level", type: "number", value: r.reorder || 0, span: "col-span-1" })}
              ${UI.field({ name: "stock", label: "Opening stock", type: "number", value: r.stock || 0, span: "col-span-1", attrs: row ? "disabled" : "" })}
              ${UI.field({ name: cfg.valueField, label: cfg.valueLabel, type: "number", value: r[cfg.valueField] || 0, span: "col-span-1" })}
              ${cfg.store === "products" ? UI.field({ name: "price", label: "Sale price", type: "number", value: r.price || 0, span: "col-span-1" }) : ""}
            </div>`,
            buttons: [
              { label: "Cancel", class: "btn-ghost" },
              { label: "Save", class: "btn-primary", onClick: ($b) => {
                const f = UI.readForm($b);
                if (!f.name) { UI.toast("Name is required", "error"); return false; }
                const rec = Object.assign({}, r, {
                  sku: f.sku, category: f.category, name: f.name, unit: f.unit,
                  reorder: +f.reorder || 0, [cfg.valueField]: +f[cfg.valueField] || 0,
                });
                if (!row) rec.stock = +f.stock || 0;
                if (cfg.store === "products") rec.price = +f.price || 0;
                return DB.put(cfg.store, rec).then(() => { reload(); UI.toast(cfg.itemType + " saved"); });
              } },
            ],
          });
        }

        function openAdjust(row) {
          UI.openModal({
            title: "Adjust Stock — " + row.name,
            size: "max-w-md",
            body: `<div class="space-y-3">
              <div class="text-sm text-slate-400">Current: <span class="text-slate-100 font-semibold">${UI.num(row.stock)} ${UI.esc(row.unit || "")}</span></div>
              <div class="grid grid-cols-2 gap-3">
                ${UI.field({ name: "type", label: "Type", type: "select", options: [{ value: "in", label: "Stock In (+)" }, { value: "out", label: "Stock Out (−)" }], span: "col-span-1" })}
                ${UI.field({ name: "qty", label: "Quantity", type: "number", value: 0, span: "col-span-1" })}
              </div>
              ${UI.field({ name: "reason", label: "Reason / note", value: "" })}
            </div>`,
            buttons: [
              { label: "Cancel", class: "btn-ghost" },
              { label: "Apply", class: "btn-primary", onClick: ($b) => {
                const f = UI.readForm($b);
                const qty = Math.abs(+f.qty || 0);
                if (!qty) { UI.toast("Enter a quantity", "error"); return false; }
                const delta = f.type === "out" ? -qty : qty;
                return adjustStock({ itemId: row.id, itemType: cfg.itemType, store: cfg.store, delta, reason: f.reason })
                  .then(() => { reload(); UI.toast("Stock updated"); });
              } },
            ],
          });
        }

        function del(row) {
          UI.confirm(`Delete "${row.name}"? This cannot be undone.`, { danger: true, confirmLabel: "Delete" }).then((ok) => {
            if (ok) DB.remove(cfg.store, row.id).then(() => { reload(); UI.toast(cfg.itemType + " deleted", "info"); });
          });
        }
      });
    }
    return render;
  }

  /* ---- Stock movements ledger ----------------------------------------- */
  function movementsRender($view) {
    return DB.getAll("stockMovements").then((rows) => {
      rows.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
      let cache = rows;
      const $bar = App.toolbar({
        search: "Search movements…",
        actions: [{ label: "Clear Ledger", icon: "trash-2", class: "btn-soft", onClick: () => {
          UI.confirm("Clear the entire stock movement history?", { danger: true, confirmLabel: "Clear" }).then((ok) => {
            if (ok) DB.clear("stockMovements").then(() => App.render("movements"));
          });
        } }],
      });
      $view.append($bar);
      const $list = $(`<div></div>`); $view.append($list);
      renderList(cache);
      App.wireSearch($view, () => cache, renderList);

      function renderList(rows) {
        const columns = [
          { label: "Date", render: (r) => UI.date(r.date) },
          { label: "Item", render: (r) => `<div class="text-slate-100">${UI.esc(r.itemName || "—")}</div><div class="text-xs text-slate-500">${UI.esc(r.itemType || "")}</div>` },
          { label: "Change", render: (r) => `<span class="font-semibold ${r.qty >= 0 ? "text-emerald-300" : "text-rose-300"}">${r.qty >= 0 ? "+" : ""}${UI.num(r.qty)}</span>` },
          { label: "Balance", render: (r) => UI.num(r.balance) },
          { label: "Reason", render: (r) => UI.esc(r.reason || "") },
          { label: "Ref", render: (r) => `<span class="text-xs text-slate-500">${UI.esc(r.ref || "")}</span>` },
        ];
        $list.empty().append(App.tableCard(columns, rows, { emptyMsg: "No stock movements recorded", emptyIcon: "arrow-left-right" }));
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  App.register("materials", { title: "Raw Materials", subtitle: "Track raw material stock & costs", render: makeEntity({ store: "rawMaterials", itemType: "Material", valueField: "cost", valueLabel: "Unit cost" }) });
  App.register("products", { title: "Products", subtitle: "Finished goods inventory", render: makeEntity({ store: "products", itemType: "Product", valueField: "cost", valueLabel: "Unit cost" }) });
  App.register("movements", { title: "Stock Movements", subtitle: "Full inventory ledger", render: movementsRender });

  return { adjustStock };
})();
