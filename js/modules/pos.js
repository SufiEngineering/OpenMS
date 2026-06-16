/* =========================================================================
 * Point of Sale — fast counter checkout. Tap products to build a cart, take
 * payment, and post a paid sale (reduces product stock, logs the movement,
 * and records the invoice so it flows into Sales, Reports and the Dashboard).
 * ========================================================================= */
(function () {
  let products = [], customers = [], sales = [];
  let cart = []; // [{ productId, name, price, qty }]

  function load() {
    return Promise.all([DB.getAll("products"), DB.getAll("customers"), DB.getAll("sales")])
      .then(([p, c, s]) => { products = p.sort((a, b) => a.name.localeCompare(b.name)); customers = c; sales = s; });
  }

  function nextNumber() {
    const max = sales.reduce((a, s) => { const n = parseInt((s.number || "").replace(/\D/g, ""), 10); return n > a ? n : a; }, 0);
    return "POS-" + String(max + 1).padStart(4, "0");
  }

  function calc(taxRate) {
    const sub = cart.reduce((a, i) => a + i.qty * i.price, 0);
    const tax = sub * (taxRate || 0) / 100;
    return { sub, tax, total: sub + tax };
  }

  function render($view) {
    cart = [];
    return load().then(() => {
      const taxRate = (App.settings() || {}).taxRate || 0;

      const $layout = $(`<div class="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-7rem)]">
        <!-- Product picker -->
        <div class="lg:col-span-2 flex flex-col min-h-0">
          <div class="relative mb-3">
            <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"></i>
            <input id="pos-search" class="form-input pl-9" placeholder="Search products by name or SKU…" autocomplete="off" />
          </div>
          <div id="pos-grid" class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 overflow-y-auto pr-1 flex-1 content-start"></div>
        </div>
        <!-- Cart / ticket -->
        <div class="card flex flex-col min-h-0">
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h3 class="text-sm font-semibold text-slate-100 flex items-center gap-2"><i data-lucide="shopping-cart" class="w-4 h-4"></i> Current Sale</h3>
            <button id="pos-clear" class="icon-btn" title="Clear sale"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
          </div>
          <div class="px-4 pt-3">
            <label class="block text-xs font-medium text-slate-400 mb-1">Customer</label>
            <select id="pos-customer" class="form-input"></select>
          </div>
          <div id="pos-cart" class="flex-1 overflow-y-auto px-4 py-3 space-y-2"></div>
          <div class="border-t border-slate-700 px-4 py-3 space-y-1 text-sm">
            <div class="flex justify-between text-slate-400"><span>Subtotal</span><span id="pos-sub">—</span></div>
            <div class="flex justify-between text-slate-400"><span>Tax (<span id="pos-taxrate">${UI.num(taxRate)}</span>%)</span><span id="pos-tax">—</span></div>
            <div class="flex justify-between text-lg font-bold text-slate-100 pt-1"><span>Total</span><span id="pos-total">—</span></div>
            <button id="pos-charge" class="btn btn-primary w-full justify-center mt-2 py-2.5"><i data-lucide="credit-card" class="w-4 h-4"></i> Charge</button>
          </div>
        </div>
      </div>`);
      $view.append($layout);

      // Customer dropdown (walk-in default)
      const $cust = $layout.find("#pos-customer");
      $cust.append(`<option value="">Walk-in customer</option>`);
      customers.forEach((c) => $cust.append(`<option value="${c.id}">${UI.esc(c.name)}</option>`));

      renderGrid(products);
      renderCart();

      $layout.find("#pos-search").on("input", function () {
        const q = $(this).val().toLowerCase().trim();
        const rows = q ? products.filter((p) => (p.name + " " + (p.sku || "")).toLowerCase().includes(q)) : products;
        renderGrid(rows);
      });
      $layout.find("#pos-clear").on("click", () => { cart = []; renderCart(); });
      $layout.find("#pos-charge").on("click", () => charge());

      function renderGrid(rows) {
        const $grid = $layout.find("#pos-grid").empty();
        if (!rows.length) { $grid.append(`<div class="col-span-full">${UI.empty("No products found", "package")}</div>`); if (window.lucide) lucide.createIcons(); return; }
        rows.forEach((p) => {
          const out = (p.stock || 0) <= 0;
          const $c = $(`<button class="card p-3 text-left hover:border-slate-500 transition disabled:opacity-40 disabled:cursor-not-allowed flex flex-col gap-1" ${out ? "disabled" : ""}>
            <div class="font-medium text-slate-100 text-sm leading-tight line-clamp-2">${UI.esc(p.name)}</div>
            <div class="text-xs text-slate-500 font-mono">${UI.esc(p.sku || "—")}</div>
            <div class="flex items-center justify-between mt-1">
              <span class="font-semibold text-emerald-300">${UI.money(p.price)}</span>
              <span class="text-[11px] ${out ? "text-rose-400" : "text-slate-500"}">${out ? "out" : UI.num(p.stock) + " " + UI.esc(p.unit || "")}</span>
            </div>
          </button>`);
          $c.on("click", () => addToCart(p));
          $grid.append($c);
        });
        if (window.lucide) lucide.createIcons();
      }

      function addToCart(p) {
        const line = cart.find((l) => l.productId === p.id);
        const inStock = p.stock || 0;
        const current = line ? line.qty : 0;
        if (current + 1 > inStock) { UI.toast("Only " + UI.num(inStock) + " in stock", "warn"); return; }
        if (line) line.qty += 1;
        else cart.push({ productId: p.id, name: p.name, price: p.price || 0, qty: 1, stock: inStock });
        renderCart();
      }

      function setQty(productId, qty) {
        const line = cart.find((l) => l.productId === productId);
        if (!line) return;
        qty = Math.max(0, qty);
        if (qty > line.stock) { UI.toast("Only " + UI.num(line.stock) + " in stock", "warn"); qty = line.stock; }
        if (qty === 0) cart = cart.filter((l) => l.productId !== productId);
        else line.qty = qty;
        renderCart();
      }

      function renderCart() {
        const $c = $layout.find("#pos-cart").empty();
        if (!cart.length) {
          $c.append(`<div class="h-full flex flex-col items-center justify-center text-slate-600 text-sm py-10"><i data-lucide="scan-line" class="w-10 h-10 mb-2 opacity-50"></i>Tap products to add them</div>`);
        } else {
          cart.forEach((l) => {
            const $row = $(`<div class="flex items-center gap-2">
              <div class="flex-1 min-w-0">
                <div class="text-sm text-slate-100 truncate">${UI.esc(l.name)}</div>
                <div class="text-xs text-slate-500">${UI.money(l.price)} each</div>
              </div>
              <div class="flex items-center gap-1">
                <button class="icon-btn dec" title="Less"><i data-lucide="minus" class="w-3.5 h-3.5"></i></button>
                <input class="qty form-input w-12 text-center px-1 py-1" value="${l.qty}" inputmode="numeric" />
                <button class="icon-btn inc" title="More"><i data-lucide="plus" class="w-3.5 h-3.5"></i></button>
              </div>
              <div class="w-20 text-right text-sm font-semibold text-slate-200">${UI.money(l.qty * l.price)}</div>
            </div>`);
            $row.find(".dec").on("click", () => setQty(l.productId, l.qty - 1));
            $row.find(".inc").on("click", () => setQty(l.productId, l.qty + 1));
            $row.find(".qty").on("change", function () { setQty(l.productId, parseInt($(this).val(), 10) || 0); });
            $c.append($row);
          });
        }
        const t = calc(taxRate);
        $layout.find("#pos-sub").text(UI.money(t.sub));
        $layout.find("#pos-tax").text(UI.money(t.tax));
        $layout.find("#pos-total").text(UI.money(t.total));
        $layout.find("#pos-charge").prop("disabled", !cart.length);
        if (window.lucide) lucide.createIcons();
      }

      function charge() {
        if (!cart.length) { UI.toast("Cart is empty", "error"); return; }
        const t = calc(taxRate);
        const due = t.total;
        UI.openModal({
          title: "Take Payment",
          size: "max-w-md",
          body: `<div class="space-y-3">
            <div class="flex justify-between text-lg"><span class="text-slate-400">Total due</span><span class="font-bold text-emerald-300">${UI.money(due)}</span></div>
            ${UI.field({ name: "method", label: "Payment method", type: "select", options: ["Cash", "Card", "Bank Transfer", "Other"].map((x) => ({ value: x, label: x })) })}
            ${UI.field({ name: "tendered", label: "Amount tendered", type: "number", value: due.toFixed(2) })}
            <div class="flex justify-between text-sm"><span class="text-slate-400">Change due</span><span id="pos-change" class="font-semibold text-slate-200">${UI.money(0)}</span></div>
          </div>`,
          onMount: ($b) => {
            $b.on("input", "[name=tendered]", function () {
              const change = Math.max(0, (+$(this).val() || 0) - due);
              $b.find("#pos-change").text(UI.money(change));
            });
          },
          buttons: [
            { label: "Cancel", class: "btn-ghost" },
            { label: "Complete Sale", class: "btn-primary", onClick: ($b) => {
              const f = UI.readForm($b);
              const tendered = +f.tendered || 0;
              if (tendered < due - 0.001) { UI.toast("Amount tendered is less than total", "error"); return false; }
              return postSale(f.method, t).then((rec) => { UI.toast("Sale completed — " + rec.number); receipt(rec, f.method, tendered); cart = []; load().then(() => { renderGrid(products); renderCart(); }); });
            } },
          ],
        });
      }

      // Post a fully-paid sale: reduce stock, log movements, save the invoice.
      function postSale(method, t) {
        const number = nextNumber();
        const items = cart.map((l) => ({ productId: l.productId, qty: l.qty, price: l.price }));
        const rec = {
          id: DB.uuid(), number, customerId: $cust.val() || "", date: UI.todayStr(),
          items, taxRate, sub: t.sub, tax: t.tax, total: t.total, paid: t.total,
          status: "Paid", channel: "POS", paymentMethod: method,
        };
        const tasks = cart.map((l) => Inventory.adjustStock({ itemId: l.productId, itemType: "Product", store: "products", delta: -l.qty, reason: "POS sale", ref: number }));
        return Promise.all(tasks).then(() => DB.put("sales", rec)).then(() => rec);
      }

      function receipt(rec, method, tendered) {
        const s = App.settings() || {};
        const lines = rec.items.map((it) => { const p = products.find((x) => x.id === it.productId); return `<tr><td class="py-1 text-slate-200">${UI.esc(p ? p.name : "—")}</td><td class="text-right text-slate-400">${UI.num(it.qty)}</td><td class="text-right text-slate-200">${UI.money(it.qty * it.price)}</td></tr>`; }).join("");
        const cust = customers.find((c) => c.id === rec.customerId);
        UI.openModal({
          title: "Receipt — " + rec.number,
          body: `<div class="space-y-3">
            <div class="text-center">
              <div class="font-bold text-slate-100">${UI.esc(s.company || s.brandName || "Workshop")}</div>
              <div class="text-xs text-slate-500">${UI.date(rec.date)} · ${UI.esc(cust ? cust.name : "Walk-in")}</div>
            </div>
            <table class="w-full text-sm"><thead><tr class="text-xs text-slate-500 border-b border-slate-700"><th class="text-left py-1">Item</th><th class="text-right">Qty</th><th class="text-right">Amount</th></tr></thead><tbody>${lines}</tbody></table>
            <div class="border-t border-slate-700 pt-2 text-sm space-y-1">
              <div class="flex justify-between text-slate-400"><span>Subtotal</span><span>${UI.money(rec.sub)}</span></div>
              <div class="flex justify-between text-slate-400"><span>Tax (${UI.num(rec.taxRate)}%)</span><span>${UI.money(rec.tax)}</span></div>
              <div class="flex justify-between text-lg font-bold text-slate-100"><span>Total</span><span>${UI.money(rec.total)}</span></div>
              <div class="flex justify-between text-emerald-300"><span>Paid (${UI.esc(method)})</span><span>${UI.money(tendered)}</span></div>
              <div class="flex justify-between text-slate-400"><span>Change</span><span>${UI.money(Math.max(0, tendered - rec.total))}</span></div>
            </div>
          </div>`,
          buttons: [{ label: "Print", class: "btn-soft", onClick: () => { window.print(); return false; } }, { label: "Done", class: "btn-primary" }],
        });
      }
    });
  }

  App.register("pos", { title: "Point of Sale", subtitle: "Fast counter checkout", render });
})();
