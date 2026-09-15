-- Appina Procurement — canonical SQLite DDL (standalone data/procurement.db).
-- Conventions (from Appina Finance): separate DB file, ISO-8601 UTC timestamps,
-- all money math server-side with 2-decimal rounding, orders.status is the single
-- source of truth, status_history is a DERIVED timeline (written only inside the
-- same transaction as the status change).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  proc_role TEXT NOT NULL CHECK (proc_role IN ('procurement_specialist', 'boss')),
  proc_access INTEGER NOT NULL DEFAULT 1,
  sections_csv TEXT NOT NULL DEFAULT 'orders,catalog,dashboard,warehouse,1c',
  -- Appina-integration seam: maps to the future Appina user id. NULL = standalone.
  appina_user_id TEXT NULL UNIQUE,
  must_rotate INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Opaque session tokens (no JWT dependency). Standalone only —
-- the Appina drop-in reuses Appina's own session/cookie instead.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS price_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Normalized UPPER-trimmed on write; composite UNIQUE gives the 409 conflict signal.
  internal_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  -- Hybrid C-base: firm groups the catalog (UMUMI = ungrouped legacy rows).
  firm TEXT NOT NULL DEFAULT 'UMUMI',
  buy_price REAL NOT NULL CHECK (buy_price >= 0),
  -- Frozen: kept for history/compat, always mirrors buy_price on write.
  sell_price REAL NOT NULL CHECK (sell_price >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (internal_id, firm)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- Snapshot: the employee name as typed at order time (may differ from login name).
  requester_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'partially_approved', 'rejected')),
  decided_by INTEGER NULL REFERENCES users (id) ON DELETE SET NULL,
  decided_at TEXT NULL,
  -- Future hook: multi-currency display converts via the single money() helper.
  currency TEXT NOT NULL DEFAULT 'AZN',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (decided_at IS NULL OR status != 'pending')
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  -- Nullable so catalog deletes (SET NULL) never destroy order history.
  catalog_id INTEGER NULL REFERENCES price_catalog (id) ON DELETE SET NULL,
  -- Snapshots: later catalog edits/renames never rewrite history.
  product_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  requested_qty REAL NOT NULL CHECK (requested_qty > 0),
  -- NULL until decision. NULL means "as requested" on full approval.
  approved_qty REAL NULL CHECK (approved_qty IS NULL OR approved_qty >= 0)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Threaded reply: NULL = top-level, else the parent comment id (same order).
  parent_id INTEGER NULL REFERENCES comments (id) ON DELETE CASCADE,
  -- @mention-lər: vergüllə ayrılmış user login-ləri (users.login-ə map olunur).
  mentions_csv TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Derived audit timeline. Rows are written ONLY inside logDecision()/creation
-- transactions (see server/lib/proc_helpers.js). orders.status is canonical.
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  from_status TEXT NULL,
  to_status TEXT NOT NULL,
  actor_id INTEGER NULL REFERENCES users (id) ON DELETE SET NULL,
  comment TEXT NULL,
  -- Partial decisions store [{item_id, requested, approved}] here.
  diff_json TEXT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_requester ON orders (requester_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_decided ON orders (decided_at);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_items_catalog ON order_items (catalog_id);
CREATE INDEX IF NOT EXISTS idx_catalog_internal_id ON price_catalog (internal_id);
CREATE INDEX IF NOT EXISTS idx_catalog_name ON price_catalog (name);
-- idx_catalog_firm is created in migrate() after adding the column to legacy DBs.
CREATE INDEX IF NOT EXISTS idx_comments_order ON comments (order_id, created_at);
-- NOTE: idx_comments_parent lives in migrate() (lib/proc_db.js), NOT here —
-- on pre-existing DBs the table already exists without parent_id, so creating
-- the index here would crash boot with "no such column: parent_id".
CREATE INDEX IF NOT EXISTS idx_history_order ON status_history (order_id, id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- ── Anbar (warehouse): Excel "anbar faktiki sayım" strukturu 1:1 ──
-- Malın adı | Ölçü vahidi | Miqdarı → name | unit | qty.
CREATE TABLE IF NOT EXISTS warehouse_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'ədəd',
  qty REAL NOT NULL DEFAULT 0 CHECK (qty >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (name, unit)
);

-- Silinmə sənədi (başlıq): № + Təyinat/obyekt + tarix/vaxt + kim yaratdı.
CREATE TABLE IF NOT EXISTS stock_removals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL,
  destination TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_by INTEGER NULL REFERENCES users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Silinmə sətirləri: bir sənəddə bir neçə məhsul. product_name/unit
-- snapshot-dur (əsas cədvəddəki ad dəyişsə tarixçə pozulmur);
-- warehouse_item_id əlaqəni saxlayır (ON DELETE SET NULL).
CREATE TABLE IF NOT EXISTS stock_removal_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  removal_id INTEGER NOT NULL REFERENCES stock_removals (id) ON DELETE CASCADE,
  warehouse_item_id INTEGER NULL REFERENCES warehouse_items (id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  qty REAL NOT NULL CHECK (qty > 0),
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_warehouse_name ON warehouse_items (name);
CREATE INDEX IF NOT EXISTS idx_removal_doc ON stock_removals (doc_no);
CREATE INDEX IF NOT EXISTS idx_removal_created ON stock_removals (created_at);
CREATE INDEX IF NOT EXISTS idx_removal_item_removal ON stock_removal_items (removal_id);
CREATE INDEX IF NOT EXISTS idx_removal_item_product ON stock_removal_items (warehouse_item_id);

-- Silinmə kommentləri (sifariş kommentləri kimi flat: müəllif + mətn + tarix).
CREATE TABLE IF NOT EXISTS removal_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  removal_id INTEGER NOT NULL REFERENCES stock_removals (id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_removal_comments_removal ON removal_comments (removal_id, created_at);
