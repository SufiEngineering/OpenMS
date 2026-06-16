/* =========================================================================
 * People & Assets — Employees and Machines
 * ========================================================================= */
(function () {
  /* ---- Employees ------------------------------------------------------- */
  function employeesRender($view) {
    let cache = [];
    const ROLES = ["Owner", "Manager", "Welder", "Machinist", "Assembler", "Painter", "Helper", "Admin"];
    return DB.getAll("employees").then((rows) => {
      cache = rows.sort((a, b) => a.name.localeCompare(b.name));
      $view.append(App.toolbar({ search: "Search employees…", actions: [{ label: "Add Employee", icon: "plus", onClick: () => openForm() }] }));
      const $list = $(`<div></div>`); $view.append($list);
      renderList(cache);
      App.wireSearch($view, () => cache, renderList);

      function reload() { return DB.getAll("employees").then((r) => { cache = r.sort((a, b) => a.name.localeCompare(b.name)); renderList(cache); }); }

      function renderList(rows) {
        const active = rows.filter((e) => e.status === "Active").length;
        const columns = [
          { label: "Name", render: (e) => `<div class="flex items-center gap-3"><div class="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-semibold">${UI.esc((e.name || "?")[0].toUpperCase())}</div><div><div class="font-medium text-slate-100">${UI.esc(e.name)}</div><div class="text-xs text-slate-500">${UI.esc(e.phone || "")}</div></div></div>` },
          { label: "Role", render: (e) => UI.badge(e.role || "—", "blue") },
          { label: "Wage / hr", render: (e) => UI.money(e.wage) },
          { label: "Joined", render: (e) => UI.date(e.joined) },
          { label: "Status", render: (e) => UI.badge(e.status || "Active", UI.statusTone(e.status)) },
          { label: "", thClass: "text-right", render: () => App.rowActions([{ act: "edit", icon: "pencil", title: "Edit" }, { act: "del", icon: "trash-2", title: "Delete", cls: "hover:text-rose-400" }]) },
        ];
        $list.empty();
        $list.append(`<div class="mb-3 text-sm text-slate-400">${active} active of ${rows.length} employees</div>`);
        const $card = App.tableCard(columns, rows, { emptyMsg: "No employees yet", emptyIcon: "hard-hat" });
        $card.find("[data-act]").on("click", function () { const idx = $(this).closest("tr").index(); const e = rows[idx], act = $(this).data("act"); if (act === "edit") openForm(e); else if (act === "del") del(e); });
        $list.append($card);
        if (window.lucide) lucide.createIcons();
      }

      function openForm(emp) {
        const e = emp || { status: "Active", joined: UI.todayStr(), role: "Helper" };
        UI.openModal({
          title: emp ? "Edit Employee" : "Add Employee",
          body: `<div class="grid grid-cols-2 gap-3">
            ${UI.field({ name: "name", label: "Name", value: e.name, required: true })}
            ${UI.field({ name: "role", label: "Role", type: "select", options: ROLES.map((r) => ({ value: r, label: r })), value: e.role, span: "col-span-1" })}
            ${UI.field({ name: "phone", label: "Phone", value: e.phone, span: "col-span-1" })}
            ${UI.field({ name: "wage", label: "Wage / hr", type: "number", value: e.wage || 0, span: "col-span-1" })}
            ${UI.field({ name: "joined", label: "Joined", type: "date", value: e.joined, span: "col-span-1" })}
            ${UI.field({ name: "status", label: "Status", type: "select", options: ["Active", "Inactive"].map((s) => ({ value: s, label: s })), value: e.status, span: "col-span-1" })}
            ${UI.field({ name: "notes", label: "Notes", value: e.notes, span: "col-span-1" })}
          </div>`,
          buttons: [
            { label: "Cancel", class: "btn-ghost" },
            { label: "Save", class: "btn-primary", onClick: ($b) => {
              const f = UI.readForm($b);
              if (!f.name) { UI.toast("Name is required", "error"); return false; }
              const rec = Object.assign({}, e, { name: f.name, role: f.role, phone: f.phone, wage: +f.wage || 0, joined: f.joined, status: f.status, notes: f.notes });
              return DB.put("employees", rec).then(() => { reload(); UI.toast("Employee saved"); });
            } },
          ],
        });
      }

      function del(e) { UI.confirm(`Delete "${e.name}"?`, { danger: true, confirmLabel: "Delete" }).then((ok) => { if (ok) DB.remove("employees", e.id).then(() => { reload(); UI.toast("Employee deleted", "info"); }); }); }
    });
  }

  /* ---- Machines -------------------------------------------------------- */
  function machinesRender($view) {
    let cache = [];
    const STATUSES = ["Operational", "Maintenance", "Broken", "Idle"];
    const TYPES = ["CNC", "Welding", "Cutting", "Finishing", "Assembly", "Other"];
    return DB.getAll("machines").then((rows) => {
      cache = rows.sort((a, b) => a.name.localeCompare(b.name));
      $view.append(App.toolbar({ search: "Search machines…", actions: [{ label: "Add Machine", icon: "plus", onClick: () => openForm() }] }));

      const opCount = cache.filter((m) => m.status === "Operational").length;
      const maint = cache.filter((m) => m.status === "Maintenance" || m.status === "Broken").length;
      const $g = $(`<div class="grid grid-cols-3 gap-4 mb-4"></div>`);
      $g.append(App.statCard({ label: "Total Machines", value: cache.length, icon: "wrench", tone: "indigo" }));
      $g.append(App.statCard({ label: "Operational", value: opCount, icon: "check-circle", tone: "emerald" }));
      $g.append(App.statCard({ label: "Needs Attention", value: maint, icon: "alert-triangle", tone: "amber" }));
      $view.append($g);

      const $list = $(`<div></div>`); $view.append($list);
      renderList(cache);
      App.wireSearch($view, () => cache, renderList);

      function reload() { return DB.getAll("machines").then((r) => { cache = r.sort((a, b) => a.name.localeCompare(b.name)); renderList(cache); App.render("machines"); }); }

      function renderList(rows) {
        const $grid = $(`<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>`);
        if (!rows.length) { $list.empty().append(App.tableCard([], [], { emptyMsg: "No machines yet", emptyIcon: "wrench" })); if (window.lucide) lucide.createIcons(); return; }
        rows.forEach((m) => {
          const $c = $(`<div class="card p-5">
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3"><div class="w-11 h-11 rounded-xl bg-slate-700 flex items-center justify-center"><i data-lucide="wrench" class="w-5 h-5 text-slate-300"></i></div><div><div class="font-semibold text-slate-100">${UI.esc(m.name)}</div><div class="text-xs text-slate-500">${UI.esc(m.type || "")}</div></div></div>
              ${UI.badge(m.status, UI.statusTone(m.status))}
            </div>
            <div class="text-xs text-slate-400 space-y-1">
              <div class="flex justify-between"><span>Purchased</span><span class="text-slate-300">${UI.date(m.purchased)}</span></div>
              <div class="flex justify-between"><span>Last service</span><span class="text-slate-300">${UI.date(m.lastService)}</span></div>
              ${m.notes ? `<div class="pt-1 text-slate-500">${UI.esc(m.notes)}</div>` : ""}
            </div>
            <div class="flex gap-2 mt-4">
              <button class="m-service btn-soft flex-1 justify-center text-xs py-1.5 rounded-md">Log service</button>
              <button class="m-edit icon-btn"><i data-lucide="pencil" class="w-4 h-4"></i></button>
              <button class="m-del icon-btn hover:text-rose-400"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
          </div>`);
          $c.find(".m-edit").on("click", () => openForm(m));
          $c.find(".m-del").on("click", () => del(m));
          $c.find(".m-service").on("click", () => { m.lastService = UI.todayStr(); m.status = "Operational"; DB.put("machines", m).then(() => { reload(); UI.toast("Service logged"); }); });
          $grid.append($c);
        });
        $list.empty().append($grid);
        if (window.lucide) lucide.createIcons();
      }

      function openForm(mac) {
        const m = mac || { status: "Operational", type: "Other", purchased: UI.todayStr() };
        UI.openModal({
          title: mac ? "Edit Machine" : "Add Machine",
          body: `<div class="grid grid-cols-2 gap-3">
            ${UI.field({ name: "name", label: "Name", value: m.name, required: true })}
            ${UI.field({ name: "type", label: "Type", type: "select", options: TYPES.map((t) => ({ value: t, label: t })), value: m.type, span: "col-span-1" })}
            ${UI.field({ name: "status", label: "Status", type: "select", options: STATUSES.map((s) => ({ value: s, label: s })), value: m.status, span: "col-span-1" })}
            ${UI.field({ name: "purchased", label: "Purchased", type: "date", value: m.purchased, span: "col-span-1" })}
            ${UI.field({ name: "lastService", label: "Last service", type: "date", value: m.lastService, span: "col-span-1" })}
            ${UI.field({ name: "notes", label: "Notes", value: m.notes })}
          </div>`,
          buttons: [
            { label: "Cancel", class: "btn-ghost" },
            { label: "Save", class: "btn-primary", onClick: ($b) => {
              const f = UI.readForm($b);
              if (!f.name) { UI.toast("Name is required", "error"); return false; }
              const rec = Object.assign({}, m, { name: f.name, type: f.type, status: f.status, purchased: f.purchased, lastService: f.lastService, notes: f.notes });
              return DB.put("machines", rec).then(() => { reload(); UI.toast("Machine saved"); });
            } },
          ],
        });
      }

      function del(m) { UI.confirm(`Delete "${m.name}"?`, { danger: true, confirmLabel: "Delete" }).then((ok) => { if (ok) DB.remove("machines", m.id).then(() => { reload(); UI.toast("Machine deleted", "info"); }); }); }
    });
  }

  App.register("employees", { title: "Employees", subtitle: "Workshop staff", render: employeesRender });
  App.register("machines", { title: "Machines", subtitle: "Equipment & maintenance", render: machinesRender });
})();
