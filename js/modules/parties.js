/* =========================================================================
 * Parties — Customers and Suppliers (shared CRUD)
 * ========================================================================= */
(function () {
  function makeParty(cfg) {
    // cfg: { store, label, icon, txnStore, txnField, balanceHint }
    let cache = [];

    function render($view) {
      return DB.getAll(cfg.store).then((rows) => {
        cache = rows.sort((a, b) => a.name.localeCompare(b.name));
        const $bar = App.toolbar({
          search: "Search " + cfg.label.toLowerCase() + "…",
          actions: [{ label: "Add " + cfg.label, icon: "plus", onClick: () => openForm() }],
        });
        $view.append($bar);
        const $list = $(`<div></div>`); $view.append($list);
        renderList(cache);
        App.wireSearch($view, () => cache, renderList);

        function reload() { return DB.getAll(cfg.store).then((r) => { cache = r.sort((a, b) => a.name.localeCompare(b.name)); renderList(cache); }); }

        function renderList(rows) {
          const totalBal = rows.reduce((a, r) => a + (r.balance || 0), 0);
          const columns = [
            { label: cfg.label, render: (r) => `<div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-semibold">${UI.esc((r.name || "?")[0].toUpperCase())}</div>
                <div><div class="font-medium text-slate-100">${UI.esc(r.name)}</div><div class="text-xs text-slate-500">${UI.esc(r.email || "")}</div></div></div>` },
            { label: "Phone", render: (r) => UI.esc(r.phone || "—") },
            { label: "Address", render: (r) => `<span class="text-slate-400">${UI.esc(r.address || "—")}</span>` },
            { label: cfg.balanceHint, render: (r) => `<span class="font-semibold ${(r.balance || 0) > 0 ? "text-amber-300" : "text-slate-300"}">${UI.money(r.balance)}</span>` },
            { label: "", thClass: "text-right", render: () => App.rowActions([
              { act: "view", icon: "eye", title: "History" },
              { act: "edit", icon: "pencil", title: "Edit" },
              { act: "del", icon: "trash-2", title: "Delete", cls: "hover:text-rose-400" },
            ]) },
          ];
          $list.empty();
          $list.append(`<div class="flex gap-4 mb-3 text-sm text-slate-400"><span>${rows.length} ${cfg.label.toLowerCase()}s</span><span class="text-slate-600">•</span><span>${cfg.balanceHint}: <span class="text-amber-300 font-semibold">${UI.money(totalBal)}</span></span></div>`);
          const $card = App.tableCard(columns, rows, { emptyMsg: "No " + cfg.label.toLowerCase() + "s yet", emptyIcon: cfg.icon });
          $card.find("[data-act]").on("click", function () {
            const idx = $(this).closest("tr").index();
            const r = rows[idx], act = $(this).data("act");
            if (act === "edit") openForm(r);
            else if (act === "del") del(r);
            else if (act === "view") history(r);
          });
          $list.append($card);
          if (window.lucide) lucide.createIcons();
        }

        function openForm(row) {
          const r = row || {};
          UI.openModal({
            title: (row ? "Edit " : "Add ") + cfg.label,
            body: `<div class="grid grid-cols-2 gap-3">
              ${UI.field({ name: "name", label: "Name", value: r.name, required: true })}
              ${UI.field({ name: "phone", label: "Phone", value: r.phone, span: "col-span-1" })}
              ${UI.field({ name: "email", label: "Email", value: r.email, span: "col-span-1" })}
              ${UI.field({ name: "address", label: "Address", value: r.address })}
              ${UI.field({ name: "balance", label: cfg.balanceHint + " (opening)", type: "number", value: r.balance || 0, span: "col-span-1" })}
              ${UI.field({ name: "notes", label: "Notes", value: r.notes, span: "col-span-1" })}
            </div>`,
            buttons: [
              { label: "Cancel", class: "btn-ghost" },
              { label: "Save", class: "btn-primary", onClick: ($b) => {
                const f = UI.readForm($b);
                if (!f.name) { UI.toast("Name is required", "error"); return false; }
                const rec = Object.assign({}, r, { name: f.name, phone: f.phone, email: f.email, address: f.address, balance: +f.balance || 0, notes: f.notes });
                return DB.put(cfg.store, rec).then(() => { reload(); UI.toast(cfg.label + " saved"); });
              } },
            ],
          });
        }

        function del(r) {
          UI.confirm(`Delete "${r.name}"?`, { danger: true, confirmLabel: "Delete" }).then((ok) => {
            if (ok) DB.remove(cfg.store, r.id).then(() => { reload(); UI.toast(cfg.label + " deleted", "info"); });
          });
        }

        function history(r) {
          DB.getAll(cfg.txnStore).then((txns) => {
            const mine = txns.filter((t) => t[cfg.txnField] === r.id).sort((a, b) => (b.date > a.date ? 1 : -1));
            const rowsHtml = mine.length ? mine.map((t) => `<div class="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/50 border border-slate-700/50">
                <div><div class="text-sm text-slate-200">${UI.esc(t.number || t.id.slice(0, 8))}</div><div class="text-xs text-slate-500">${UI.date(t.date)}</div></div>
                <div class="flex items-center gap-3">${UI.badge(t.status || "—", UI.statusTone(t.status))}<span class="font-semibold text-slate-100">${UI.money(t.total)}</span></div>
              </div>`).join("") : `<p class="text-sm text-slate-500 py-4">No transactions yet.</p>`;
            UI.openModal({
              title: r.name + " — History",
              body: `<div class="space-y-3">
                <div class="grid grid-cols-3 gap-3 text-sm">
                  <div class="card p-3"><div class="text-xs text-slate-500">Transactions</div><div class="text-lg font-bold text-slate-100">${mine.length}</div></div>
                  <div class="card p-3"><div class="text-xs text-slate-500">Total</div><div class="text-lg font-bold text-slate-100">${UI.money(mine.reduce((a, t) => a + (t.total || 0), 0))}</div></div>
                  <div class="card p-3"><div class="text-xs text-slate-500">${cfg.balanceHint}</div><div class="text-lg font-bold text-amber-300">${UI.money(r.balance)}</div></div>
                </div>
                <div class="space-y-2 max-h-72 overflow-y-auto">${rowsHtml}</div>
              </div>`,
              buttons: [{ label: "Close", class: "btn-ghost" }],
            });
          });
        }
      });
    }
    return render;
  }

  App.register("customers", { title: "Customers", subtitle: "Manage customer accounts", render: makeParty({ store: "customers", label: "Customer", icon: "users", txnStore: "sales", txnField: "customerId", balanceHint: "Receivable" }) });
  App.register("suppliers", { title: "Suppliers", subtitle: "Manage supplier accounts", render: makeParty({ store: "suppliers", label: "Supplier", icon: "truck", txnStore: "purchases", txnField: "supplierId", balanceHint: "Payable" }) });
})();
