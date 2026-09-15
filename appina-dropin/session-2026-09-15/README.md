# Sessiya 2026-09-15 — Anbar / 1C / Anbardar (yalnız yeniliklər)

Bu paketdə **yalnız bu sessiyada əlavə olunanlar** var — köhnə Sifariş/Kataloq/Panel
kodu yoxdur. Bazası commit `54b732b` → `e2bb914` arası 10 commit-dir.

## Paket tərkibi

```
session-2026-09-15/
  README.md                  ← bu sənəd (bütün dəyişikliklər + access)
  db/
    warehouse.sql            ← 4 YENİ cədvəl + indekslər (təkrar işlənir)
    users_storekeeper_migration.sql ← köhnə DB üçün users rebuild + bölmə backfill
    warehouse_seed.json      ← Excel-dən 86 mal (ilkin stok)
  patches/                   ← sessiya diff-ləri (yalnız dəyişən sətirlər)
    server-routes-procurement.patch  (~345 sətir: bütün anbar endpoint-ləri + qapılar)
    server-lib-proc_access.patch     (isStorekeeper, denyStorekeeper, ensureVisible)
    server-lib-proc_db.patch         (migrate: 4 cədvəl + status + CHECK + bölmələr)
    server-db-schema.patch           (schema-ya 4 cədvəl + status + CHECK + sections)
    server-scripts-seed.patch        (Anbardar user-i + anbar seed-i)
    client-pages-Procurement.patch   (~815 sətir: Anbar/1C UI + drawer + komment)
    client-lib-api.patch             (Pages-demo mock: anbar/silinmə/komment/keeper)
```

`db/warehouse_seed.json`-in client nüsxəsi (`client/src/lib/warehouse_seed.json`)
**Appina-ya lazım deyil** — o, yalnız GitHub-Pages demosunun `localStorage`
mock-u üçündür. Appina real API işlətdiyi üçün server nüsxəsi kifayətdir.

---

## §1. Yeniliklərin siyahısı (xronoloji)

1. **“1C” bölməsi** — sidebar + boş səhifə. Funksiya/cədvəl/demo yoxdur.
2. **“Anbar” bölməsi** — üst cədvəl (əsas stok) + **Əlavə et / Tam yeniləmə /
   Export** + alt cədvəl (**Silinmələr**) + **Silinmə yarat**.
3. **Excel inteqrasiyası** — `anbar faktiki sayım.xlsx` strukturu 1:1
   (`Malın adı | Ölçü vahidi | Miqdarı` → `name | unit | qty`, 86 mal, dublikat
   yoxdur). Import başlığı addan tapır, vergül-nöqtə tolerantdır
   (`1.234,56` → `1234.56`), təsdiq sorğuludur.
4. **Silinmə detalı pəncərəsi** — sətirə klik → sağdan drawer (sifariş
   drawer-inin eyni məntiqi: backdrop, 500ms double-click guard, skeleton).
   İçində: başlıq kartı, Məhsullar cədvəli, **redaktə (✏️)**, **silmə (🗑️)**.
5. **Sənəd-səviyyəli Silinmələr cədvəli** — eyni № = 1 sətir
   (`№ | Tarix | Müştəri | Məhsul sayı | Status | Açıqlama`). Məhsul adı və
   miqdar cədvəldə YOXDUR — yalnız pəncərədədir.
6. **Açıqlama silinmə-səviyyəlidir** — 1 silinmə = 1 açıqlama. Formalardakı
   sətir-açıqlama xanaları yığışdırıldı. Köhnə sətir-açıqlamaları itmir:
   redaktə zamanı avtomatik başlığa köçürülür, cədvəl/pəncərə fallback-la
   göstərir (`note || sətir-açıqlamalarının birləşməsi`).
7. **Silinmə kommentləri** — pəncərədə flat Kommentlər bloku (sifariş üslubunda:
   avatar + ad + “siz” + nisbi vaxt + Enter-lə göndərmə).
8. **Təsdiq statusu** — `pending (Gözləyir)` → `approved (Təsdiqləndi)`.
   Kart mətni: **“Təhvil Təslim aktı imzalanıbsa təsdiq edin.”**
   Təsdiq STOKA TOXUNMUR (stok yaradılanda artıq azalıb).
