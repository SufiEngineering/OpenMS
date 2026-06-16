# Workshop Manager by Sufi

A feature-rich, single-user **manufacturing workshop management system** built with
plain HTML, TailwindCSS, JavaScript and jQuery. All data lives **locally in your
browser** via IndexedDB — no server, no accounts, no cloud. Designed for a workshop
owner to run the whole operation from one dark-mode dashboard.

Fully **personalisable and white-label ready** — rebrand the product name, tagline,
logo and accent colour from Settings and resell it as your own.

## Features

- **Dashboard** — revenue / profit / inventory-value KPIs, 6-month revenue-vs-spend
  trend, inventory-by-category breakdown, low-stock alerts and recent activity feed.
- **Inventory**
  - Raw Materials — stock, unit cost, reorder levels, stock-in/out adjustments.
  - Products — finished-goods stock, cost & sale price.
  - Stock Movements — a full append-only ledger of every stock change.
- **Bill of Materials (BOM)** — define a product recipe from component materials plus
  labor & overhead; live unit-cost calculation and one-click "apply cost to product".
- **Production / Work Orders** — plan a build, preview material requirements from the
  BOM, then on completion auto-consume materials and add finished goods to stock with
  computed unit cost.
- **Point of Sale (POS)** — touch-friendly counter checkout: tap products into a
  cart, pick a customer, take payment (cash/card) with change calculation, and post a
  fully-paid sale that reduces stock and prints a receipt.
- **Sales & Invoices** — multi-line invoices, tax, customer receivables, payment
  recording, stock deduction, printable invoice view.
- **Purchases** — supplier purchase orders, receiving into material stock (updating
  unit cost), supplier payables and payments.
- **Customers & Suppliers** — contact management with running balances and per-party
  transaction history.
- **Expenses** — categorised operating-expense ledger with monthly & category stats.
- **Employees & Machines** — staff records and equipment with maintenance/service log.
- **Reports** — profit & loss summary, top products by revenue, expenses by category,
  inventory valuation, with CSV export.
- **Settings** — company profile, currency, tax & low-stock defaults, plus full
  **JSON backup / restore**, demo-data loader and reset.
- **Branding & White Label** — personalise the product name, tagline, logo and accent
  colour; changes apply instantly across every page and re-theme the whole UI.

## Running

It is a static site — just serve the folder and open it in a modern browser:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

On first launch it seeds a set of demo data so you can explore immediately. Use
**Settings → Reset All Data** to start clean, or **Export Backup** to save a snapshot.

> Data is stored per-browser/per-origin in IndexedDB. Back up regularly from Settings.

## Project structure

Each module is its own standalone **HTML page**. Every page is tiny — it pulls in
the CDN libraries, the stylesheet, and `js/load.js`, which loads the shared app
scripts. `js/shell.js` injects the sidebar + header, and `js/app.js` boots the one
module whose route matches the page's filename (`sales.html` → the sales module,
`index.html` → the dashboard).

```
index.html        Dashboard          customers.html    Customers
materials.html    Raw Materials       suppliers.html    Suppliers
products.html     Products            employees.html    Employees
boms.html         Bill of Materials   machines.html     Machines
movements.html    Stock Movements     reports.html      Reports
production.html   Production          settings.html     Settings
pos.html          Point of Sale
sales.html        Sales & Invoices
purchases.html    Purchases
expenses.html     Expenses

css/app.css         All component styles (plain CSS — no build/@apply needed)
js/
  load.js           Writes the shared app <script> tags (single source of truth)
  db.js             IndexedDB wrapper: stores, CRUD, seeding, backup/restore
  ui.js             Toasts, modal/confirm, formatting, form & table helpers
  app.js            Per-page bootstrap + shared render helpers (toolbar, cards…)
  shell.js          Injects the sidebar + header chrome on every page
  modules/
    dashboard.js  inventory.js  bom.js       parties.js   production.js
    sales.js      pos.js        purchases.js expenses.js  hr.js
    reports.js    settings.js
```

Navigation between modules is ordinary page navigation (the sidebar items are
real links), so each screen has its own URL and can be bookmarked.

## Tech

TailwindCSS (CDN, utilities only), jQuery 3.7, Chart.js 4, Lucide icons, IndexedDB.
Component styling lives in `css/app.css` as plain CSS. No build step.
