// Single shared connection to data/procurement.db (mirrors finance-db.js).
// PROC_DB env override exists for tests (e.g. ':memory:').
import { DatabaseSync } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function dbPath() {
  if (process.env.PROC_DB) return process.env.PROC_DB;
  return resolve(__dirname, '..', '..', 'data', 'procurement.db');
}

let pdb = null;
export function procDb() {
  if (!pdb) {
    const p = dbPath();
    if (p !== ':memory:') mkdirSync(dirname(p), { recursive: true });
    pdb = new DatabaseSync(p);
    pdb.exec('PRAGMA foreign_keys = ON');
    const schema = readFileSync(resolve(__dirname, '..', 'db', 'procurement.schema.sql'), 'utf8');
    pdb.exec(schema);
    migrate(pdb);
  }
  return pdb;
}

// Additive migrations for pre-existing DB files: CREATE TABLE IF NOT EXISTS
// never backfills columns, so each new column lands here exactly once.
function migrate(pdb) {
  const cols = new Set(pdb.prepare('PRAGMA table_info(comments)').all().map((c) => c.name));
  if (!cols.has('parent_id')) {
    pdb.exec('ALTER TABLE comments ADD COLUMN parent_id INTEGER NULL REFERENCES comments (id) ON DELETE CASCADE');
  }
  if (!cols.has('mentions_csv')) {
    pdb.exec("ALTER TABLE comments ADD COLUMN mentions_csv TEXT NOT NULL DEFAULT ''");
  }
  pdb.exec('CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments (parent_id)');

  // Hybrid C-base: firm groups the catalog. sell_price stays frozen (history/compat).
  const catCols = new Set(pdb.prepare('PRAGMA table_info(price_catalog)').all().map((c) => c.name));
  if (!catCols.has('firm')) {
    pdb.exec("ALTER TABLE price_catalog ADD COLUMN firm TEXT NOT NULL DEFAULT 'UMUMI'");
    pdb.exec("UPDATE price_catalog SET firm = 'UMUMI' WHERE firm IS NULL OR TRIM(firm) = ''");
  }
  const catIdx = pdb.prepare('PRAGMA index_list(price_catalog)').all();
  const hasComposite = catIdx.some((ix) => {
    if (!ix.unique) return false;
    const info = pdb.prepare(`PRAGMA index_info(${JSON.stringify(ix.name)})`).all();
    const colsInfo = pdb.prepare('PRAGMA table_info(price_catalog)').all();
    const names = info.map((e) => colsInfo[e.cid]?.name);
    return names.includes('internal_id') && names.includes('firm');
  });
  const hasGlobalInternalId = catIdx.some((ix) => {
    if (!ix.unique) return false;
    const info = pdb.prepare(`PRAGMA index_info(${JSON.stringify(ix.name)})`).all();
    const colsInfo = pdb.prepare('PRAGMA table_info(price_catalog)').all();
    const names = info.map((e) => colsInfo[e.cid]?.name);
    return names.length === 1 && names[0] === 'internal_id';
  });
  if (!hasComposite) {
    if (hasGlobalInternalId) {
      // Legacy UNIQUE(internal_id) — rebuild for UNIQUE(internal_id, firm), ids preserved.
      // FK OFF during the swap so order_items.catalog_id links survive the DROP.
      pdb.exec(`PRAGMA foreign_keys = OFF;
        BEGIN;
        CREATE TABLE price_catalog_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          internal_id TEXT NOT NULL,
          name TEXT NOT NULL,
          unit TEXT NOT NULL,
          firm TEXT NOT NULL DEFAULT 'UMUMI',
          buy_price REAL NOT NULL CHECK (buy_price >= 0),
          sell_price REAL NOT NULL CHECK (sell_price >= 0),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          UNIQUE (internal_id, firm)
        );
        INSERT INTO price_catalog_new (id, internal_id, name, unit, firm, buy_price, sell_price, created_at, updated_at)
          SELECT id, internal_id, name, unit, COALESCE(NULLIF(TRIM(firm), ''), 'UMUMI'), buy_price, sell_price, created_at, updated_at FROM price_catalog;
        DROP TABLE price_catalog;
        ALTER TABLE price_catalog_new RENAME TO price_catalog;
        CREATE INDEX IF NOT EXISTS idx_catalog_internal_id ON price_catalog (internal_id);
        CREATE INDEX IF NOT EXISTS idx_catalog_name ON price_catalog (name);
        CREATE INDEX IF NOT EXISTS idx_catalog_firm ON price_catalog (firm);
        CREATE INDEX IF NOT EXISTS idx_items_catalog ON order_items (catalog_id);
        COMMIT;
        PRAGMA foreign_keys = ON;`);
    } else {
      pdb.exec('CREATE UNIQUE INDEX IF NOT EXISTS sqlite_autoindex_price_catalog_1 ON price_catalog (internal_id, firm)');
      pdb.exec('CREATE INDEX IF NOT EXISTS idx_catalog_firm ON price_catalog (firm)');
    }
  } else {
    pdb.exec('CREATE INDEX IF NOT EXISTS idx_catalog_firm ON price_catalog (firm)');
  }

  // ── Anbar (warehouse) tables for pre-existing DB files ──
  pdb.exec(`CREATE TABLE IF NOT EXISTS warehouse_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'ədəd',
    qty REAL NOT NULL DEFAULT 0 CHECK (qty >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (name, unit)
  )`);
  pdb.exec(`CREATE TABLE IF NOT EXISTS stock_removals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_no TEXT NOT NULL,
    destination TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_by INTEGER NULL REFERENCES users (id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`);
  pdb.exec(`CREATE TABLE IF NOT EXISTS stock_removal_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    removal_id INTEGER NOT NULL REFERENCES stock_removals (id) ON DELETE CASCADE,
    warehouse_item_id INTEGER NULL REFERENCES warehouse_items (id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    qty REAL NOT NULL CHECK (qty > 0),
    note TEXT NOT NULL DEFAULT ''
  )`);
  pdb.exec('CREATE INDEX IF NOT EXISTS idx_warehouse_name ON warehouse_items (name)');
  pdb.exec('CREATE INDEX IF NOT EXISTS idx_removal_doc ON stock_removals (doc_no)');
  pdb.exec('CREATE INDEX IF NOT EXISTS idx_removal_created ON stock_removals (created_at)');
  pdb.exec('CREATE INDEX IF NOT EXISTS idx_removal_item_removal ON stock_removal_items (removal_id)');
  pdb.exec('CREATE INDEX IF NOT EXISTS idx_removal_item_product ON stock_removal_items (warehouse_item_id)');

  // New sections for existing users (orders,catalog,dashboard → + warehouse,1c).
  try {
    for (const u of pdb.prepare('SELECT id, sections_csv FROM users').all()) {
      const parts = String(u.sections_csv || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      let changed = false;
      for (const need of ['warehouse', '1c']) {
        if (!parts.includes(need)) { parts.push(need); changed = true; }
      }
      if (changed) {
        pdb.prepare('UPDATE users SET sections_csv = ? WHERE id = ?').run(parts.join(','), u.id);
      }
    }
  } catch { /* users table may not exist yet in fresh test DBs */ }
}

// Test-only: drop the cached handle so a fresh DB can be opened.
export function __resetDb() {
  try { pdb?.close(); } catch { /* ignore */ }
  pdb = null;
}