9. **Anbardar rolu** (`storekeeper`) — Anbar+1C full, sifarişlərdə yalnız
   təsdiqlənmişlərə baxış (§4-də tam matris).
10. **Stok redaktə/silmə** — boss/specialist full; anbardar yalnız mövcud malın
    sayını manual ARTIRA bilər (azaltmaq olmaz).

---

## §2. DB dəyişiklikləri

### 2.1. Yeni cədvəllər (`db/warehouse.sql` — hamısı `IF NOT EXISTS`)

```sql
warehouse_items      (id, name, unit DEFAULT 'ədəd', qty CHECK(qty>=0),
                      created_at, updated_at, UNIQUE(name, unit))
stock_removals       (id, doc_no, destination, note DEFAULT '',
                      status DEFAULT 'pending' CHECK IN ('pending','approved'),
                      created_by → users ON DELETE SET NULL, created_at)
stock_removal_items  (id, removal_id → stock_removals CASCADE,
                      warehouse_item_id → warehouse_items SET NULL,
                      product_name, unit, qty CHECK(qty>0), note DEFAULT '')
removal_comments     (id, removal_id → stock_removals CASCADE,
                      author_id → users RESTRICT, author_name, body, created_at)
+ 6 indeks (bax: warehouse.sql)
```

- `stock_removal_items.product_name/unit` **snapshot**-dur: stokda ad dəyişsə
  tarixçə pozulmur; `warehouse_item_id` əlaqəni saxlayır.
- `note` sütunu `stock_removal_items`-də QALIR (köhnə sətir-açıqlamaları + geriyə
  uyğunluq), amma UI artıq ora YAZMIR — tək mənbə `stock_removals.note`-dur.
- `removal_comments` silinmə silinəndə kaskad silinir; redaktədə qalır.

### 2.2. Mövcud cədvəllərə dəyişiklik

| Cədvəl | Dəyişiklik | Köhnə DB-də miqrasiya |
|---|---|---|
| `users` | `proc_role` CHECK-ə `'storekeeper'` əlavə | **Rebuild lazımdır** (SQLite CHECK-i ALTER etmir) → `users_storekeeper_migration.sql` (transaction, id-lər və FK-lar qorunur) |
| `users` | `sections_csv` DEFAULT-a `warehouse,1c` əlavə | Backfill: hər user-ə çatışmayan `warehouse,1c` əlavə olunur (migrate-dəki “New sections” bloku; mövcudu pozmur) |
| `stock_removals` | `status` sütunu | `ALTER TABLE … ADD COLUMN status … DEFAULT 'pending'` (yoxdursa) |

### 2.3. Seed (`db/warehouse_seed.json` + `seed.js` patch-i)

- 86 mal. **Yalnız stok cədvəli BOŞDURSA** yüklənir — silinmələrin azaltdığı
  qalıq heç vaxt əzilmir (`Seed skipped — table not empty`).
- Anbardar user-i: `login=anbardar`, `sections_csv='warehouse,1c,orders'`
  (həm INSERT, həm UPDATE-də məcburidir — geniş csv daraldılır).

---

## §3. API endpoint-ləri (hamısı `/api/procurement` altında)

### Anbar stoku

| Metod + path | Kim | Validasiya / kodlar | Stok effekti |
|---|---|---|---|
| `GET /warehouse[?q=]` | hamı | — | yoxdur |
| `POST /warehouse` | boss, specialist (anbardar → **403**) | ad mütləq; qty ≥ 0; dublikat (ad+vahid) → **409** | yeni sətir |
| `PUT /warehouse/:id` | boss/specialist full; **anbardar: yalnız `qty`, yalnız artım** | yoxdursa → **404**; anbardar ad/vahid göndərsə → **403** `increase_only`; artım deyilsə → **400** `decrease_forbidden`; boss-da qty<0 → 400, dublikat → 409 | delta |
| `DELETE /warehouse/:id` | boss, specialist (anbardar → **403**) | yoxdursa → **404** | sətir silinir; **silinmə tarixçəsi qalır** (SET NULL + snapshot) |
| `POST /warehouse/replace` | boss, specialist (anbardar → **403**) | `{items:[{name,unit,qty}]}` ≤ 10000; sətir xətası → 400 | **bütün stok əvəz olunur**; tarixçə qalır (linklər NULL olur) |

