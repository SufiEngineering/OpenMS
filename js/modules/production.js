/* =========================================================================
 * Production — Work Orders that consume materials and produce finished goods
 * ========================================================================= */
(function () {
  let orders = [], products = [], materials = [], boms = [];

  function load() {
    return Promise.all([DB.getAll("workOrders"), DB.getAll("products"), DB.getAll("rawMaterials"), DB.getAll("boms")])
      .then(([o, p, m, b]) => { orders = o; products = p; materials = m; boms = b; });
  }
  const prodById = (id) => products.find((p) => p.id === id);
  const matById = (id) => materials.find((m) => m.id === id);
  const bomFor = (pid) => boms.find((b) => b.productId === pid);

  // Required materials for an order qty, scaled from BOM.
  function requirements(wo) {
    const bom = bomFor(wo.productId);
    if (!bom) return [];
    const factor = (wo.qty || 0) / (bom.outputQty || 1);
    return (bom.components || []).map((c) => ({ materialId: c.materialId, need: c.qty * factor }));
  }

  function nextNumber() {
    const max = orders.reduce((a, o) => { const n = parseInt((o.number || "").replace(/\D/g, ""), 10); return n > a ? n : a; }, 0);
    return "WO-" + String(max + 1).padStart(4, "0");
  }

  function render($view) {
    return load().then(() => {
      orders.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
      const $bar = App.toolbar({
        search: "Search work orders…",
        actions: [{ label: "New Work Order", icon: "plus", onClick: () => openForm() }],
      });
      $view.append($bar);

      const stats = {
        planned: orders.filter((o) => o.status === "Planned").length,
        active: orders.filter((o) => o.status === "In Progress").length,
        done: orders.filter((o) => o.status === "Completed").length,
      };
      const $g = $(`<div class="grid grid-cols-3 gap-4 mb-4"></div>`);
      $g.append(App.statCard({ label: "Planned", value: stats.planned, icon: "clipboard-list", tone: "sky" }));
      $g.append(App.statCard({ label: "In Progress", value: stats.active, icon: "loader", tone: "amber" }));
      $g.append(App.statCard({ label: "Completed", value: stats.done, icon: "check-circle", tone: "emerald" }));
      $view.append($g);

      const $list = $(`<div></div>`); $view.append($list);
      renderList(orders);
      App.wireSearch($view, () => orders.map((o) => ({ ...o, _p: (prodById(o.productId) || {}).name })), renderList);

      function reload() { return load().then(() => { orders.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)); renderList(orders); App.render("production"); }); }

      function renderList(rows) {
        const columns = [
          { label: "WO #", render: (o) => `<span class="font-mono text-sm text-slate-300">${UI.esc(o.number)}</span>` },
          { label: "Product", render: (o) => { const p = prodById(o.productId); return `<div class="font-medium text-slate-100">${UI.esc(p ? p.name : "—")}</div>`; } },
          { label: "Qty", render: (o) => UI.num(o.qty) },
          { label: "Date", render: (o) => UI.date(o.date) },
          { label: "Status", render: (o) => UI.badge(o.status, UI.statusTone(o.status)) },
          { label: "Cost", render: (o) => UI.money(o.cost) },
          { label: "", thClass: "text-right", render: (o) => {
            const acts = [{ act: "view", icon: "eye", title: "Details" }];
            if (o.status === "Planned") acts.push({ act: "start", icon: "play", title: "Start" });
            if (o.status === "In Progress") acts.push({ act: "complete", icon: "check", title: "Complete", cls: "hover:text-emerald-400" });
            if (o.status !== "Completed" && o.status !== "Cancelled") acts.push({ act: "cancel", icon: "x-circle", title: "Cancel", cls: "hover:text-rose-400" });
            acts.push({ act: "del", icon: "trash-2", title: "Delete", cls: "hover:text-rose-400" });
            return App.rowActions(acts);
          } },
        ];
        $list.empty().append(App.tableCard(columns, rows, { emptyMsg: "No work orders yet", emptyIcon: "cog" }));
        $list.find("[data-act]").on("click", function () {
          const idx = $(this).closest("tr").index();
          const o = rows[idx], act = $(this).data("act");
          if (act === "view") details(o);
          else if (act === "start") setStatus(o, "In Progress");
          else if (act === "complete") complete(o);
          else if (act === "cancel") setStatus(o, "Cancelled");
          else if (act === "del") del(o);
        });
        if (window.lucide) lucide.createIcons();
      }

      function openForm(wo) {
        const o = wo || { number: nextNumber(), date: UI.todayStr(), qty: 1, status: "Planned" };
        const prodOpts = products.map((p) => ({ value: p.id, label: p.name }));
        UI.openModal({
          title: wo ? "Edit Work Order" : "New Work Order",
          body: `<div class="grid grid-cols-2 gap-3">
            ${UI.field({ name: "number", label: "WO Number", value: o.number, span: "col-span-1" })}
            ${UI.field({ name: "date", label: "Date", type: "date", value: o.date, span: "col-span-1" })}
            ${UI.field({ name: "productId", label: "Product to make", type: "select", options: prodOpts, value: o.productId })}
            ${UI.field({ name: "qty", label: "Quantity", type: "number", value: o.qty, span: "col-span-1" })}
            ${UI.field({ name: "notes", label: "Notes", value: o.notes, span: "col-span-1" })}
            <div class="col-span-2"><div id="req-preview" class="text-xs text-slate-400"></div></div>
          </div>`,
          onMount: ($b) => {
            function preview() {
              const pid = $b.find("[name=productId]").val();
              const qty = +$b.find("[name=qty]").val() || 0;
              const bom = bomFor(pid);
              if (!bom) { $b.find("#req-preview").html(`<span class="text-amber-400">No BOM for this product — materials won't auto-deduct.</span>`); return; }
              const factor = qty / (bom.outputQty || 1);
              const lines = bom.components.map((c) => { const m = matById(c.materialId); const need = c.qty * factor; const ok = m && (m.stock || 0) >= need; return `<div class="flex justify-between ${ok ? "" : "text-rose-400"}"><span>${UI.esc(m ? m.name : "?")}</span><span>${UI.num(need)} ${UI.esc(m ? m.unit : "")} ${ok ? "" : "(short)"}</span></div>`; }).join("");
              $b.find("#req-preview").html(`<div class="mt-1 p-2 rounded-lg bg-slate-900/60 border border-slate-700/50 space-y-1"><div class="font-medium text-slate-300 mb-1">Material requirement:</div>${lines}</div>`);
            }
            $b.on("change input", "[name=productId],[name=qty]", preview);
            preview();
          },
          buttons: [
            { label: "Cancel", class: "btn-ghost" },
            { label: "Save", class: "btn-primary", onClick: ($b) => {
              const f = UI.readForm($b);
              if (!f.productId) { UI.toast("Pick a product", "error"); return false; }
              const rec = Object.assign({}, o, { number: f.number, date: f.date, productId: f.productId, qty: +f.qty || 0, notes: f.notes });
              return DB.put("workOrders", rec).then(() => { reload(); UI.toast("Work order saved"); });
            } },
          ],
        });
      }

      function setStatus(o, status) {
        o.status = status;
        DB.put("workOrders", o).then(() => { reload(); UI.toast("Work order " + status.toLowerCase()); });
      }

      function complete(o) {
        const reqs = requirements(o);
        const shortages = reqs.filter((r) => { const m = matById(r.materialId); return !m || (m.stock || 0) < r.need; });
        const doComplete = () => {
          // Deduct materials, compute cost, add finished product.
          const bom = bomFor(o.productId);
          let cost = 0;
          const ops = reqs.map((r) => {
            const m = matById(r.materialId);
            if (m) cost += (m.cost || 0) * r.need;
            return Inventory.adjustStock({ itemId: r.materialId, itemType: "Material", store: "rawMaterials", delta: -r.need, reason: "Consumed", ref: o.number });
          });
          if (bom) cost += ((bom.labor || 0) + (bom.overhead || 0)) * ((o.qty || 0) / (bom.outputQty || 1));
          o.status = "Completed";
          o.cost = +cost.toFixed(2);
          o.completedAt = new Date().toISOString();
          return Promise.all(ops)
            .then(() => Inventory.adjustStock({ itemId: o.productId, itemType: "Product", store: "products", delta: o.qty, reason: "Produced", ref: o.number }))
            .then(() => { const p = prodById(o.productId); if (p && o.qty) { p.cost = +(cost / o.qty).toFixed(2); return DB.put("products", p); } })
            .then(() => DB.put("workOrders", o))
            .then(() => { reload(); UI.toast("Production completed — stock updated"); });
        };
        if (shortages.length) {
          UI.confirm(`${shortages.length} material(s) are short of stock. Complete anyway? Stock will not go below zero.`, { confirmLabel: "Complete", danger: true }).then((ok) => { if (ok) doComplete(); });
        } else {
          doComplete();
        }
      }

      function details(o) {
        const p = prodById(o.productId);
        const reqs = requirements(o);
        const reqHtml = reqs.length ? reqs.map((r) => { const m = matById(r.materialId); return `<div class="flex justify-between text-sm"><span class="text-slate-300">${UI.esc(m ? m.name : "?")}</span><span class="text-slate-400">${UI.num(r.need)} ${UI.esc(m ? m.unit : "")}</span></div>`; }).join("") : `<p class="text-sm text-slate-500">No BOM linked.</p>`;
        UI.openModal({
          title: o.number,
          body: `<div class="space-y-3">
            <div class="grid grid-cols-2 gap-3 text-sm">
              <div><span class="text-slate-500">Product:</span> <span class="text-slate-100">${UI.esc(p ? p.name : "—")}</span></div>
              <div><span class="text-slate-500">Quantity:</span> <span class="text-slate-100">${UI.num(o.qty)}</span></div>
              <div><span class="text-slate-500">Date:</span> <span class="text-slate-100">${UI.date(o.date)}</span></div>
              <div><span class="text-slate-500">Status:</span> ${UI.badge(o.status, UI.statusTone(o.status))}</div>
              <div><span class="text-slate-500">Cost:</span> <span class="text-slate-100">${UI.money(o.cost)}</span></div>
            </div>
            <div class="card p-3"><div class="text-xs font-medium text-slate-400 mb-2">Material requirement</div>${reqHtml}</div>
            ${o.notes ? `<div class="text-sm text-slate-400">${UI.esc(o.notes)}</div>` : ""}
          </div>`,
          buttons: [{ label: "Close", class: "btn-ghost" }],
        });
      }

      function del(o) {
        UI.confirm(`Delete ${o.number}? Completed orders won't restore stock.`, { danger: true, confirmLabel: "Delete" }).then((ok) => {
          if (ok) DB.remove("workOrders", o.id).then(() => { reload(); UI.toast("Work order deleted", "info"); });
        });
      }
    });
  }

  App.register("production", { title: "Production", subtitle: "Work orders & material consumption", render });
})();
