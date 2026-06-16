/* =========================================================================
 * Purchases — purchase orders that increase raw-material stock and track
 * supplier payables and payments.
 * ========================================================================= */
(function () {
  let purchases = [], suppliers = [], materials = [];

  function load() {
    return Promise.all([DB.getAll("purchases"), DB.getAll("suppliers"), DB.getAll("rawMaterials")])
      .then(([p, s, m]) => { purchases = p; suppliers = s; materials = m; });
  }
  const supById = (id) => suppliers.find((s) => s.id === id);
  const matById = (id) => materials.find((m) => m.id === id);

  function nextNumber() {
    const max = purchases.reduce((a, p) => { const n = parseInt((p.number || "").replace(/\D/g, ""), 10); return n > a ? n : a; }, 0);
    return "PO-" + String(max + 1).padStart(4, "0");
  }
  function calc(items) {
    const sub = items.reduce((a, i) => a + (i.qty || 0) * (i.price || 0), 0);
    return { sub, total: sub };
  }

  function render($view) {
    return load().then(() => {
      purchases.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
      const $bar = App.toolbar({
        search: "Search purchases…",
        actions: [{ label: "New Purchase", icon: "plus", onClick: () => openForm() }],
      });
      $view.append($bar);

      const spend = purchases.filter((p) => p.status !== "Cancelled").reduce((a, p) => a + (p.total || 0), 0);
      const paid = purchases.reduce((a, p) => a + (p.paid || 0), 0);
      const $g = $(`<div class="grid grid-cols-3 gap-4 mb-4"></div>`);
      $g.append(App.statCard({ label: "Total Purchases", value: UI.money(spend), icon: "shopping-cart", tone: "violet" }));
      $g.append(App.statCard({ label: "Paid", value: UI.money(paid), icon: "banknote", tone: "sky" }));
      $g.append(App.statCard({ label: "Payable", value: UI.money(spend - paid), icon: "hourglass", tone: "amber" }));
      $view.append($g);

      const $list = $(`<div></div>`); $view.append($list);
      renderList(purchases);
      App.wireSearch($view, () => purchases.map((p) => ({ ...p, _s: (supById(p.supplierId) || {}).name })), renderList);

      function reload() { return load().then(() => { App.render("purchases"); }); }

      function renderList(rows) {
        const columns = [
          { label: "PO #", render: (p) => `<span class="font-mono text-sm text-slate-300">${UI.esc(p.number)}</span>` },
          { label: "Supplier", render: (p) => { const s = supById(p.supplierId); return `<div class="text-slate-100">${UI.esc(s ? s.name : "—")}</div>`; } },
          { label: "Date", render: (p) => UI.date(p.date) },
          { label: "Items", render: (p) => UI.num((p.items || []).length) },
          { label: "Total", render: (p) => `<span class="font-semibold text-slate-100">${UI.money(p.total)}</span>` },
          { label: "Status", render: (p) => UI.badge(p.status, UI.statusTone(p.status)) },
          { label: "", thClass: "text-right", render: (p) => {
            const acts = [{ act: "view", icon: "eye", title: "View" }];
            if (p.status === "Pending") acts.push({ act: "receive", icon: "package-check", title: "Receive stock", cls: "hover:text-emerald-400" });
            if (p.status !== "Cancelled" && (p.paid || 0) < (p.total || 0)) acts.push({ act: "pay", icon: "banknote", title: "Pay", cls: "hover:text-emerald-400" });
            acts.push({ act: "edit", icon: "pencil", title: "Edit" });
            acts.push({ act: "del", icon: "trash-2", title: "Delete", cls: "hover:text-rose-400" });
            return App.rowActions(acts);
          } },
        ];
        $list.empty().append(App.tableCard(columns, rows, { emptyMsg: "No purchases yet", emptyIcon: "shopping-cart" }));
        $list.find("[data-act]").on("click", function () {
          const idx = $(this).closest("tr").index();
          const p = rows[idx], act = $(this).data("act");
          if (act === "view") view(p);
          else if (act === "receive") receive(p);
          else if (act === "pay") pay(p);
          else if (act === "edit") openForm(p);
          else if (act === "del") del(p);
        });
        if (window.lucide) lucide.createIcons();
      }

      function lineRow(it) {
        it = it || { materialId: "", qty: 1, price: 0 };
        const opts = materials.map((m) => `<option value="${m.id}" data-price="${m.cost || 0}" ${m.id === it.materialId ? "selected" : ""}>${UI.esc(m.name)} (${UI.esc(m.unit)})</option>`).join("");
        return `<div class="line-row grid grid-cols-12 gap-2 items-center">
          <select name="materialId" class="form-input col-span-6"><option value="">— material —</option>${opts}</select>
          <input name="qty" type="number" step="any" value="${it.qty}" class="form-input col-span-2" placeholder="qty" />
          <input name="price" type="number" step="any" value="${it.price}" class="form-input col-span-3" placeholder="unit cost" />
          <button class="line-del col-span-1 text-rose-400 flex justify-center"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>`;
      }

      function openForm(po) {
        const p = po || { number: nextNumber(), date: UI.todayStr(), items: [{ materialId: "", qty: 1, price: 0 }], status: "Pending", paid: 0 };
        const supOpts = suppliers.map((s) => ({ value: s.id, label: s.name }));
        UI.openModal({
          title: po ? "Edit Purchase" : "New Purchase",
          size: "max-w-2xl",
          body: `<div class="space-y-4">
            <div class="grid grid-cols-3 gap-3">
              ${UI.field({ name: "number", label: "PO #", value: p.number, span: "col-span-1" })}
              ${UI.field({ name: "supplierId", label: "Supplier", type: "select", options: supOpts, value: p.supplierId, span: "col-span-1" })}
              ${UI.field({ name: "date", label: "Date", type: "date", value: p.date, span: "col-span-1" })}
            </div>
            <div>
              <div class="flex items-center justify-between mb-2"><label class="text-xs font-medium text-slate-400">Line items</label><button id="add-line" class="btn-soft text-xs px-2 py-1 rounded-md">+ Add line</button></div>
              <div id="line-list" class="space-y-2">${(p.items || []).map(lineRow).join("")}</div>
            </div>
            <div class="grid grid-cols-2 gap-3 items-end">
              ${UI.field({ name: "status", label: "Status", type: "select", options: ["Pending", "Received", "Cancelled"].map((x) => ({ value: x, label: x })), value: p.status, span: "col-span-1" })}
              <div class="col-span-1 text-right"><div class="text-lg font-bold text-violet-300">Total <span id="t-total"></span></div><div class="text-xs text-slate-500">Receiving adds to material stock</div></div>
            </div>
          </div>`,
          onMount: ($b) => {
            function gather() { const items = []; $b.find(".line-row").each(function () { items.push({ materialId: $(this).find("[name=materialId]").val(), qty: +$(this).find("[name=qty]").val() || 0, price: +$(this).find("[name=price]").val() || 0 }); }); return items; }
            function recalc() { $b.find("#t-total").text(UI.money(calc(gather()).total)); }
            $b.on("click", "#add-line", (e) => { e.preventDefault(); $b.find("#line-list").append(lineRow()); lucide.createIcons(); recalc(); });
            $b.on("click", ".line-del", function (e) { e.preventDefault(); $(this).closest(".line-row").remove(); recalc(); });
            $b.on("change", "[name=materialId]", function () { const price = $(this).find(":selected").data("price"); const $p = $(this).closest(".line-row").find("[name=price]"); if (price != null && !+$p.val()) $p.val(price); recalc(); });
            $b.on("input change", "input,select", recalc);
            recalc();
          },
          buttons: [
            { label: "Cancel", class: "btn-ghost" },
            { label: "Save", class: "btn-primary", onClick: ($b) => {
              const f = UI.readForm($b);
              if (!f.supplierId) { UI.toast("Pick a supplier", "error"); return false; }
              const items = [];
              $b.find(".line-row").each(function () {
                const mid = $(this).find("[name=materialId]").val();
                const qty = +$(this).find("[name=qty]").val() || 0;
                const price = +$(this).find("[name=price]").val() || 0;
                if (mid && qty > 0) items.push({ materialId: mid, qty, price });
              });
              if (!items.length) { UI.toast("Add at least one item", "error"); return false; }
              const t = calc(items);
              const wasReceived = po && po.received;
              const rec = Object.assign({}, p, { number: f.number, supplierId: f.supplierId, date: f.date, items, status: f.status, sub: t.sub, total: t.total });
              return postPurchase(rec, po, wasReceived).then(() => { reload(); UI.toast("Purchase saved"); });
            } },
          ],
        });
      }

      // Track payable on save; stock only moves on explicit "receive".
      function postPurchase(rec, prev, prevReceived) {
        const tasks = [];
        if (prev) tasks.push(adjustSupplier(prev.supplierId, -((prev.total || 0) - (prev.paid || 0))));
        return Promise.all(tasks).then(() => {
          const after = [];
          if (rec.status !== "Cancelled") after.push(adjustSupplier(rec.supplierId, (rec.total || 0) - (rec.paid || 0)));
          // Preserve received flag; editing a received PO keeps stock as-is.
          rec.received = !!prevReceived || rec.status === "Received";
          after.push(DB.put("purchases", rec));
          return Promise.all(after);
        });
      }

      function adjustSupplier(id, delta) {
        if (!id || !delta) return Promise.resolve();
        return DB.get("suppliers", id).then((s) => { if (!s) return; s.balance = (s.balance || 0) + delta; return DB.put("suppliers", s); });
      }

      function receive(p) {
        if (p.received) { UI.toast("Already received", "info"); return; }
        UI.confirm(`Receive all items from ${p.number} into material stock?`, { confirmLabel: "Receive" }).then((ok) => {
          if (!ok) return;
          const tasks = (p.items || []).map((it) =>
            // Update the material's unit cost to the latest purchase price, then add stock.
            DB.get("rawMaterials", it.materialId).then((m) => { if (m && it.price) { m.cost = it.price; return DB.put("rawMaterials", m); } })
              .then(() => Inventory.adjustStock({ itemId: it.materialId, itemType: "Material", store: "rawMaterials", delta: it.qty, reason: "Purchased", ref: p.number }))
          );
          p.status = "Received"; p.received = true;
          Promise.all(tasks).then(() => DB.put("purchases", p)).then(() => { reload(); UI.toast("Stock received"); });
        });
      }

      function pay(p) {
        const due = (p.total || 0) - (p.paid || 0);
        UI.openModal({
          title: "Pay Supplier — " + p.number,
          size: "max-w-md",
          body: `<div class="space-y-3"><div class="text-sm text-slate-400">Payable: <span class="text-amber-300 font-semibold">${UI.money(due)}</span></div>${UI.field({ name: "amount", label: "Amount paid", type: "number", value: due })}</div>`,
          buttons: [
            { label: "Cancel", class: "btn-ghost" },
            { label: "Record", class: "btn-primary", onClick: ($b) => {
              const amt = Math.min(due, +UI.readForm($b).amount || 0);
              if (amt <= 0) { UI.toast("Enter an amount", "error"); return false; }
              p.paid = (p.paid || 0) + amt;
              return Promise.all([DB.put("purchases", p), adjustSupplier(p.supplierId, -amt)]).then(() => { reload(); UI.toast("Payment recorded"); });
            } },
          ],
        });
      }

      function view(p) {
        const s = supById(p.supplierId);
        const rows = (p.items || []).map((it) => { const m = matById(it.materialId); return `<tr><td class="py-1.5 text-slate-200">${UI.esc(m ? m.name : "—")}</td><td class="text-right text-slate-400">${UI.num(it.qty)}</td><td class="text-right text-slate-400">${UI.money(it.price)}</td><td class="text-right text-slate-200">${UI.money(it.qty * it.price)}</td></tr>`; }).join("");
        UI.openModal({
          title: p.number,
          body: `<div class="space-y-4">
            <div class="flex justify-between text-sm"><div><div class="text-slate-500 text-xs">Supplier</div><div class="text-slate-100 font-medium">${UI.esc(s ? s.name : "—")}</div></div><div class="text-right"><div class="text-slate-500 text-xs">Date</div><div class="text-slate-100">${UI.date(p.date)}</div>${UI.badge(p.status, UI.statusTone(p.status))}</div></div>
            <table class="w-full text-sm"><thead><tr class="text-xs text-slate-500 border-b border-slate-700"><th class="text-left py-1.5">Material</th><th class="text-right">Qty</th><th class="text-right">Cost</th><th class="text-right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
            <div class="border-t border-slate-700 pt-3 text-sm space-y-1">
              <div class="flex justify-between text-lg font-bold text-slate-100"><span>Total</span><span>${UI.money(p.total)}</span></div>
              <div class="flex justify-between text-emerald-300"><span>Paid</span><span>${UI.money(p.paid)}</span></div>
              <div class="flex justify-between text-amber-300"><span>Payable</span><span>${UI.money((p.total || 0) - (p.paid || 0))}</span></div>
            </div>
          </div>`,
          buttons: [{ label: "Close", class: "btn-ghost" }],
        });
      }

      function del(p) {
        UI.confirm(`Delete ${p.number}? Payable will be reversed (received stock is not).`, { danger: true, confirmLabel: "Delete" }).then((ok) => {
          if (!ok) return;
          adjustSupplier(p.supplierId, -((p.total || 0) - (p.paid || 0))).then(() => DB.remove("purchases", p.id)).then(() => { reload(); UI.toast("Purchase deleted", "info"); });
        });
      }
    });
  }

  App.register("purchases", { title: "Purchases", subtitle: "Supplier purchase orders & receiving", render });
})();
