/* =========================================================================
 * Settings — company profile, preferences, backup / restore / reset
 * ========================================================================= */
(function () {
  function render($view) {
    return DB.getSettings().then((s) => {
      const $form = $(`<div class="card p-6 mb-6 max-w-2xl">
        <h3 class="text-sm font-semibold text-slate-200 mb-4">Company Profile</h3>
        <div class="grid grid-cols-2 gap-3">
          ${UI.field({ name: "company", label: "Company name", value: s.company })}
          ${UI.field({ name: "email", label: "Email", value: s.email, span: "col-span-1" })}
          ${UI.field({ name: "phone", label: "Phone", value: s.phone, span: "col-span-1" })}
          ${UI.field({ name: "address", label: "Address", value: s.address })}
          ${UI.field({ name: "currency", label: "Currency symbol", value: s.currency, span: "col-span-1" })}
          ${UI.field({ name: "taxRate", label: "Default tax %", type: "number", value: s.taxRate, span: "col-span-1" })}
          ${UI.field({ name: "lowStockThreshold", label: "Low-stock threshold", type: "number", value: s.lowStockThreshold, span: "col-span-1" })}
        </div>
        <div class="mt-4"><button id="save-settings" class="btn btn-primary"><i data-lucide="save" class="w-4 h-4"></i> Save Settings</button></div>
      </div>`);
      $view.append($form);

      // ---- White-label / personalisation ------------------------------------
      const $brand = $(`<div class="card p-6 mb-6 max-w-2xl">
        <h3 class="text-sm font-semibold text-slate-200 mb-1">Branding & White Label</h3>
        <p class="text-xs text-slate-500 mb-4">Personalise the product name, tagline, logo and accent colour. Changes apply instantly across every page — perfect for reselling under your own brand.</p>
        <div class="flex items-center gap-4 mb-4">
          <div id="logo-preview" class="w-14 h-14 rounded-xl brand-badge flex items-center justify-center overflow-hidden shrink-0">
            ${s.logo ? `<img src="${s.logo}" class="w-full h-full object-cover" />` : `<i data-lucide="image" class="w-6 h-6 text-white"></i>`}
          </div>
          <div class="flex flex-wrap gap-2">
            <label class="btn btn-soft cursor-pointer"><i data-lucide="upload" class="w-4 h-4"></i> Upload Logo<input id="logo-input" type="file" accept="image/*" class="hidden" /></label>
            <button id="logo-clear" class="btn btn-soft"><i data-lucide="x" class="w-4 h-4"></i> Remove</button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          ${UI.field({ name: "brandName", label: "Brand / product name", value: s.brandName || "Workshop Manager by Sufi" })}
          ${UI.field({ name: "brandTagline", label: "Tagline", value: s.brandTagline || "Workshop Manager", span: "col-span-1" })}
          <div class="col-span-1">
            <label class="block text-xs font-medium text-slate-400 mb-1">Accent colour</label>
            <div class="flex items-center gap-2">
              <input type="color" name="accent" value="${UI.esc(s.accent || "#4f46e5")}" class="h-9 w-12 rounded-md bg-transparent border border-slate-700 cursor-pointer p-0.5" />
              <input type="text" name="accentHex" value="${UI.esc(s.accent || "#4f46e5")}" class="form-input flex-1 font-mono" />
            </div>
          </div>
        </div>
        <div class="mt-4"><button id="save-brand" class="btn btn-primary"><i data-lucide="save" class="w-4 h-4"></i> Save Branding</button></div>
      </div>`);
      $view.append($brand);

      let pendingLogo = s.logo || "";

      $brand.find("#logo-input").on("change", function () {
        const file = this.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          pendingLogo = e.target.result;
          $brand.find("#logo-preview").html(`<img src="${pendingLogo}" class="w-full h-full object-cover" />`);
        };
        reader.readAsDataURL(file);
      });

      $brand.find("#logo-clear").on("click", () => {
        pendingLogo = "";
        $brand.find("#logo-preview").html(`<i data-lucide="image" class="w-6 h-6 text-white"></i>`);
        if (window.lucide) lucide.createIcons();
      });

      // Keep the colour picker and hex field in sync, with a live accent preview.
      $brand.find("[name=accent]").on("input", function () {
        const v = $(this).val();
        $brand.find("[name=accentHex]").val(v);
        App.applyBranding(Object.assign({}, App.settings(), { accent: v }));
      });
      $brand.find("[name=accentHex]").on("input", function () {
        const v = $(this).val();
        if (/^#[0-9a-f]{6}$/i.test(v)) { $brand.find("[name=accent]").val(v); App.applyBranding(Object.assign({}, App.settings(), { accent: v })); }
      });

      $brand.find("#save-brand").on("click", () => {
        const accent = $brand.find("[name=accentHex]").val();
        DB.saveSettings({
          brandName: $brand.find("[name=brandName]").val() || "Workshop Manager by Sufi",
          brandTagline: $brand.find("[name=brandTagline]").val() || "",
          accent: /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#4f46e5",
          logo: pendingLogo,
        }).then(() => App.refreshSettings()).then(() => UI.toast("Branding saved"));
      });

      const $data = $(`<div class="card p-6 max-w-2xl">
        <h3 class="text-sm font-semibold text-slate-200 mb-1">Data Management</h3>
        <p class="text-xs text-slate-500 mb-4">All data is stored locally in your browser via IndexedDB. Back up regularly.</p>
        <div class="flex flex-wrap gap-2">
          <button id="backup" class="btn btn-soft"><i data-lucide="download" class="w-4 h-4"></i> Export Backup (JSON)</button>
          <label class="btn btn-soft cursor-pointer"><i data-lucide="upload" class="w-4 h-4"></i> Restore Backup<input id="restore" type="file" accept="application/json" class="hidden" /></label>
          <button id="reseed" class="btn btn-soft"><i data-lucide="sparkles" class="w-4 h-4"></i> Load Demo Data</button>
          <button id="wipe" class="btn btn-danger"><i data-lucide="trash-2" class="w-4 h-4"></i> Reset All Data</button>
        </div>
      </div>`);
      $view.append($data);

      $form.find("#save-settings").on("click", () => {
        const f = UI.readForm($form);
        DB.saveSettings({ company: f.company, email: f.email, phone: f.phone, address: f.address, currency: f.currency || "$", taxRate: +f.taxRate || 0, lowStockThreshold: +f.lowStockThreshold || 10 })
          .then(() => App.refreshSettings()).then(() => UI.toast("Settings saved"));
      });

      $data.find("#backup").on("click", () => {
        DB.exportAll().then((dump) => {
          const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const slug = (App.brandName() || "workshop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          a.href = url; a.download = slug + "-backup-" + UI.todayStr() + ".json"; a.click();
          URL.revokeObjectURL(url);
          UI.toast("Backup downloaded");
        });
      });

      $data.find("#restore").on("change", function () {
        const file = this.files[0]; if (!file) return;
        UI.confirm("Restoring will replace ALL current data. Continue?", { danger: true, confirmLabel: "Restore" }).then((ok) => {
          if (!ok) { this.value = ""; return; }
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const dump = JSON.parse(e.target.result);
              DB.importAll(dump).then(() => App.refreshSettings()).then(() => { UI.toast("Backup restored"); App.go("dashboard"); });
            } catch (err) { UI.toast("Invalid backup file", "error"); }
          };
          reader.readAsText(file);
        });
      });

      $data.find("#reseed").on("click", () => {
        UI.confirm("Load demo data? This replaces all current data.", { danger: true, confirmLabel: "Load Demo" }).then((ok) => {
          if (!ok) return;
          DB.wipeAll().then(() => DB.seedIfEmpty()).then(() => App.refreshSettings()).then(() => { UI.toast("Demo data loaded"); App.go("dashboard"); });
        });
      });

      $data.find("#wipe").on("click", () => {
        UI.confirm("This permanently deletes ALL workshop data. This cannot be undone.", { danger: true, confirmLabel: "Delete Everything" }).then((ok) => {
          if (!ok) return;
          DB.wipeAll().then(() => App.refreshSettings()).then(() => { UI.toast("All data cleared", "info"); App.go("dashboard"); });
        });
      });
    });
  }

  App.register("settings", { title: "Settings", subtitle: "Company profile & data management", render });
})();
