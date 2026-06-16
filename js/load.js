/* =========================================================================
 * Workshop Manager by Sufi — Local script loader
 * Loaded once per page; writes the same-origin app scripts in order so each
 * HTML page stays tiny and the script list lives in a single place.
 *
 * NOTE: only same-origin scripts are written here. Cross-origin CDN scripts
 * are declared directly in each page's <head> because Chrome's "document.write
 * intervention" can block cross-origin scripts injected via document.write.
 * ========================================================================= */
(function () {
  var APP = [
    "js/db.js",
    "js/ui.js",
    "js/app.js",
    "js/shell.js",
    "js/modules/dashboard.js",
    "js/modules/inventory.js",
    "js/modules/bom.js",
    "js/modules/parties.js",
    "js/modules/production.js",
    "js/modules/sales.js",
    "js/modules/pos.js",
    "js/modules/purchases.js",
    "js/modules/expenses.js",
    "js/modules/hr.js",
    "js/modules/reports.js",
    "js/modules/settings.js",
  ];
  APP.forEach(function (src) {
    document.write('<script src="' + src + '"><\/script>');
  });
})();
