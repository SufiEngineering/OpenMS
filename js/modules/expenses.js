/* =========================================================================
 * Expenses — simple operating-expense ledger with category breakdown
 * ========================================================================= */
(function () {
  let cache = [];
  const CATEGORIES = ["Rent", "Utilities", "Salaries", "Maintenance", "Supplies", "Transport", "Marketing", "Tax", "Other"];

  function render($view) {
    return DB.getAll("expenses").then((rows) => {
      cache = rows.sort((a, b) => (b.date > a.date ? 1 : -1));
      const $bar = App.toolbar({
        search: "Search expenses…",
        actions: [{ label: "Add Expense", icon: "plus", onClick: () => openForm() }],
      });
      $view.append($bar);

      const total = cache.reduce((a, e) => a + (e.amount || 0), 0);
      const month = new Date().toISOString().slice(0, 7);
      const thisMonth = cache.filter((e) => (e.date || "").startsWith(month)).reduce((a, e) => a + (e.amount || 0), 0);
      const byCat = {};
      cache.forEach((e) => { byCat[e.category || "Other"] = (byCat[e.category || "Other"] || 0) + (e.amount || 0); });
      const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];

      const $g = $(`<div class="grid grid-cols-3 gap-4 mb-4"></div>`);
      $g.append(App.statCard({ label: "Total Expenses", value: UI.money(total), icon: "wallet", tone: "rose" }));
      $g.append(App.statCard({ label: "This Month", value: UI.money(thisMonth), icon: "calendar", tone: "amber" }));
      $g.append(App.statCard({ label: "Top Category", value: topCat ? topCat[0] : "—", icon: "tag", tone: "violet", sub: topCat ? UI.money(topCat[1]) : "" }));
      $view.append($g);

      const $list = $(`<div></div>`); $view.append($list);
      renderList(cache);
      App.wireSearch($view, () => cache, renderList);

      function reload() { return DB.getAll("expenses").then((r) => { cache = r.sort((a, b) => (b.date > a.date ? 1 : -1)); renderList(cache); App.render("expenses"); }); }

      function renderList(rows) {
        const columns = [
          { label: "Date", render: (e) => UI.date(e.date) },
          { label: "Category", render: (e) => UI.badge(e.category || "Other", "violet") },
          { label: "Description", render: (e) => UI.esc(e.description || "—") },
          { label: "Amount", render: (e) => `<span class="font-semibold text-rose-300">${UI.money(e.amount)}</span>` },
          { label: "", thClass: "text-right", render: () => App.rowActions([
            { act: "edit", icon: "pencil", title: "Edit" },
            { act: "del", icon: "trash-2", title: "Delete", cls: "hover:text-rose-400" },
          ]) },
        ];
        $list.empty().append(App.tableCard(columns, rows, { emptyMsg: "No expenses yet", emptyIcon: "wallet" }));
        $list.find("[data-act]").on("click", function () {
          const idx = $(this).closest("tr").index();
          const e = rows[idx], act = $(this).data("act");
          if (act === "edit") openForm(e); else if (act === "del") del(e);
        });
        if (window.lucide) lucide.createIcons();
      }

      function openForm(exp) {
        const e = exp || { date: UI.todayStr(), category: "Other", amount: 0 };
        UI.openModal({
          title: exp ? "Edit Expense" : "Add Expense",
          body: `<div class="grid grid-cols-2 gap-3">
            ${UI.field({ name: "date", label: "Date", type: "date", value: e.date, span: "col-span-1" })}
            ${UI.field({ name: "category", label: "Category", type: "select", options: CATEGORIES.map((c) => ({ value: c, label: c })), value: e.category, span: "col-span-1" })}
            ${UI.field({ name: "description", label: "Description", value: e.description })}
            ${UI.field({ name: "amount", label: "Amount", type: "number", value: e.amount, span: "col-span-1" })}
          </div>`,
          buttons: [
            { label: "Cancel", class: "btn-ghost" },
            { label: "Save", class: "btn-primary", onClick: ($b) => {
              const f = UI.readForm($b);
              if (!(+f.amount > 0)) { UI.toast("Enter an amount", "error"); return false; }
              const rec = Object.assign({}, e, { date: f.date, category: f.category, description: f.description, amount: +f.amount || 0 });
              return DB.put("expenses", rec).then(() => { reload(); UI.toast("Expense saved"); });
            } },
          ],
        });
      }

      function del(e) {
        UI.confirm("Delete this expense?", { danger: true, confirmLabel: "Delete" }).then((ok) => {
          if (ok) DB.remove("expenses", e.id).then(() => { reload(); UI.toast("Expense deleted", "info"); });
        });
      }
    });
  }

  App.register("expenses", { title: "Expenses", subtitle: "Operating expense ledger", render });
})();
