/* =========================================================================
 * Workshop Manager by Sufi — UI Helpers
 * Toasts, modal dialogs, confirm, formatting, and small DOM utilities.
 * ========================================================================= */
window.UI = (function () {
  let _currency = "$";
  function setCurrency(c) { _currency = c || "$"; }

  /* ---- Formatting ------------------------------------------------------ */
  function money(n) {
    const v = Number(n || 0);
    return _currency + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function num(n) {
    return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
  }
  function date(d) {
    if (!d) return "—";
    const dt = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ---- Toast ----------------------------------------------------------- */
  function toast(message, type = "success") {
    const colors = {
      success: "bg-emerald-600 border-emerald-400",
      error: "bg-rose-600 border-rose-400",
      info: "bg-sky-600 border-sky-400",
      warn: "bg-amber-600 border-amber-400",
    };
    const icons = { success: "check-circle", error: "alert-circle", info: "info", warn: "alert-triangle" };
    const $t = $(`
      <div class="flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-white text-sm ${colors[type] || colors.info} anim-slidein">
        <i data-lucide="${icons[type] || "info"}" class="w-4 h-4"></i>
        <span>${esc(message)}</span>
      </div>`);
    $("#toast-host").append($t);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => { $t.fadeOut(200, () => $t.remove()); }, 3200);
  }

  /* ---- Modal ----------------------------------------------------------- */
  // openModal({ title, body(html), size, onMount($body), buttons:[{label,class,onClick($body)=>bool|Promise}] })
  function openModal(opts) {
    closeModal();
    const size = opts.size || "max-w-lg";
    const $overlay = $(`
      <div id="modal-overlay" class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-4">
        <div class="modal-card w-full ${size} my-8 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl">
          <div class="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <h3 class="text-lg font-semibold text-slate-100">${esc(opts.title || "")}</h3>
            <button class="modal-x text-slate-400 hover:text-slate-200"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <div class="modal-body px-5 py-4 text-slate-200"></div>
          <div class="modal-foot flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-700"></div>
        </div>
      </div>`);
    const $body = $overlay.find(".modal-body");
    $body.html(typeof opts.body === "function" ? opts.body() : (opts.body || ""));

    const $foot = $overlay.find(".modal-foot");
    const buttons = opts.buttons || [{ label: "Close", class: "btn-ghost", onClick: () => true }];
    buttons.forEach((b) => {
      const $btn = $(`<button class="btn ${b.class || "btn-ghost"}">${esc(b.label)}</button>`);
      $btn.on("click", async () => {
        const res = b.onClick ? await b.onClick($body, $btn) : true;
        if (res !== false) closeModal();
      });
      $foot.append($btn);
    });

    $overlay.find(".modal-x").on("click", closeModal);
    $overlay.on("mousedown", (e) => { if (e.target.id === "modal-overlay") closeModal(); });
    $("body").append($overlay);
    if (window.lucide) lucide.createIcons();
    if (opts.onMount) opts.onMount($body);
    return $body;
  }
  function closeModal() { $("#modal-overlay").remove(); }

  function confirm(message, opts = {}) {
    return new Promise((resolve) => {
      openModal({
        title: opts.title || "Please confirm",
        size: "max-w-md",
        body: `<p class="text-slate-300">${esc(message)}</p>`,
        buttons: [
          { label: opts.cancelLabel || "Cancel", class: "btn-ghost", onClick: () => { resolve(false); return true; } },
          { label: opts.confirmLabel || "Confirm", class: opts.danger ? "btn-danger" : "btn-primary", onClick: () => { resolve(true); return true; } },
        ],
      });
    });
  }

  /* ---- Form helpers ---------------------------------------------------- */
  // Builds a labelled field. type: text|number|date|select|textarea
  function field(cfg) {
    const id = cfg.name;
    const val = cfg.value == null ? "" : cfg.value;
    let input;
    if (cfg.type === "select") {
      const opts = (cfg.options || [])
        .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(val) ? "selected" : ""}>${esc(o.label)}</option>`).join("");
      input = `<select name="${id}" class="form-input">${opts}</select>`;
    } else if (cfg.type === "textarea") {
      input = `<textarea name="${id}" rows="${cfg.rows || 3}" class="form-input" placeholder="${esc(cfg.placeholder || "")}">${esc(val)}</textarea>`;
    } else {
      const step = cfg.type === "number" ? `step="${cfg.step || "any"}"` : "";
      input = `<input type="${cfg.type || "text"}" name="${id}" value="${esc(val)}" ${step} placeholder="${esc(cfg.placeholder || "")}" class="form-input" ${cfg.attrs || ""}>`;
    }
    const span = cfg.span || "col-span-2";
    return `<div class="${span}">
      <label class="block text-xs font-medium text-slate-400 mb-1">${esc(cfg.label)}${cfg.required ? ' <span class="text-rose-400">*</span>' : ""}</label>
      ${input}
    </div>`;
  }

  // Collects {name:value} from a container; numbers stay strings (caller parses).
  function readForm($scope) {
    const data = {};
    $scope.find("[name]").each(function () {
      data[this.name] = $(this).val();
    });
    return data;
  }

  /* ---- Badges / pills -------------------------------------------------- */
  function badge(text, tone = "slate") {
    const tones = {
      slate: "bg-slate-700 text-slate-300",
      green: "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50",
      red: "bg-rose-900/60 text-rose-300 border border-rose-700/50",
      amber: "bg-amber-900/60 text-amber-300 border border-amber-700/50",
      blue: "bg-sky-900/60 text-sky-300 border border-sky-700/50",
      purple: "bg-violet-900/60 text-violet-300 border border-violet-700/50",
    };
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone] || tones.slate}">${esc(text)}</span>`;
  }

  function statusTone(status) {
    const s = String(status || "").toLowerCase();
    if (["paid", "completed", "operational", "active", "received", "done"].includes(s)) return "green";
    if (["pending", "draft", "in progress", "partial", "maintenance"].includes(s)) return "amber";
    if (["cancelled", "overdue", "broken", "inactive", "unpaid"].includes(s)) return "red";
    return "slate";
  }

  /* ---- Empty state ----------------------------------------------------- */
  function empty(message, icon = "inbox") {
    return `<div class="flex flex-col items-center justify-center py-16 text-slate-500">
      <i data-lucide="${icon}" class="w-12 h-12 mb-3 opacity-50"></i>
      <p>${esc(message)}</p>
    </div>`;
  }

  return {
    setCurrency, money, num, date, todayStr, esc,
    toast, openModal, closeModal, confirm,
    field, readForm, badge, statusTone, empty,
  };
})();
