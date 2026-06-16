/* =========================================================================
 * Bill of Materials — recipes linking products to component materials
 * ========================================================================= */
(function () {
  let products = [], materials = [], boms = [];

  function load() {
    return Promise.all([DB.getAll("boms"), DB.getAll("products"), DB.getAll("rawMaterials")])
      .then(([b, p, m]) => { boms = b; products = p; materials = m; });
  }

  function matById(id) { return materials.find((m) => m.id === id); }
  function prodById(id) { return products.find((p) => p.id === id); }

  function bomCost(bom) {
    const matCost = (bom.components || []).reduce((a, c) => {
      const m = matById(c.materialId);
      return a + (m ? (m.cost || 0) * (c.qty || 0) : 0);
    }, 0);
    return matCost + (bom.labor || 0) + (bom.overhead || 0);
  }

  function render($view) {
    return load().then(() => {
      const $bar = App.toolbar({
        search: "Search recipes…",
        actions: [{ label: "New BOM", icon: "plus", onClick: () => openForm() }],
      });
      $view.append($bar);
      const $list = $(`<div></div>`); $view.append($list);
      renderList(boms);
      App.wireSearch($view, () => boms.map((b) => ({ ...b, _name: (prodById(b.productId) || {}).name })), renderList);

      function renderList(rows) {
        const columns = [
          { label: "Product", render: (b) => { const p = prodById(b.productId); return `<div class="font-medium text-slate-100">${UI.esc(p ? p.name : "—")}</div><div class="text-xs text-slate-500">${UI.esc(p ? p.sku : "")}</div>`; } },
          { label: "Components", render: (b) => UI.badge((b.components || []).length + " items", "blue") },
          { label: "Output Qty", render: (b) => UI.num(b.outputQty || 1) },
          { label: "Labor", render: (b) => UI.money(b.labor) },
          { label: "Overhead", render: (b) => UI.money(b.overhead) },
          { label: "Unit Cost", render: (b) => `<span class="font-semibold text-slate-100">${UI.money(bomCost(b) / (b.outputQty || 1))}</span>` },
          { label: "", thClass: "text-right", render: () => App.rowActions([
            { act: "apply", icon: "refresh-cw", title: "Apply cost to product" },
            { act: "edit", icon: "pencil", title: "Edit" },
            { act: "del", icon: "trash-2", title: "Delete", cls: "hover:text-rose-400" },
          ]) },
        ];
        $list.empty().append(App.tableCard(columns, rows, { emptyMsg: "No bills of materials yet", emptyIcon: "list-tree" }));
        $list.find("[data-act]").on("click", function () {
          const idx = $(this).closest("tr").index();
          const b = rows[idx], act = $(this).data("act");
          if (act === "edit") openForm(b);
          else if (act === "del") del(b);
          else if (act === "apply") applyCost(b);
        });
        if (window.lucide) lucide.createIcons();
      }

      function reload() { return load().then(() => renderList(boms)); }

      function componentRow(c) {
        c = c || { materialId: "", qty: 1 };
        const opts = materials.map((m) => `<option value="${m.id}" ${m.id === c.materialId ? "selected" : ""}>${UI.esc(m.name)} (${UI.esc(m.unit)})</option>`).join("");
        return `<div class="comp-row grid grid-cols-12 gap-2 items-center">
          <select name="materialId" class="form-input col-span-7"><option value="">— material —</option>${opts}</select>
          <input name="qty" type="number" step="any" value="${c.qty}" class="form-input col-span-3" placeholder="qty" />
          <button class="comp-del btn-soft col-span-2 justify-center py-2 rounded-lg text-rose-400"><i data-lucide="x" class="w-4 h-4"></i></button>
        </div>`;
      }

      function openForm(bom) {
        const b = bom || { components: [{ materialId: "", qty: 1 }], outputQty: 1, labor: 0, overhead: 0 };
        const prodOpts = products.map((p) => ({ value: p.id, label: p.name + " (" + (p.sku || "") + ")" }));
        UI.openModal({
          title: bom ? "Edit Bill of Materials" : "New Bill of Materials",
          size: "max-w-2xl",
          body: `<div class="space-y-4">
            <div class="grid grid-cols-3 gap-3">
              ${UI.field({ name: "productId", label: "Product", type: "select", options: prodOpts, value: b.productId, span: "col-span-1" })}
              ${UI.field({ name: "outputQty", label: "Output qty / batch", type: "number", value: b.outputQty || 1, span: "col-span-1" })}
              <div class="col-span-1 flex items-end"><div class="text-xs text-slate-400">Est. unit cost<div id="bom-cost" class="text-lg font-bold text-emerald-300">—</div></div></div>
            </div>
            <div>
              <div class="flex items-center justify-between mb-2"><label class="text-xs font-medium text-slate-400">Components</label><button id="add-comp" class="btn-soft text-xs px-2 py-1 rounded-md">+ Add component</button></div>
              <div id="comp-list" class="space-y-2">${(b.components || []).map(componentRow).join("")}</div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              ${UI.field({ name: "labor", label: "Labor cost / batch", type: "number", value: b.labor || 0, span: "col-span-1" })}
              ${UI.field({ name: "overhead", label: "Overhead / batch", type: "number", value: b.overhead || 0, span: "col-span-1" })}
            </div>
          </div>`,
          onMount: ($b) => {
            function recalc() {
              const comps = [];
              $b.find(".comp-row").each(function () {
                comps.push({ materialId: $(this).find("[name=materialId]").val(), qty: +$(this).find("[name=qty]").val() || 0 });
              });
              const out = +$b.find("[name=outputQty]").val() || 1;
              const tmp = { components: comps, labor: +$b.find("[name=labor]").val() || 0, overhead: +$b.find("[name=overhead]").val() || 0 };
              $b.find("#bom-cost").text(UI.money(bomCost(tmp) / out));
            }
            $b.on("click", "#add-comp", (e) => { e.preventDefault(); $b.find("#comp-list").append(componentRow()); lucide.createIcons(); recalc(); });
            $b.on("click", ".comp-del", function (e) { e.preventDefault(); $(this).closest(".comp-row").remove(); recalc(); });
            $b.on("input change", "input,select", recalc);
            recalc();
          },
          buttons: [
            { label: "Cancel", class: "btn-ghost" },
            { label: "Save", class: "btn-primary", onClick: ($b) => {
              const f = UI.readForm($b);
              if (!f.productId) { UI.toast("Pick a product", "error"); return false; }
              const comps = [];
              $b.find(".comp-row").each(function () {
                const mid = $(this).find("[name=materialId]").val();
                const q = +$(this).find("[name=qty]").val() || 0;
                if (mid && q > 0) comps.push({ materialId: mid, qty: q });
              });
              if (!comps.length) { UI.toast("Add at least one component", "error"); return false; }
              const rec = Object.assign({}, bom, { productId: f.productId, outputQty: +f.outputQty || 1, labor: +f.labor || 0, overhead: +f.overhead || 0, components: comps });
              return DB.put("boms", rec).then(() => { reload(); UI.toast("BOM saved"); });
            } },
          ],
        });
      }

      function applyCost(b) {
        const p = prodById(b.productId);
        if (!p) return;
        const unit = bomCost(b) / (b.outputQty || 1);
        p.cost = +unit.toFixed(2);
        DB.put("products", p).then(() => UI.toast(`Updated ${p.name} cost to ${UI.money(unit)}`));
      }

      function del(b) {
        UI.confirm("Delete this bill of materials?", { danger: true, confirmLabel: "Delete" }).then((ok) => {
          if (ok) DB.remove("boms", b.id).then(() => { reload(); UI.toast("BOM deleted", "info"); });
        });
      }
    });
  }

  App.register("boms", { title: "Bill of Materials", subtitle: "Define product recipes & costing", render });
  window.BOM = { bomCost, load, get all() { return boms; } };
})();
