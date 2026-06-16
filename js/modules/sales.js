/* =========================================================================
 * Sales & Invoices — line-item documents that reduce product stock and
 * track customer receivables and payments.
 * ========================================================================= */
(function () {
  let sales = [], customers = [], products = [];

  function load() {
    return Promise.all([DB.getAll("sales"), DB.getAll("customers"), DB.getAll("products")])
      .then(([s, c, p]) => { sales = s; customers = c; products = p; });
  }
  const custById = (id) => customers.find((c) => c.id === id);
  const prodById = (id) => products.find((p) => p.id === id);

  function nextNumber() {
    const max = sales.reduce((a, s) => { const n = parseInt((s.number || "").replace(/\D/g, ""), 10); return n > a ? n : a; }, 0);
    return "INV-" + String(max + 1).padStart(4, "0");
  }

  function calc(items, taxRate) {
    const sub = items.reduce((a, i) => a + (i.qty || 0) * (i.price || 0), 0);
    const tax = sub * (taxRate || 0) / 100;
    return { sub, tax, total: sub + tax };
  }

  function render($view) {
    return load().then(() => {
      sales.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
      const $bar = App.toolbar({
        search: "Search invoices…",
        actions: [{ label: "New Invoice", icon: "plus", onClick: () => openForm() }],
      });
      $view.append($bar);

      const revenue = sales.filter((s) => s.status !== "Cancelled").reduce((a, s) => a + (s.total || 0), 0);
      const collected = sales.reduce((a, s) => a + (s.paid || 0), 0);
      const $g = $(`<div class="grid grid-cols-3 gap-4 mb-4"></div>`);
      $g.append(App.statCard({ label: "Total Sales", value: UI.money(revenue), icon: "receipt", tone: "emerald" }));
      $g.append(App.statCard({ label: "Collected", value: UI.money(collected), icon: "banknote", tone: "sky" }));
      $g.append(App.statCard({ label: "Outstanding", value: UI.money(revenue - collected), icon: "hourglass", tone: "amber" }));
      $view.append($g);

      const $list = $(`<div></div>`); $view.append($list);
      renderList(sales);
      App.wireSearch($view, () => sales.map((s) => ({ ...s, _c: (custById(s.customerId) || {}).name })), renderList);

      function reload() { return load().then(() => { sales.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)); App.render("sales"); }); }

      function renderList(rows) {
        const columns = [
          { label: "Invoice", render: (s) => `<span class="font-mono text-sm text-slate-300">${UI.esc(s.number)}</span>` },
          { label: "Customer", render: (s) => { const c = custById(s.customerId); return `<div class="text-slate-100">${UI.esc(c ? c.name : "Walk-in")}</div>`; } },
          { label: "Date", render: (s) => UI.date(s.date) },
          { label: "Items", render: (s) => UI.num((s.items || []).length) },
          { label: "Total", render: (s) => `<span class="font-semibold text-slate-100">${UI.money(s.total)}</span>` },
          { label: "Paid", render: (s) => UI.money(s.paid) },
          { label: "Status", render: (s) => UI.badge(s.status, UI.statusTone(s.status)) },
          { label: "", thClass: "text-right", render: (s) => {
            const acts = [{ act: "view", icon: "eye", title: "View" }];
            if (s.status !== "Cancelled" && (s.paid || 0) < (s.total || 0)) acts.push({ act: "pay", icon: "banknote", title: "Record payment", cls: "hover:text-emerald-400" });
            acts.push({ act: "edit", icon: "pencil", title: "Edit" });
            acts.push({ act: "del", icon: "trash-2", title: "Delete", cls: "hover:text-rose-400" });
            return App.rowActions(acts);
          } },
        ];
        $list.empty().append(App.tableCard(columns, rows, { emptyMsg: "No invoices yet", emptyIcon: "receipt" }));
        $list.find("[data-act]").on("click", function () {
          const idx = $(this).closest("tr").index();
          const s = rows[idx], act = $(this).data("act");
          if (act === "view") view(s);
          else if (act === "pay") pay(s);
          else if (act === "edit") openForm(s);
          else if (act === "del") del(s);
        });
        if (window.lucide) lucide.createIcons();
      }

      function lineRow(it) {
        it = it || { productId: "", qty: 1, price: 0 };
        const opts = products.map((p) => `<option value="${p.id}" data-price="${p.price || 0}" ${p.id === it.productId ? "selected" : ""}>${UI.esc(p.name)}</option>`).join("");
        return `<div class="line-row grid grid-cols-12 gap-2 items-center">
          <select name="productId" class="form-input col-span-6"><option value="">— product —</option>${opts}</select>
          <input name="qty" type="number" step="any" value="${it.qty}" class="form-input col-span-2" placeholder="qty" />
          <input name="price" type="number" step="any" value="${it.price}" class="form-input col-span-3" placeholder="price" />
          <button class="line-del col-span-1 text-rose-400 flex justify-center"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>`;
      }

      function openForm(sale) {
        const taxRate = (App.settings() || {}).taxRate || 0;
        const s = sale || { number: nextNumber(), date: UI.todayStr(), items: [{ productId: "", qty: 1, price: 0 }], status: "Pending", paid: 0, taxRate };
        const custOpts = [{ value: "", label: "Walk-in customer" }].concat(customers.map((c) => ({ value: c.id, label: c.name })));
        UI.openModal({
          title: sale ? "Edit Invoice" : "New Invoice",
          size: "max-w-2xl",
          body: `<div class="space-y-4">
            <div class="grid grid-cols-3 gap-3">
              ${UI.field({ name: "number", label: "Invoice #", value: s.number, span: "col-span-1" })}
              ${UI.field({ name: "customerId", label: "Customer", type: "select", options: custOpts, value: s.customerId, span: "col-span-1" })}
              ${UI.field({ name: "date", label: "Date", type: "date", value: s.date, span: "col-span-1" })}
            </div>
            <div>
              <div class="flex items-center justify-between mb-2"><label class="text-xs font-medium text-slate-400">Line items</label><button id="add-line" class="btn-soft text-xs px-2 py-1 rounded-md">+ Add line</button></div>
              <div id="line-list" class="space-y-2">${(s.items || []).map(lineRow).join("")}</div>
            </div>
            <div class="grid grid-cols-3 gap-3 items-end">
              ${UI.field({ name: "taxRate", label: "Tax %", type: "number", value: s.taxRate != null ? s.taxRate : taxRate, span: "col-span-1" })}
              ${UI.field({ name: "status", label: "Status", type: "select", options: ["Draft", "Pending", "Paid", "Cancelled"].map((x) => ({ value: x, label: x })), value: s.status, span: "col-span-1" })}
              <div class="col-span-1 text-right">
                <div class="text-xs text-slate-500">Subtotal <span id="t-sub" class="text-slate-300"></span></div>
                <div class="text-xs text-slate-500">Tax <span id="t-tax" class="text-slate-300"></span></div>
                <div class="text-lg font-bold text-emerald-300">Total <span id="t-total"></span></div>
              </div>
            </div>
          </div>`,
          onMount: ($b) => {
            function gather() {
              const items = [];
              $b.find(".line-row").each(function () {
                items.push({ productId: $(this).find("[name=productId]").val(), qty: +$(this).find("[name=qty]").val() || 0, price: +$(this).find("[name=price]").val() || 0 });
              });
              return items;
            }
            function recalc() {
              const t = calc(gather(), +$b.find("[name=taxRate]").val() || 0);
              $b.find("#t-sub").text(UI.money(t.sub)); $b.find("#t-tax").text(UI.money(t.tax)); $b.find("#t-total").text(UI.money(t.total));
            }
            $b.on("click", "#add-line", (e) => { e.preventDefault(); $b.find("#line-list").append(lineRow()); lucide.createIcons(); recalc(); });
            $b.on("click", ".line-del", function (e) { e.preventDefault(); $(this).closest(".line-row").remove(); recalc(); });
            $b.on("change", "[name=productId]", function () { const price = $(this).find(":selected").data("price"); const $p = $(this).closest(".line-row").find("[name=price]"); if (price != null && !+$p.val()) $p.val(price); recalc(); });
            $b.on("input change", "input,select", recalc);
            recalc();
          },
          buttons: [
            { label: "Cancel", class: "btn-ghost" },
            { label: "Save", class: "btn-primary", onClick: ($b) => {
              const f = UI.readForm($b);
              const items = [];
              $b.find(".line-row").each(function () {
                const pid = $(this).find("[name=productId]").val();
                const qty = +$(this).find("[name=qty]").val() || 0;
                const price = +$(this).find("[name=price]").val() || 0;
                if (pid && qty > 0) items.push({ productId: pid, qty, price });
              });
              if (!items.length) { UI.toast("Add at least one line item", "error"); return false; }
              const t = calc(items, +f.taxRate || 0);
              const wasActive = sale && sale.status !== "Cancelled";
              const rec = Object.assign({}, s, { number: f.number, customerId: f.customerId, date: f.date, items, taxRate: +f.taxRate || 0, status: f.status, sub: t.sub, tax: t.tax, total: t.total });
              if (f.status === "Paid") rec.paid = t.total;
              return postSale(rec, sale, wasActive).then(() => { reload(); UI.toast("Invoice saved"); });
            } },
          ],
        });
      }

      // Apply stock & balance deltas. For edits we reverse the old doc first.
      function postSale(rec, prev, prevActive) {
        const tasks = [];
        // Reverse previous stock/balance if this was an active (stock-affecting) invoice.
        if (prev && prevActive) {
          (prev.items || []).forEach((it) => tasks.push(Inventory.adjustStock({ itemId: it.productId, itemType: "Product", store: "products", delta: it.qty, reason: "Invoice reversal", ref: prev.number })));
          tasks.push(adjustCustomer(prev.customerId, -((prev.total || 0) - (prev.paid || 0))));
        }
        return Promise.all(tasks).then(() => {
          const after = [];
          if (rec.status !== "Cancelled" && rec.status !== "Draft") {
            (rec.items || []).forEach((it) => after.push(Inventory.adjustStock({ itemId: it.productId, itemType: "Product", store: "products", delta: -it.qty, reason: "Sold", ref: rec.number })));
            after.push(adjustCustomer(rec.customerId, (rec.total || 0) - (rec.paid || 0)));
          }
          after.push(DB.put("sales", rec));
          return Promise.all(after);
        });
      }

      function adjustCustomer(id, delta) {
        if (!id || !delta) return Promise.resolve();
        return DB.get("customers", id).then((c) => { if (!c) return; c.balance = (c.balance || 0) + delta; return DB.put("customers", c); });
      }

      function pay(s) {
        const due = (s.total || 0) - (s.paid || 0);
        UI.openModal({
          title: "Record Payment — " + s.number,
          size: "max-w-md",
          body: `<div class="space-y-3"><div class="text-sm text-slate-400">Outstanding: <span class="text-amber-300 font-semibold">${UI.money(due)}</span></div>${UI.field({ name: "amount", label: "Amount received", type: "number", value: due })}</div>`,
          buttons: [
            { label: "Cancel", class: "btn-ghost" },
            { label: "Record", class: "btn-primary", onClick: ($b) => {
              const amt = Math.min(due, +UI.readForm($b).amount || 0);
              if (amt <= 0) { UI.toast("Enter an amount", "error"); return false; }
              s.paid = (s.paid || 0) + amt;
              if (s.paid >= (s.total || 0) - 0.001) s.status = "Paid";
              return Promise.all([DB.put("sales", s), adjustCustomer(s.customerId, -amt)]).then(() => { reload(); UI.toast("Payment recorded"); });
            } },
          ],
        });
      }

      function view(s) {
        const c = custById(s.customerId);
        const rows = (s.items || []).map((it) => { const p = prodById(it.productId); return `<tr><td class="py-1.5 text-slate-200">${UI.esc(p ? p.name : "—")}</td><td class="text-right text-slate-400">${UI.num(it.qty)}</td><td class="text-right text-slate-400">${UI.money(it.price)}</td><td class="text-right text-slate-200">${UI.money(it.qty * it.price)}</td></tr>`; }).join("");
        UI.openModal({
          title: s.number,
          body: `<div class="space-y-4">
            <div class="flex justify-between text-sm"><div><div class="text-slate-500 text-xs">Billed to</div><div class="text-slate-100 font-medium">${UI.esc(c ? c.name : "Walk-in")}</div></div><div class="text-right"><div class="text-slate-500 text-xs">Date</div><div class="text-slate-100">${UI.date(s.date)}</div>${UI.badge(s.status, UI.statusTone(s.status))}</div></div>
            <table class="w-full text-sm"><thead><tr class="text-xs text-slate-500 border-b border-slate-700"><th class="text-left py-1.5">Item</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Amount</th></tr></thead><tbody>${rows}</tbody></table>
            <div class="border-t border-slate-700 pt-3 text-sm space-y-1">
              <div class="flex justify-between text-slate-400"><span>Subtotal</span><span>${UI.money(s.sub)}</span></div>
              <div class="flex justify-between text-slate-400"><span>Tax (${UI.num(s.taxRate)}%)</span><span>${UI.money(s.tax)}</span></div>
              <div class="flex justify-between text-lg font-bold text-slate-100"><span>Total</span><span>${UI.money(s.total)}</span></div>
              <div class="flex justify-between text-emerald-300"><span>Paid</span><span>${UI.money(s.paid)}</span></div>
              <div class="flex justify-between text-amber-300"><span>Balance</span><span>${UI.money((s.total || 0) - (s.paid || 0))}</span></div>
            </div>
          </div>`,
          buttons: [{ label: "Print", class: "btn-soft", onClick: () => { window.print(); return false; } }, { label: "Close", class: "btn-ghost" }],
        });
      }

      function del(s) {
        UI.confirm(`Delete ${s.number}? Stock and balances will be reversed.`, { danger: true, confirmLabel: "Delete" }).then((ok) => {
          if (!ok) return;
          const tasks = [];
          if (s.status !== "Cancelled" && s.status !== "Draft") {
            (s.items || []).forEach((it) => tasks.push(Inventory.adjustStock({ itemId: it.productId, itemType: "Product", store: "products", delta: it.qty, reason: "Invoice deleted", ref: s.number })));
            tasks.push(adjustCustomer(s.customerId, -((s.total || 0) - (s.paid || 0))));
          }
          Promise.all(tasks).then(() => DB.remove("sales", s.id)).then(() => { reload(); UI.toast("Invoice deleted", "info"); });
        });
      }
    });
  }

  App.register("sales", { title: "Sales & Invoices", subtitle: "Customer invoices & payments", render });
})();
