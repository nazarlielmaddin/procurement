-- ═══════════════════════════════════════════════════════════════════
-- Sessiya 2026-09-15 — Anbar / 1C / Anbardar yenilikləri: YENİ cədvəllər
-- Təkrar işlədilə bilər (hamısı IF NOT EXISTS). Sıra vacibdir (FK asılılığı).
-- Mövcud `users` cədvəlinə TOXUNMUR — onun miqrasiyası ayrıca fayldadır:
--   db/users_storekeeper_migration.sql
-- ═══════════════════════════════════════════════════════════════════
PRAGMA foreign_keys = ON;

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

-- Silinmə sənədi (başlıq): № + Təyinat/obyekt + 1 açıqlama + status + tarix + kim yaratdı.
CREATE TABLE IF NOT EXISTS stock_removals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_no TEXT NOT NULL,
  destination TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  -- Təsdiq statusu: pending (gözləyir) → approved (təsdiqləndi). Stok hər iki
  -- halda yaradılan kimi azalır — status yalnız təsdiq izidir, qapı deyil.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
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