### Silinmələr

| Metod + path | Kim | Validasiya / kodlar | Stok effekti |
|---|---|---|---|
| `GET /warehouse/removals` | hamı | DESC, limit 500, items ilə | yoxdur |
| `POST /warehouse/removals` | **hamı** (anbardar da) | `destination` mütləq; ≥1 sətir (≤200); hər sətir qty>0; **stokdan artıq → 400** `qty_exceeds`; status həmişə `pending` | **dərhal azalır** (statusdan asılı olmayaraq) |
| `GET /warehouse/removals/:id` | hamı | yoxdursa → **404** | yoxdur |
| `PUT /warehouse/removals/:id` | hamı, AMMA **anbardar təsdiqlənmişi redaktə edə bilməz → 403** `approved_locked` | validasiya POST-la eyni; limit = hazırkı stok + bu silinmədəki köhnə miqdar (eyni məhsulun cəmi yoxlanılır); **öncə yoxlanılır, sonra yazılır** (xətada stok pozulmur); status dəyişmir | məhsul üzrə delta (köhnə − yeni) |
| `DELETE /warehouse/removals/:id` | **hamı** (anbardar da) | yoxdursa → **404** | **miqdarlar stoka qayıdır** (məhsul yoxdursa, o sətir atlanır); sətir+komment kaskad silinir |
| `POST /warehouse/removals/:id/approve` | **boss + specialist** (anbardar → **403**) | yoxdursa → 404; təkrar → **409** `already_approved`; mətn: “Təhvil Təslim aktı…” | **YOXDUR** (status yalnız izdir) |

### Silinmə kommentləri

| Metod + path | Kim | Qeyd |
|---|---|---|
| `GET /warehouse/removals/:id/comments` | hamı | `created_at, id` sırası; silinmə yoxdursa → 404 |
| `POST /warehouse/removals/:id/comments` | hamı | `{body}` mütləq (boş → 400); müəllif = `req.user`; → 201 |

---

## §4. ACCESS — tam RBAC matrisi ⭐

### 4.1. Rollar

| Rol | `proc_role` | Bölmələr (`sections_csv`) | Login qrupu |
|---|---|---|---|
| Boss | `boss` | hamısı | Rəhbərlik |
| Specialist | `procurement_specialist` | hamısı | Mütəxəssislər |
| **Anbardar** | **`storekeeper`** | **`warehouse,1c,orders`** | **Anbar (badge: ANBARDAR)** |

### 4.2. Əməliyyat matrisi (server məcburidir — client gizlətməsi kifayət deyil)

| Əməliyyat | Boss | Specialist | Anbardar |
|---|---|---|---|
| Panel / Kataloq bölməsi | ✅ | ✅ | ❌ (menyuda yox + API **403**) |
| Anbar bölməsi (baxış + Export) | ✅ | ✅ | ✅ |
| Stoka mal əlavə / Tam yeniləmə | ✅ | ✅ | ❌ (düymə yox + **403**) |
| Stok redaktəsi (ad/vahid/azaltmaq) | ✅ | ✅ | ❌ (**403** `increase_only`) |
| Stok miqdarını manual **artırmaq** | ✅ | ✅ | ✅ (tək icazəsi; azaltsa **400**) |
| Stok malını silmək | ✅ | ✅ | ❌ (düymə yox + **403**) |
| Silinmə yaratmaq (stok dərhal azalır) | ✅ | ✅ | ✅ |
| Silinmə detalı + komment | ✅ | ✅ | ✅ |
| Silinmə redaktəsi (gözləyən) | ✅ | ✅ | ✅ |
| Silinmə redaktəsi (**təsdiqlənmiş**) | ✅ | ✅ | ❌ (**403** `approved_locked`, düymə gizli) |
| Silinməni silmək (stok qayıdır) | ✅ | ✅ | ✅ |
| Silinməni **təsdiqləmək** | ✅ | ✅ | ❌ (kart gizli + **403**) |
| Sifariş yarat/redaktə/komment | ✅/✅¹/✅ | ✅/özününkü/✅ | ❌ **403** `storekeeper_readonly` |
| Sifariş siyahısı | hamısı | yalnız özününkü | **yalnız `approved`** (sorğu parametri keçərsizdir) |
| Sifariş detalı | hamısı | yalnız özününkü | yalnız `approved` (yoxsa **403** `not_approved_order`) |
| Sifariş qərarı / reopen / silmə | ✅ | ❌ 403 | ❌ 403 |

