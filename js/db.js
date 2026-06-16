/* =========================================================================
 * Workshop Manager by Sufi — IndexedDB Data Layer
 * A promise-based wrapper around IndexedDB with a generic CRUD interface,
 * schema definition, and first-run seeding.
 * ========================================================================= */
window.DB = (function () {
  const DB_NAME = "OpenMS";
  const DB_VERSION = 1;

  // Every object store in the application. `keyPath` is always "id" (uuid string).
  // `indexes` are optional secondary indexes for lookups.
  const STORES = {
    settings:       { indexes: [] },
    rawMaterials:   { indexes: ["sku", "category", "name"] },
    products:       { indexes: ["sku", "category", "name"] },
    boms:           { indexes: ["productId"] },
    customers:      { indexes: ["name", "phone"] },
    suppliers:      { indexes: ["name", "phone"] },
    purchases:      { indexes: ["supplierId", "status", "date"] },
    workOrders:     { indexes: ["productId", "status", "date"] },
    sales:          { indexes: ["customerId", "status", "date"] },
    expenses:       { indexes: ["category", "date"] },
    employees:      { indexes: ["name", "role", "status"] },
    machines:       { indexes: ["name", "status"] },
    stockMovements: { indexes: ["itemId", "itemType", "date"] },
  };

  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      if (_db) return resolve(_db);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        Object.entries(STORES).forEach(([name, cfg]) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath: "id" });
            (cfg.indexes || []).forEach((idx) =>
              store.createIndex(idx, idx, { unique: false })
            );
          }
        });
      };
      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(_db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function tx(storeName, mode) {
    return open().then((db) => db.transaction(storeName, mode).objectStore(storeName));
  }

  /* ---- Generic CRUD ---------------------------------------------------- */

  function getAll(storeName) {
    return tx(storeName, "readonly").then(
      (store) =>
        new Promise((resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        })
    );
  }

  function get(storeName, id) {
    return tx(storeName, "readonly").then(
      (store) =>
        new Promise((resolve, reject) => {
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        })
    );
  }

  function put(storeName, record) {
    if (!record.id) record.id = uuid();
    const now = new Date().toISOString();
    if (!record.createdAt) record.createdAt = now;
    record.updatedAt = now;
    return tx(storeName, "readwrite").then(
      (store) =>
        new Promise((resolve, reject) => {
          const req = store.put(record);
          req.onsuccess = () => resolve(record);
          req.onerror = () => reject(req.error);
        })
    );
  }

  function remove(storeName, id) {
    return tx(storeName, "readwrite").then(
      (store) =>
        new Promise((resolve, reject) => {
          const req = store.delete(id);
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        })
    );
  }

  function clear(storeName) {
    return tx(storeName, "readwrite").then(
      (store) =>
        new Promise((resolve, reject) => {
          const req = store.clear();
          req.onsuccess = () => resolve(true);
          req.onerror = () => reject(req.error);
        })
    );
  }

  function count(storeName) {
    return tx(storeName, "readonly").then(
      (store) =>
        new Promise((resolve, reject) => {
          const req = store.count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        })
    );
  }

  /* ---- Settings convenience (single object keyed "app") ---------------- */

  function getSettings() {
    return get("settings", "app").then(
      (s) =>
        s || {
          id: "app",
          company: "My Workshop",
          currency: "$",
          email: "",
          phone: "",
          address: "",
          taxRate: 0,
          lowStockThreshold: 10,
          theme: "dark",
          // White-label branding
          brandName: "Workshop Manager by Sufi",
          brandTagline: "Workshop Manager",
          accent: "#4f46e5",
          logo: "",
        }
    );
  }

  function saveSettings(patch) {
    return getSettings().then((s) => put("settings", Object.assign(s, patch)));
  }

  /* ---- uuid ------------------------------------------------------------ */

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /* ---- Backup / Restore ------------------------------------------------ */

  function exportAll() {
    const names = Object.keys(STORES);
    return Promise.all(names.map(getAll)).then((results) => {
      const dump = { _meta: { app: "OpenMS", version: DB_VERSION, exportedAt: new Date().toISOString() } };
      names.forEach((n, i) => (dump[n] = results[i]));
      return dump;
    });
  }

  function importAll(dump) {
    const names = Object.keys(STORES);
    return Promise.all(
      names.map((n) => {
        if (!dump[n]) return Promise.resolve();
        return clear(n).then(() =>
          Promise.all(dump[n].map((rec) => put(n, rec)))
        );
      })
    );
  }

  function wipeAll() {
    return Promise.all(Object.keys(STORES).map(clear));
  }

  /* ---- First-run seeding ---------------------------------------------- */

  function seedIfEmpty() {
    return count("rawMaterials").then((c) => {
      if (c > 0) return false;
      return _seed().then(() => true);
    });
  }

  function _seed() {
    const today = new Date();
    const d = (offset) => {
      const x = new Date(today);
      x.setDate(x.getDate() + offset);
      return x.toISOString().slice(0, 10);
    };

    // Raw materials
    const rm = [
      { id: uuid(), sku: "RM-STEEL", name: "Steel Sheet 2mm", category: "Metal", unit: "kg", stock: 480, reorder: 100, cost: 3.2 },
      { id: uuid(), sku: "RM-ALU", name: "Aluminium Rod", category: "Metal", unit: "kg", stock: 60, reorder: 80, cost: 5.5 },
      { id: uuid(), sku: "RM-BOLT", name: "Hex Bolt M8", category: "Fastener", unit: "pcs", stock: 5400, reorder: 1000, cost: 0.08 },
      { id: uuid(), sku: "RM-PAINT", name: "Industrial Paint", category: "Finishing", unit: "ltr", stock: 35, reorder: 20, cost: 12.0 },
      { id: uuid(), sku: "RM-WIRE", name: "Copper Wire 1.5mm", category: "Electrical", unit: "m", stock: 1200, reorder: 300, cost: 0.45 },
    ];

    // Products
    const products = [
      { id: uuid(), sku: "FG-CART", name: "Steel Utility Cart", category: "Furniture", unit: "pcs", stock: 24, reorder: 10, price: 145, cost: 0 },
      { id: uuid(), sku: "FG-SHELF", name: "Wall Shelf Bracket", category: "Hardware", unit: "pcs", stock: 130, reorder: 40, price: 22, cost: 0 },
      { id: uuid(), sku: "FG-LAMP", name: "Workshop Lamp", category: "Electrical", unit: "pcs", stock: 8, reorder: 15, price: 68, cost: 0 },
    ];

    const customers = [
      { id: uuid(), name: "Acme Hardware Co", phone: "555-0101", email: "buy@acme.test", address: "12 Trade St", balance: 0 },
      { id: uuid(), name: "BuildRight Stores", phone: "555-0144", email: "orders@buildright.test", address: "88 Market Ave", balance: 0 },
      { id: uuid(), name: "Nova Interiors", phone: "555-0188", email: "hello@nova.test", address: "5 Design Rd", balance: 0 },
    ];

    const suppliers = [
      { id: uuid(), name: "MetalWorks Supply", phone: "555-0202", email: "sales@metalworks.test", address: "Industrial Zone A", balance: 0 },
      { id: uuid(), name: "FastenAll Ltd", phone: "555-0233", email: "info@fastenall.test", address: "Unit 9 Depot", balance: 0 },
    ];

    const employees = [
      { id: uuid(), name: "Owner", role: "Owner", phone: "", wage: 0, status: "Active", joined: d(-400) },
      { id: uuid(), name: "Sam Carter", role: "Welder", phone: "555-0301", wage: 24, status: "Active", joined: d(-200) },
      { id: uuid(), name: "Lee Wong", role: "Assembler", phone: "555-0302", wage: 19, status: "Active", joined: d(-120) },
    ];

    const machines = [
      { id: uuid(), name: "CNC Mill #1", type: "CNC", status: "Operational", purchased: d(-700), lastService: d(-30), notes: "" },
      { id: uuid(), name: "MIG Welder", type: "Welding", status: "Operational", purchased: d(-500), lastService: d(-60), notes: "" },
      { id: uuid(), name: "Paint Booth", type: "Finishing", status: "Maintenance", purchased: d(-900), lastService: d(-5), notes: "Filter replacement" },
    ];

    // BOM for the cart
    const boms = [
      {
        id: uuid(),
        productId: products[0].id,
        outputQty: 1,
        components: [
          { materialId: rm[0].id, qty: 6 },
          { materialId: rm[2].id, qty: 24 },
          { materialId: rm[3].id, qty: 0.3 },
        ],
        labor: 18,
        overhead: 8,
      },
      {
        id: uuid(),
        productId: products[1].id,
        outputQty: 1,
        components: [
          { materialId: rm[0].id, qty: 0.8 },
          { materialId: rm[2].id, qty: 4 },
        ],
        labor: 3,
        overhead: 1,
      },
    ];

    const expenses = [
      { id: uuid(), date: d(-12), category: "Utilities", description: "Electricity bill", amount: 320 },
      { id: uuid(), date: d(-8), category: "Rent", description: "Workshop rent", amount: 1200 },
      { id: uuid(), date: d(-3), category: "Maintenance", description: "Welder service", amount: 85 },
    ];

    const settings = {
      id: "app", company: "Sufi Workshop", currency: "$", email: "owner@workshop.test",
      phone: "555-0000", address: "1 Workshop Lane", taxRate: 8, lowStockThreshold: 10, theme: "dark",
      brandName: "Workshop Manager by Sufi", brandTagline: "Workshop Manager", accent: "#4f46e5", logo: "",
    };

    const writes = [];
    rm.forEach((r) => writes.push(put("rawMaterials", r)));
    products.forEach((r) => writes.push(put("products", r)));
    customers.forEach((r) => writes.push(put("customers", r)));
    suppliers.forEach((r) => writes.push(put("suppliers", r)));
    employees.forEach((r) => writes.push(put("employees", r)));
    machines.forEach((r) => writes.push(put("machines", r)));
    boms.forEach((r) => writes.push(put("boms", r)));
    expenses.forEach((r) => writes.push(put("expenses", r)));
    writes.push(put("settings", settings));

    return Promise.all(writes);
  }

  return {
    open, getAll, get, put, remove, clear, count, uuid,
    getSettings, saveSettings,
    exportAll, importAll, wipeAll, seedIfEmpty,
    STORES,
  };
})();