¹ Boss redaktəni qərar panelindən edir (PUT ona 403 — köhnə qayda, dəyişməyib).

### 4.3. Server qapıları (harada)

- `proc_access.js`: `isStorekeeper()`, `denyStorekeeper` middleware,
  `ensureVisible()`-də anbardar budağı (yalnız `approved`).
- `procurement.js`: `denyStorekeeper` → `GET /catalog`, `GET /dashboard`,
  `POST/PUT /orders`, `POST /orders/:id/comments`,
  `POST/DELETE /warehouse`, `POST /warehouse/replace`,
  `DELETE /warehouse/:id`, `POST …/approve`;
  `GET /orders`-də anbardara məcburi `status='approved'` filtri.
- `req.user`-də `id, proc_role, proc_access, full_name` olmalıdır (MOUNT.md §2
  ilə eyni müqavilə + `storekeeper` dəyəri).

### 4.4. UI gizlətmələri (serverin təkrarı — müdafiə dərinliyi)

Anbardara: Panel/Kataloq tabları, status filtri, “Yeni sifariş”, sifariş-kommentləri,
“Əlavə et”/“Tam yeniləmə”, stok-sil düyməsi, təsdiq kartı, təsdiqlənmişdə redaktə
düyməsi **görünmür**. Default tabı Anbardır; dashboard sorğusu atılmır.
Stok redaktə modalı anbardarda **“Miqdarı artır”** rejimindədir (ad/vahid bağlı).

### 4.5. Xəta kodları (yeni)

`increase_only` 403 · `decrease_forbidden` 400 · `approved_locked` 403 ·
`storekeeper_readonly` 403 · `not_approved_order` 403 · `already_approved` 409 ·
`duplicate_product` 409 · `qty_exceeds` 400 · `product_not_found`/`removal_not_found` 404.

---

## §5. Frontend dəyişiklikləri (patch: `client-pages-Procurement.patch`)

- `SECTIONS` += `warehouse` (📦 `Warehouse` ikonu, endpoint `/procurement/warehouse`),
  `1c` (ikona `Database`, endpoint YOXDUR — toolbar da yoxdur).
- Üst cədvəl `WH_COLS` = `№ | Malın adı | Ölçü vahidi | Miqdarı` + hover
  redaktə/silmə düymələri; alt blok **“Silinmələr”** başlığı + **“Silinmə yarat”**.
- `REM_COLS` = `№ | Tarix | Müştəri | Məhsul (say, sola) | Status | Açıqlama`
  (`Status` = sifarişlərdəki `StatusBadge`; `Açıqlama` = başlıq qeydi, yoxdursa
  köhnə sətir-qeydlərinin birləşməsi).
- Modallar: `WarehouseForm` (əlavə), `WarehouseEditForm` (full / yalnız-artım),
  `RemovalForm` (№ + Təyinat + 1 Açıqlama + N məhsul sətri),
  `RemovalDrawer` (başlıq + status badge + Məhsullar + Kommentlər + redaktə +
  silmə + təsdiq kartı), `RemovalComments` (flat).
- Cədvəl sətirinə klik → drawer (`removal_id` ilə).
- `Login`: Anbar qrupu + `ANBARDAR` badge; sidebar-da da `ANBARDAR`.
- `api.js` patch-i **yalnız Pages-demosuna aiddir** (localStorage mock:
  anbar seed, silinmə/KRUD riyaziyyatı, kommentlər, keeper qapıları) —
  Appina-ya tətbiq ET
...[truncated 3077 chars]