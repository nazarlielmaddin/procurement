import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { money, fmtDate, fmtDateTime, fmtMonth } from '../lib/format';
import {
  Wallet, LayoutDashboard, ShoppingCart, Tag, Search, Plus, Pencil, Trash2, X,
  Check, CheckCircle2, Clock, XCircle, PieChart as PieIcon, MessageSquare, History,
  Lock, ChevronLeft, ChevronRight, Minus, PanelLeftClose, PanelLeftOpen,
  LogOut, SlidersHorizontal, Upload, FileSpreadsheet, Eye, RotateCcw, TrendingUp, Download, Reply, Menu,
  Warehouse, Database,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

// Brand consts — dəyərlər index.css tokenləri ilə 1:1 eynidir
// (EM=--accent, BLUE=--info, AMBER=--warn, RED=--status-red,
// GREEN_TINT=--green-tint, ACTIVE=--active, VIOLET=--violet).
// JS-də qalırlar, çünki boxShadow-da hex-alpha (`${EM}88`) var()-la mümkün deyil.
const EM = '#10b981';
const BLUE = '#3b82f6';
const AMBER = '#f59e0b';
const RED = '#dc2626';
const VIOLET = '#8b5cf6';
const GREEN_TINT = '#071A1A'; // palette: Green Tint — aktiv menu fonu
const ACTIVE = '#24D9F5'; // tipoqrafiya kataloqu: Aktiv menyu

const PROC_STYLE = `
.proc-app{position:relative}
.proc-app::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;
 background-image:radial-gradient(48rem 48rem at 8% -10%,rgba(16,185,129,.06),transparent 60%),radial-gradient(42rem 42rem at 100% 0,rgba(59,130,246,.05),transparent 55%),radial-gradient(30rem 30rem at 55% 110%,rgba(139,92,246,.04),transparent 60%)}
.proc-app>*{position:relative;z-index:1}
.proc-app>div.fixed{position:fixed!important;z-index:50}
.proc-app>aside{position:sticky!important;top:0;z-index:30;height:100dvh;flex-shrink:0;align-self:flex-start}
.proc-app>section{position:relative;z-index:1;min-height:100dvh}
.proc-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 1px 2px rgba(20,40,60,.05),0 8px 24px -18px rgba(20,40,60,.25);transition:box-shadow .2s,border-color .2s,transform .2s}
.proc-card.hov:hover{border-color:rgba(16,185,129,.40);box-shadow:0 2px 4px rgba(16,185,129,.06),0 16px 32px -18px rgba(16,185,129,.28);transform:translateY(-1px)}
.proc-app tbody tr{transition:background .12s}
.proc-app tbody tr:nth-child(even){background:color-mix(in srgb,var(--elevated) 42%,transparent)}
.proc-app tbody tr:hover{background:rgba(16,185,129,.07)}
.proc-grad{background:linear-gradient(90deg,var(--accent),var(--info),var(--violet),var(--accent));background-size:240% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:procG 5s linear infinite}
@keyframes procG{to{background-position:-240% center}}
.proc-rise{animation:procR .5s cubic-bezier(.2,.7,.2,1) both}
@keyframes procR{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.proc-pop{animation:procP .28s cubic-bezier(.2,.7,.2,1) both}
@keyframes procP{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
.proc-drawer{animation:procD .32s cubic-bezier(.2,.7,.2,1) both}
@keyframes procD{from{opacity:.4;transform:translateX(48px)}to{opacity:1;transform:none}}
.proc-backdrop{animation:procF .2s ease both}
@keyframes procF{from{opacity:0}to{opacity:1}}
.proc-drawer .proc-card{animation:procR .45s cubic-bezier(.2,.7,.2,1) both}
.proc-drawer .proc-card:nth-child(2){animation-delay:.05s}
.proc-drawer .proc-card:nth-child(3){animation-delay:.1s}
.proc-drawer .proc-card:nth-child(4){animation-delay:.15s}
.proc-orb{animation:procO 2.4s ease-in-out infinite}
@keyframes procO{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.45)}50%{box-shadow:0 0 36px 6px rgba(16,185,129,.25)}}
.proc-app button{transition:transform .12s ease,box-shadow .15s ease,filter .15s ease,background-color .15s ease,border-color .15s ease}
.proc-app button:active:not(:disabled){transform:scale(.97)}
.proc-app button:hover:not(:disabled){filter:brightness(1.07)}
.proc-app input:focus,.proc-app select:focus,.proc-app textarea:focus{border-color:var(--accent)!important;box-shadow:0 0 0 3px rgba(16,185,129,.16);outline:none}
.proc-app input::placeholder,.proc-app textarea::placeholder{color:var(--ink-faint);opacity:1}
.proc-btn{background:var(--accent)!important;color:var(--on-accent)!important;font-weight:700}
.proc-btn:hover:not(:disabled){filter:brightness(1.08)}
/* ── Layout system (audit 2026-09): shared classes — təkrarlanan inline bloklar ──
   Radius skalası: kart 16px (.proc-card) / iç panel 12px (rounded-xl) / input-button 8px (rounded-lg).
   Boşluq skalası: bölmə space-y-4 / kart-içi space-y-3 / sıx siyahı space-y-2.5.
   İstisnalar: avatar (insan) rounded-full, ikon-tile rounded-xl, kompakt reply düyməsi. */
.proc-accent-bar{position:absolute;inset-inline:0;top:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--info))}
.proc-accent-bar--trio{background:linear-gradient(90deg,var(--accent),var(--info),var(--violet))}
.proc-btn-grad{background:linear-gradient(135deg,var(--accent),var(--info))!important}
.proc-icon-btn{border-radius:8px;padding:6px;color:var(--ink-faint)}
.proc-icon-btn:hover{color:var(--ink);background:var(--hover)}
.proc-label{margin-bottom:4px;display:block;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-faint)}
.proc-input{width:100%;border-radius:8px;border:1px solid var(--line);background:var(--bg);padding:8px 12px;outline:none}
.proc-input:focus{border-color:var(--accent)}
.proc-role{display:inline-block;border-radius:9999px;padding:1px 6px;font-size:10px;font-weight:700}
.proc-role--boss{color:var(--accent);background:color-mix(in srgb,var(--accent) 10%,transparent)}
.proc-role--spec{color:var(--info);background:color-mix(in srgb,var(--info) 10%,transparent)}
.proc-rowbtn{padding:6px;border-radius:8px;color:var(--ink-faint)}
.proc-rowbtn:hover{background:var(--elevated);color:var(--accent)}
.proc-rowbtn--danger:hover{color:var(--status-red)}
.proc-hdr{height:56px;display:flex;align-items:center;gap:8px;padding-inline:16px;border-bottom:1px solid var(--line)}
.proc-drawer .proc-hdr{position:relative;height:auto;min-height:64px;gap:12px;padding:12px 20px}
.proc-drawer .proc-hdr h2{min-width:0;flex:1;line-height:1.25}
.proc-drawer .proc-drawer-status{flex:0 0 auto}
.proc-drawer .proc-drawer-close{flex:0 0 auto;display:grid;place-items:center;width:36px;height:36px;margin-left:4px;border-radius:10px}
.proc-modal-hdr{position:relative;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding:14px 20px}
.proc-modal-ftr{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid var(--line);padding:14px 20px}
.proc-card-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;margin-bottom:10px}
.cur{font-size:1.4em;font-weight:800;line-height:1;vertical-align:-0.06em}
.proc-skel{background:linear-gradient(90deg,var(--elevated) 25%,var(--hover) 45%,var(--elevated) 65%);background-size:200% 100%;animation:procSk 1.2s ease-in-out infinite}
@keyframes procSk{to{background-position:-200% 0}}
.proc-login-glow{position:absolute;width:38rem;height:38rem;max-width:120vw;border-radius:9999px;background:radial-gradient(circle,rgba(16,185,129,.15),rgba(59,130,246,.06) 55%,transparent 70%);pointer-events:none}
.proc-scroll{scrollbar-width:thin;scrollbar-color:var(--line) transparent}
.proc-scroll::-webkit-scrollbar{width:7px;height:7px}
.proc-scroll::-webkit-scrollbar-thumb{background:var(--line);border-radius:9999px}
.proc-scroll::-webkit-scrollbar-thumb:hover{background:var(--ink-faint)}
.proc-main{min-width:0;min-height:100dvh;overflow-x:hidden}
.proc-content{width:100%;max-width:var(--content-max);margin-inline:auto;padding:20px 24px 12px}
.proc-page-header{display:flex;align-items:center;gap:12px;min-height:40px;margin-bottom:16px}
.proc-toolbar{display:flex;flex:1;min-width:0;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px}
.proc-toolbar>*{max-width:100%}
.proc-search{position:relative;flex:1 1 190px;max-width:208px}
.proc-search input{height:var(--control-h);width:100%}
.proc-control{height:var(--control-h);border-radius:var(--radius-control);padding:0 10px}
.proc-table-wrap{min-width:0;overflow-x:auto;border-radius:var(--radius-card)}
.proc-table{table-layout:fixed}
.proc-table th,.proc-table td{overflow:hidden}
.proc-status-badge{min-width:118px;justify-content:center}
.proc-modal-ftr button,.proc-toolbar button,.proc-toolbar select{min-height:var(--control-h)}
.proc-card{border-radius:var(--radius-card)}
@media (max-width: 767px){
  .proc-content{padding:16px 14px 12px}
  .proc-page-header{align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:14px}
  .proc-page-header h2{font-size:18px}
  .proc-toolbar{flex-basis:100%;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto);justify-content:stretch}
  .proc-toolbar .proc-search{grid-column:1 / -1;max-width:none}
  .proc-toolbar .proc-search input{width:100%}
  .proc-toolbar button,.proc-toolbar select{width:100%;padding-inline:10px}
  .proc-toolbar button{justify-content:center}
  .proc-table-wrap{margin-inline:-1px}
  .proc-modal-hdr,.proc-modal-ftr{padding-inline:16px}
  .proc-modal-ftr{gap:8px}
  .proc-modal-ftr button{flex:1}
}
@media (max-width: 420px){
  .proc-content{padding-inline:10px}
  .proc-toolbar{grid-template-columns:1fr}
  .proc-toolbar>*{grid-column:1 / -1}
  .proc-card{border-radius:12px}
}
@media (max-width: 420px){
  .proc-drawer .proc-hdr{gap:8px;padding-inline:14px}
  .proc-drawer .proc-hdr h2{font-size:13px}
  .proc-drawer .proc-drawer-status{font-size:9px}
  .proc-drawer .proc-drawer-close{width:32px;height:32px;margin-left:0}
}
`;
const Style = () => <style dangerouslySetInnerHTML={{ __html: PROC_STYLE }} />;

const STATUS_META = {
  pending: { label: 'Gözləyir', color: AMBER, bg: `${AMBER}1a`, icon: Clock },
  approved: { label: 'Təsdiqlənib', color: EM, bg: `${EM}1a`, icon: CheckCircle2 },
  partially_approved: { label: 'Qismən təsdiq', color: BLUE, bg: `${BLUE}1a`, icon: Check },
  rejected: { label: 'Rədd edilib', color: RED, bg: `${RED}1a`, icon: XCircle },
};

function StatusBadge({ value }) {
  const m = STATUS_META[value] || { label: value || '—', color: 'var(--ink-faint)', bg: 'color-mix(in srgb, var(--ink-faint) 10%, transparent)' };
  const Icon = m.icon || Minus;
  return (
    <span className="proc-status-badge inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap"
      style={{ color: m.color, background: m.bg, boxShadow: `inset 0 0 0 1px ${m.color}44` }}>
      <Icon size={11} strokeWidth={2.5} />{m.label}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, accent }) {
  return (
    <div className="proc-card hov proc-rise relative overflow-hidden p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-xl shrink-0" style={{ background: `${accent}1a`, color: accent }}>
          <Icon size={16} strokeWidth={2.25} />
        </span>
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint leading-tight">{label}</div>
      </div>
      <div className="mt-2.5 text-[22px] font-black leading-none tabular-nums tracking-tight" style={{ color: accent }}>{value}</div>
      <Icon size={92} color={accent} strokeWidth={1} className="pointer-events-none absolute -right-3 -bottom-5 opacity-[0.08]" />
    </div>
  );
}

// Skeleton rows for loading states (matches Table paddings).
function SkeletonTable({ cols = 5, rows = 6 }) {
  return (
    <div className="proc-card overflow-hidden p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2.5 py-2" style={{ opacity: 1 - i * 0.11 }}>
          <div className="proc-skel h-3.5 w-8 rounded" />
          <div className="proc-skel h-3.5 flex-1 rounded" />
          <div className="proc-skel h-3.5 w-24 rounded hidden sm:block" />
          <div className="proc-skel h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// Premium empty state with a lucide illustration.
function EmptyState({ icon: Icon = ShoppingCart, title = 'Məlumat yoxdur', hint, action }) {
  return (
    <div className="proc-card proc-rise px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-xl"
        style={{ background: `linear-gradient(135deg, ${EM}14, ${BLUE}14)`, color: EM, boxShadow: `inset 0 0 0 1px ${EM}30` }}>
        <Icon size={26} strokeWidth={1.75} />
      </div>
      <div className="text-[13px] font-bold">{title}</div>
      {hint && <div className="mx-auto mt-1.5 max-w-sm text-[12px] text-ink-faint">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// Generic table (finance Table pattern, simplified).
function Table({ columns, rows, onRowClick, rowActions, minWidth = 640 }) {
  return (
    <div className="proc-card proc-table-wrap proc-rise">
      <table className="proc-table w-full text-[13px] text-ink-muted" style={{ minWidth }}>
        <colgroup>
          {columns.map((c) => <col key={c.key} style={c.width ? { width: c.width } : undefined} />)}
          {rowActions && <col style={{ width: 76 }} />}
        </colgroup>
        <thead>
          <tr className="border-b border-line text-left text-[10px] uppercase tracking-wider text-ink-faint">
            {columns.map((c) => (
              <th key={c.key} className={`px-2.5 py-2 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>
            ))}
            {rowActions && <th className="px-2.5 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length + 1} className="px-4 py-12 text-center text-ink-faint">
            <div className="grid place-items-center gap-2"><ShoppingCart size={26} strokeWidth={1.5} className="opacity-40" /><span className="text-[12px] font-medium">Məlumat yoxdur</span></div>
          </td></tr>}
          {rows.map((row) => (
            <tr key={row.id} className={`group border-b border-line/60 ${onRowClick ? 'cursor-pointer' : ''}`} onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map((c) => (
                <td key={c.key} className={`px-2.5 py-2 ${c.align === 'right' ? 'text-right tabular-nums' : ''} ${c.strong ? 'font-semibold' : ''}`}>
                  {c.cell ? c.cell(row) : (row[c.key] ?? '—')}
                </td>
              ))}
              {rowActions && (
                <td className="px-2.5 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex gap-1 transition sm:opacity-0 sm:group-hover:opacity-100">
                    {rowActions(row)}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ onClose, children, maxWidth = 560 }) {
  // Double-click guard (drawer-dəki kimi): açılış klikinin əks-sədası backdrop-a düşsə, ilk 500ms bağlanma.
  const openedAt = useRef(Date.now());
  const safeClose = () => { if (Date.now() - openedAt.current > 500) onClose?.(); };
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="proc-backdrop fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-[3px]" onClick={safeClose}>
      <div className="proc-card proc-pop w-full max-h-[90vh] flex flex-col overflow-hidden" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── Order builder (specialist create / edit pending) ──
const blankItem = () => ({ catalog_id: null, product_name: '', unit: '', unit_price: '', requested_qty: '' });

function OrderForm({ order, onClose, onSave, saving, serverErr }) {
  // Catalog for the ID picker — loaded on demand by the form itself, so the
  // catalog tab keeps a single query and no duplicate fetch exists.
  const { data: catData } = useQuery({ queryKey: ['proc', 'catalog'], queryFn: () => api.get('/procurement/catalog') });
  const catalog = catData?.items || [];
  const [requesterName, setRequesterName] = useState(order?.requester_name || '');
  const [reason, setReason] = useState(order?.reason || '');
  const [items, setItems] = useState(() =>
    order?.items?.length
      ? order.items.map((it) => ({ catalog_id: it.catalog_id, product_name: it.product_name, unit: it.unit, unit_price: String(it.unit_price), requested_qty: String(it.requested_qty) }))
      : [blankItem()],
  );
  const [idSearch, setIdSearch] = useState('');
  const [err, setErr] = useState('');
  const setItem = (idx, k, v) => setItems((p) => p.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));

  const pickFromCatalog = (idx, c) => {
    setItems((p) => {
      // No empty row left: append a fresh one instead of overwriting user data.
      const at = idx >= 0 && idx < p.length ? idx : p.length;
      const rows = at === p.length ? [...p, blankItem()] : [...p];
      rows[at] = { ...rows[at], catalog_id: c.id, product_name: c.name, unit: c.unit, unit_price: String(c.buy_price) };
      return rows;
    });
  };

  const searchHits = idSearch.trim()
    ? (catalog || []).filter((c) =>
        c.internal_id.toUpperCase().includes(idSearch.trim().toUpperCase()) ||
        c.name.toLowerCase().includes(idSearch.trim().toLowerCase())).slice(0, 6)
    : [];

  const total = items.reduce((s, it) => s + (Number(it.requested_qty) || 0) * (Number(it.unit_price) || 0), 0);

  const submit = () => {
    setErr('');
    if (!requesterName.trim()) { setErr('Sifariş edən əməkdaşın adı mütləqdir'); return; }
    if (!reason.trim()) { setErr('Sifariş səbəbi mütləqdir'); return; }
    // Every non-empty row must be complete: silent drops confused totals.
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const touched = it.product_name.trim() || it.unit.trim() || String(it.unit_price).trim() !== '' || String(it.requested_qty).trim() !== '';
      if (!touched) continue; // fully blank row — skipped
      const label = it.product_name.trim() || `Sətir ${i + 1}`;
      if (!it.product_name.trim()) { setErr(`Sətir ${i + 1} — məhsul adı yazın və ya sətri silin`); return; }
      if (!it.unit.trim()) { setErr(`"${label}" — ölçü vahidi yazın`); return; }
      if (String(it.unit_price).trim() === '' || !(Number(it.unit_price) >= 0)) { setErr(`"${label}" — qiyməti daxil edin (0 və ya böyük)`); return; }
      if (!(Number(it.requested_qty) > 0)) { setErr(`"${label}" — miqdar 0-dan böyük olmalıdır`); return; }
    }
    const valid = items.filter((it) => it.product_name.trim() && it.unit.trim());
    if (!valid.length) { setErr('Ən azı bir məhsul əlavə edin'); return; }
    onSave({
      requester_name: requesterName.trim(),
      reason: reason.trim(),
      items: valid.map((it) => ({
        catalog_id: it.catalog_id || undefined,
        product_name: it.product_name.trim(),
        unit: it.unit.trim(),
        unit_price: Number(it.unit_price),
        requested_qty: Number(it.requested_qty),
      })),
    });
  };

  return (
    <Modal onClose={onClose} maxWidth={760}>
      <div className="proc-modal-hdr shrink-0">
        <span className="proc-accent-bar rounded-full" />
        <h3 className="flex items-center gap-2 text-[14px] font-bold">
          <ShoppingCart size={18} color={EM} />
          {order ? 'Sifarişi redaktə et' : 'Yeni sifariş tələbi'}
        </h3>
        <button onClick={onClose} className="proc-icon-btn"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4 proc-scroll">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[13px] block">
            <span className="proc-label">Sifariş edən əməkdaş *</span>
            <input value={requesterName} onChange={(e) => setRequesterName(e.target.value)} placeholder="Ad Soyad" className="proc-input" />
          </label>
          <label className="text-[13px] block">
            <span className="proc-label">Səbəb *</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Məs: yeni əməkdaş üçün" className="proc-input" />
          </label>
        </div>
        <div className="relative">
          <span className="proc-label">Kataloqdan ID ilə əlavə et</span>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-ink-faint" />
            <input value={idSearch} onChange={(e) => setIdSearch(e.target.value)} placeholder="Daxili ID və ya ad yazın…" className="proc-input pl-8 pr-2 py-2 text-[13px]" />
          </div>
          {searchHits.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-surface shadow-float overflow-hidden">
              {searchHits.map((c) => (
                <button key={c.id} onClick={() => { const idx = items.findIndex((it) => !it.product_name.trim()); pickFromCatalog(idx, c); setIdSearch(''); }}
                  className="w-full text-left px-3 py-2 text-[12px] hover:bg-elevated flex items-center justify-between gap-2">
                  <span><b className="font-mono">{c.internal_id}</b> - {c.name} - {c.firm || 'UMUMI'}</span>
                  <span className="text-ink-faint tabular-nums">{money(c.buy_price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead>
              <tr className="border-b border-line bg-elevated/40 text-left text-[10px] uppercase tracking-wider text-ink-faint">
                <th className="px-2.5 py-1.5 w-8 text-center">№</th>
                <th className="px-2.5 py-1.5">Məhsul</th>
                <th className="px-2.5 py-1.5 w-20">Vahid</th>
                <th className="px-2.5 py-1.5 w-24 text-right">Qiymət</th>
                <th className="px-2.5 py-1.5 w-20 text-right">Miqdar</th>
                <th className="px-2.5 py-1.5 w-24 text-right">Cəmi</th>
                <th className="px-2.5 py-1.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx} className="border-b border-line/60 last:border-b-0">
                  <td className="px-2.5 py-1.5 text-center text-ink-faint">{idx + 1}</td>
                  <td className="px-2.5 py-1.5"><input value={it.product_name} onChange={(e) => setItem(idx, 'product_name', e.target.value)} placeholder="Məhsul adı" className="proc-input min-w-[140px] px-2 py-1.5" /></td>
                  <td className="px-2.5 py-1.5"><input value={it.unit} onChange={(e) => setItem(idx, 'unit', e.target.value)} placeholder="əd" className="proc-input px-2 py-1.5" /></td>
                  <td className="px-2.5 py-1.5"><input type="number" step="any" value={it.unit_price} onChange={(e) => setItem(idx, 'unit_price', e.target.value)} className="proc-input px-2 py-1.5 text-right tabular-nums" /></td>
                  <td className="px-2.5 py-1.5"><input type="number" step="any" value={it.requested_qty} onChange={(e) => setItem(idx, 'requested_qty', e.target.value)} className="proc-input px-2 py-1.5 text-right tabular-nums" /></td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums text-ink-muted">{money((Number(it.requested_qty) || 0) * (Number(it.unit_price) || 0))}</td>
                  <td className="px-2.5 py-1.5 text-center"><button onClick={() => setItems((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p))} className="proc-rowbtn proc-rowbtn--danger"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button onClick={() => setItems((p) => [...p, blankItem()])} className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink hover:border-[var(--accent)]"><Plus size={14} /> Sətir əlavə et</button>
          <div className="text-[13px] font-bold">Ümumi: <span className="font-mono" style={{ color: EM }}>{money(total)}</span></div>
        </div>
        {(err || serverErr) && <p className="text-[12px] text-[var(--status-red)]">{err || serverErr}</p>}
      </div>
      <div className="proc-modal-ftr shrink-0">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-ink-muted hover:bg-elevated">Ləğv</button>
        <button onClick={submit} disabled={saving} className="proc-btn rounded-lg px-4 py-2 text-[13px] disabled:opacity-50">{saving ? '...' : 'Yadda saxla'}</button>
      </div>
    </Modal>
  );
}

// ── Threaded comments (Instagram/Discord stili): avatar + ad + rol badge +
// tarix + mətn, reply (1 səviyyə), @mention (autocomplete + highlight).
// Persist serverdədir (comments cədvəli) — səhifə yenilənəndə itmir.
const AVATAR_GRADS = [
  'linear-gradient(135deg,#10b981,#3b82f6)', 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)', 'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#06b6d4,#10b981)', 'linear-gradient(135deg,#ec4899,#f59e0b)',
];
function avatarGrad(name) {
  let h = 0;
  for (const ch of String(name || '?')) h = (h * 31 + ch.codePointAt(0)) % 997;
  return AVATAR_GRADS[h % AVATAR_GRADS.length];
}
function initialsOf(name) {
  return String(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}
function fmtAgo(v) {
  if (!v) return '';
  const t = new Date(String(v).replace(' ', 'T').replace(/Z?$/, 'Z')).getTime();
  if (!Number.isFinite(t)) return fmtDateTime(v);
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'indi';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dəq`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} gün`;
  return fmtDateTime(v);
}
// "@login" nümunələrini mention chip-inə çevirir (XSS-siz: yalnız match-lər bəzədilir).
function MentionText({ text }) {
  const parts = String(text || '').split(/(@[A-Za-z0-9._-]{1,60})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^@[A-Za-z0-9._-]{1,60}$/.test(p)
          ? <span key={i} className="rounded px-1 py-px text-[11px] font-bold" style={{ color: ACTIVE, background: `${ACTIVE}1a` }}>{p}</span>
          : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function CommentRow({ c, me, depth, onReply, replying, replyDraft, setReplyDraft, sendState, onSendReply, onCancelReply, mentionables, onMentionPick }) {
  const isBoss = c.author_role === 'boss';
  const mine = me?.id === c.author_id;
  const [showSug, setShowSug] = useState(false);
  const active = replying === c.id;
  const draft = active ? replyDraft : '';

  // "@" yazılanda mention autocomplete açılır.
  const caretMention = (() => {
    const m = /(^|\s)@([A-Za-z0-9._-]{0,60})$/.exec(draft);
    return m ? m[2].toLowerCase() : null;
  })();
  const sugList = caretMention !== null
    ? (mentionables || []).filter((u) => (`${u.full_name} ${u.login}`).toLowerCase().includes(caretMention)).slice(0, 5)
    : [];
  const showList = active && showSug && caretMention !== null;

  const onDraftChange = (v) => {
    setReplyDraft(v);
    setShowSug(/@/.test(v));
  };
  const pickMention = (u) => {
    const nv = draft.replace(/(^|\s)@[A-Za-z0-9._-]{0,60}$/, `$1@${u.login} `);
    onMentionPick(nv);
    setShowSug(false);
  };

  return (
    <div className={`flex gap-2 ${depth > 0 ? 'ml-6 mt-2' : ''}`}>
      <span className="grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-black text-white"
        style={{ background: avatarGrad(c.author_name) }} title={c.author_name}>
        {initialsOf(c.author_name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="rounded-xl border border-line bg-bg px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <b className="min-w-0 truncate text-[11px] text-ink">{c.author_name}</b>
            <span className={`proc-role ${isBoss ? 'proc-role--boss' : 'proc-role--spec'}`}>
              {isBoss ? 'BOSS' : 'SPECIALIST'}
            </span>
            {mine && <span className="text-[9px] font-semibold text-ink-faint">· siz</span>}
            <span className="ml-auto text-[10px] text-ink-faint" title={fmtDateTime(c.created_at)}>{fmtAgo(c.created_at)}</span>
          </div>
          {c.parent && (
            <div className="mt-1 truncate rounded-lg border-l-2 border-line bg-elevated/50 px-2 py-1 text-[10px] text-ink-faint">
              <b className="text-ink-muted">{c.parent.author_name}</b> · {String(c.parent.body || '').slice(0, 80)}
            </div>
          )}
          <div className="mt-1 text-[12px] leading-relaxed whitespace-pre-wrap break-words"><MentionText text={c.body} /></div>
        </div>
        <div className="mt-1 flex items-center gap-2 px-1">
          {depth === 0 && (
            <button onClick={() => onReply(c)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink-faint hover:text-[var(--accent)]">
              <Reply size={11} /> Cavabla
            </button>
          )}
          {(c.replies?.length > 0) && <span className="text-[10px] text-ink-faint">{c.replies.length} cavab</span>}
        </div>
        {active && (
          <div className="relative mt-2">
            {showList && sugList.length > 0 && (
              <div className="absolute bottom-full left-0 z-10 mb-1 w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-float">
                {sugList.map((u) => (
                  <button key={u.id} onClick={() => pickMention(u)}
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] hover:bg-elevated">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full text-[8px] font-black text-white" style={{ background: avatarGrad(u.full_name) }}>
                      {initialsOf(u.full_name)}
                    </span>
                    <span className="min-w-0"><b className="block truncate">{u.full_name}</b><span className="block truncate font-mono text-[10px] text-ink-faint">@{u.login}</span></span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input value={draft} onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSendReply(); } if (e.key === 'Escape') onCancelReply(); }}
                placeholder={`@${c.author_name.split(' ')[0]}… (@ ilə mention)`} autoFocus
                className="proc-input flex-1 px-2.5 py-1.5 text-[13px]" />
              <button onClick={onSendReply} disabled={sendState.isPending || !draft.trim()}
                className="proc-btn rounded-lg px-3 py-1.5 text-[12px] disabled:opacity-40">Göndər</button>
              <button onClick={onCancelReply} className="rounded-lg px-2 py-1.5 text-[12px] text-ink-faint hover:bg-elevated"><X size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Comments({ orderId, me, comments }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [replying, setReplying] = useState(null); // parent comment id
  const [replyDraft, setReplyDraft] = useState('');
  const [err, setErr] = useState('');
  const [showSug, setShowSug] = useState(false);
  const listRef = useRef(null);

  const { data: mentionData } = useQuery({
    queryKey: ['proc', 'order', orderId, 'mentionables'],
    queryFn: () => api.get(`/procurement/orders/${orderId}/mentionables`),
  });
  const mentionables = mentionData?.users || [];

  // Flat siyahı → thread ağacı (1 səviyyə: top-level + replies).
  const byId = new Map((comments || []).map((c) => [c.id, { ...c, replies: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    const p = c.parent_id ? byId.get(c.parent_id) : null;
    if (p) { p.replies.push(c); c.parent = { author_name: p.author_name, body: p.body }; }
    else roots.push(c);
  }

  const send = useMutation({
    mutationFn: (payload) => api.post(`/procurement/orders/${orderId}/comments`, payload),
    onSuccess: () => {
      setText(''); setReplyDraft(''); setReplying(null); setErr(''); setShowSug(false);
      qc.invalidateQueries({ queryKey: ['proc', 'order', orderId] });
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }));
    },
    onError: (e) => setErr(e?.message || 'Comment göndərilmədi'),
  });

  const postTop = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    setErr('');
    send.mutate({ body });
  };
  const postReply = () => {
    const body = replyDraft.trim();
    if (!body || !replying || send.isPending) return;
    setErr('');
    send.mutate({ body, parent_id: replying });
  };
  const startReply = (c) => {
    setReplying(c.id);
    setErr('');
    // Köməkçi: reply avtomatik "@Ad" ilə başlayır.
    const first = String(c.author_name || '').split(' ')[0];
    setReplyDraft((d) => (d.trim() ? d : `@${first} `));
  };

  const caretMention = (() => {
    const m = /(^|\s)@([A-Za-z0-9._-]{0,60})$/.exec(text);
    return m ? m[2].toLowerCase() : null;
  })();
  const sugList = caretMention !== null
    ? mentionables.filter((u) => (`${u.full_name} ${u.login}`).toLowerCase().includes(caretMention)).slice(0, 5)
    : [];
  const pickMention = (u) => {
    setText((t) => t.replace(/(^|\s)@[A-Za-z0-9._-]{0,60}$/, `$1@${u.login} `));
    setShowSug(false);
  };

  return (
    <div className="proc-card p-4">
      <div className="mb-2.5 flex items-center gap-2 text-[12px] font-bold">
        <MessageSquare size={15} color={EM} /> Commentariyalar
        <span className="rounded-full bg-elevated px-2 py-px text-[10px] font-bold tabular-nums text-ink-muted">{comments?.length || 0}</span>
      </div>
      <div ref={listRef} className="proc-scroll max-h-80 space-y-3 overflow-y-auto pr-1">
        {(roots || []).length === 0 && <p className="text-[11px] text-ink-faint">Hələ comment yoxdur — ilk yazan siz olun</p>}
        {roots.map((c) => (
          <div key={c.id}>
            <CommentRow c={c} me={me} depth={0} onReply={startReply}
              replying={replying} replyDraft={replyDraft} setReplyDraft={setReplyDraft}
              sendState={send} onSendReply={postReply} onCancelReply={() => { setReplying(null); setReplyDraft(''); }}
              mentionables={mentionables} onMentionPick={setReplyDraft} />
            {c.replies.map((r) => (
              <CommentRow key={r.id} c={r} me={me} depth={1}
                onReply={() => {}} replying={null} replyDraft="" setReplyDraft={() => {}}
                sendState={send} onSendReply={() => {}} onCancelReply={() => {}}
                mentionables={[]} onMentionPick={() => {}} />
            ))}
          </div>
        ))}
      </div>
      {err && <p className="mt-2 text-[12px] text-[var(--status-red)]">{err}</p>}
      <div className="relative mt-2.5">
        {showSug && caretMention !== null && sugList.length > 0 && (
          <div className="absolute bottom-full left-0 z-10 mb-1 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-float">
            {sugList.map((u) => (
              <button key={u.id} onClick={() => pickMention(u)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-elevated">
                <span className="grid size-5 shrink-0 place-items-center rounded-full text-[8px] font-black text-white" style={{ background: avatarGrad(u.full_name) }}>
                  {initialsOf(u.full_name)}
                </span>
                <span className="min-w-0"><b className="block truncate">{u.full_name}</b><span className="block truncate font-mono text-[10px] text-ink-faint">@{u.login}</span></span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-black text-white"
            style={{ background: avatarGrad(me?.full_name) }}>{initialsOf(me?.full_name)}</span>
          <input value={text} onChange={(e) => { setText(e.target.value); setShowSug(/@/.test(e.target.value)); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postTop(); } }}
            placeholder="Comment yazın… (@ ilə kimisə tag edin)"
            className="proc-input flex-1 text-[13px]" />
          <button onClick={postTop} disabled={send.isPending || !text.trim()}
            className="proc-btn proc-btn-grad rounded-lg px-4 py-2 text-[13px] disabled:opacity-40">
            {send.isPending ? '…' : 'Göndər'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Order detail drawer: items + boss decision + comments + history ──
function OrderDrawer({ orderId, me, onClose, onChanged }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['proc', 'order', orderId], queryFn: () => api.get(`/procurement/orders/${orderId}`) });
  const [qty, setQty] = useState({});
  const [decisionComment, setDecisionComment] = useState('');
  const [mode, setMode] = useState(null); // null | 'approve' | 'partial' | 'reject'
  const isBoss = me?.proc_role === 'boss';

  // Double-click guard: açılışı edən klik paneli bağlaya bilməz.
  // Sürətli ikinci klik backdrop-a düşür — ilk 500ms-də backdrop bağlanmanı iqnor et.
  const openedAt = useRef(Date.now());
  const safeClose = () => { if (Date.now() - openedAt.current > 500) onClose?.(); };

  // Seed the partial-approval draft ONCE per opened order — never clobber
  // the boss's typed quantities on later refetches (comments, etc.).
  const seededFor = useRef(null);
  useEffect(() => {
    if (data?.items && seededFor.current !== orderId) {
      const init = {};
      for (const it of data.items) init[it.id] = String(it.requested_qty);
      setQty(init);
      setMode(null);
      setDecisionComment('');
      seededFor.current = orderId;
    }
  }, [data, orderId]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['proc', 'order', orderId] }); qc.invalidateQueries({ queryKey: ['proc', 'orders'] }); qc.invalidateQueries({ queryKey: ['proc', 'dashboard'] }); onChanged?.(); };

  const decide = useMutation({
    mutationFn: (payload) => api.post(`/procurement/orders/${orderId}/decision`, payload),
    onSuccess: refresh,
    onError: (e) => setDecideErr(e?.message || 'Qərar yadda saxlanmadı'),
  });
  const reopen = useMutation({
    mutationFn: () => api.post(`/procurement/orders/${orderId}/reopen`, {}),
    onSuccess: refresh,
    onError: (e) => window.alert(e?.message || 'Yenidən açılmadı'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/procurement/orders/${orderId}`),
    onSuccess: () => { onChanged?.(); onClose?.(); },
  });
  const askDelete = () => {
    if (remove.isPending) return;
    if (!window.confirm(`Sifariş #${orderId} və ona aid tarixçə/commentlər silinəcək. Davam edilsin?`)) return;
    remove.mutate();
  };
  const askReopen = () => {
    if (reopen.isPending) return;
    if (!window.confirm(`Sifariş #${orderId} yenidən "Gözləyir" statusuna qaytarılacaq və yeni qərar verə biləcəksiniz. Davam edilsin?`)) return;
    reopen.mutate();
  };

  const [decideErr, setDecideErr] = useState('');
  const submitDecision = (decision) => {
    setDecideErr('');
    const payload = { decision };
    if (decision === 'partially_approved') {
      payload.items = [];
      for (const it of (data.items || [])) {
        const raw = String(qty[it.id] ?? '').trim();
        if (raw === '' || !Number.isFinite(Number(raw))) { setDecideErr(`"${it.product_name}" — təsdiq miqdarını yazın`); return; }
        const q = Number(raw);
        if (q < 0) { setDecideErr(`"${it.product_name}" — miqdar mənfi ola bilməz`); return; }
        if (q > Number(it.requested_qty)) { setDecideErr(`"${it.product_name}" — təsdiq (${q}) tələbdən (${it.requested_qty}) çox ola bilməz`); return; }
        payload.items.push({ id: it.id, approved_qty: q });
      }
      if (decisionComment.trim()) payload.comment = decisionComment.trim();
    }
    if (decision === 'rejected') {
      if (decisionComment.trim()) payload.comment = decisionComment.trim();
    }
    if (decision === 'approved' && decisionComment.trim()) payload.comment = decisionComment.trim();
    decide.mutate(payload);
  };

  const order = data?.order;
  const items = data?.items || [];
  const locked = order && order.status !== 'pending';

  return (
    <div className="fixed inset-0 z-50" onClick={safeClose}>
      <div className="proc-backdrop absolute inset-0 backdrop-blur-[3px]" style={{ background: 'color-mix(in oklab, var(--bg) 55%, transparent)' }} />
      <div className="proc-drawer absolute top-0 right-0 h-full w-full bg-elevated shadow-float flex flex-col proc-scroll overflow-y-auto" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <Style />
        <div className="proc-hdr sticky top-0 bg-elevated z-10">
          <span className="proc-accent-bar proc-accent-bar--trio" />
          <h2 className="text-[14px] font-semibold text-ink">Sifariş #{orderId}</h2>
          {order && <span className="proc-drawer-status"><StatusBadge value={order.status} /></span>}
          {isBoss && <button onClick={askDelete} disabled={remove.isPending} title="Sifarişi sil"
            className="proc-drawer-close text-[var(--status-red)] hover:bg-[var(--status-red)]/10 disabled:opacity-50">
            <Trash2 size={17} />
          </button>}
          <button onClick={onClose} className="proc-drawer-close text-ink-faint hover:text-ink hover:bg-elevated"><X size={18} /></button>
        </div>
        {isLoading || !order ? (
          <div className="space-y-4 p-4">
            <div className="proc-skel h-28 rounded-2xl" />
            <div className="proc-skel h-44 rounded-2xl" style={{ opacity: .8 }} />
            <div className="proc-skel h-32 rounded-2xl" style={{ opacity: .6 }} />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="proc-card p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                <div><div className="proc-label">Sifariş edən</div><div className="font-semibold break-words">{order.requester_name}</div></div>
                <div><div className="proc-label">Tarix</div><div>{fmtDateTime(order.created_at)}</div></div>
                <div className="col-span-1 sm:col-span-2"><div className="proc-label">Səbəb</div><div className="break-words">{order.reason}</div></div>
                <div><div className="proc-label">Tələb cəmi</div><div className="font-mono font-bold">{money(order.requested)}</div></div>
                {locked && <div><div className="proc-label">Təsdiq cəmi</div><div className="font-mono font-bold" style={{ color: EM }}>{money(order.approved)}</div></div>}
              </div>
            </div>

            <div className="proc-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line text-[12px] font-bold">Məhsullar</div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-ink-faint">
                    <th className="px-2.5 py-1.5">Məhsul</th>
                    <th className="px-2.5 py-1.5 text-right">Qiymət</th>
                    <th className="px-2.5 py-1.5 text-right">Tələb</th>
                    {locked && <th className="px-2.5 py-1.5 text-right">Təsdiq</th>}
                    {isBoss && !locked && mode === 'partial' && <th className="px-2.5 py-1.5 text-right">Təsdiq ✎</th>}
                    <th className="px-2.5 py-1.5 text-right">Cəmi</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-line/50">
                      <td className="px-2.5 py-2"><span className="block break-words">{it.product_name}</span><div className="text-[10px] text-ink-faint">{it.unit}</div></td>
                      <td className="px-2.5 py-2 text-right tabular-nums">{money(it.unit_price)}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums font-semibold">{it.requested_qty}</td>
                      {locked && (
                        <td className="px-2.5 py-2 text-right tabular-nums font-bold" style={{ color: it.approved_qty_eff < it.requested_qty ? AMBER : EM }}>
                          {it.approved_qty_eff}
                        </td>
                      )}
                      {isBoss && !locked && mode === 'partial' && (
                        <td className="px-2.5 py-1.5 text-right">
                          <input type="number" step="any" min="0" max={it.requested_qty} value={qty[it.id] ?? ''} onChange={(e) => setQty((q) => ({ ...q, [it.id]: e.target.value }))}
                            className="proc-input w-20 px-1.5 py-1 text-[11px] text-right tabular-nums" />
                        </td>
                      )}
                      <td className="px-2.5 py-2 text-right tabular-nums">{money(it.line_requested)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isBoss && locked && (
              <div className="proc-card p-4 flex flex-wrap items-center gap-2">
                <RotateCcw size={15} color={AMBER} />
                <span className="text-[12px] text-ink-muted">Qərarı dəyişmək üçün sifarişi yenidən gözləməyə qaytarın.</span>
                <button onClick={askReopen} disabled={reopen.isPending}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-bold hover:brightness-110 disabled:opacity-50"
                  style={{ borderColor: `${AMBER}80`, background: `${AMBER}1a`, color: AMBER }}>
                  <RotateCcw size={14} /> {reopen.isPending ? 'Açılır…' : 'Qərarı dəyiş'}
                </button>
              </div>
            )}

            {isBoss && !locked && (
              <div className="proc-card overflow-hidden p-4">
                <div className="proc-card-title">
                  <SlidersHorizontal size={15} color={EM} />
                  Boss qərarı
                </div>
                {mode === null ? (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setMode('approve')} className="proc-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px]" style={{ boxShadow: `0 10px 22px -10px ${EM}88` }}><Check size={15} strokeWidth={2.5} />Təsdiq et</button>
                    <button onClick={() => setMode('partial')} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-bg px-4 py-2 text-[13px] font-semibold hover:border-[var(--info)]" style={{ boxShadow: '0 4px 12px -8px rgba(59,130,246,.5)' }}><SlidersHorizontal size={14} />Qismən təsdiq</button>
                    <button onClick={() => setMode('reject')} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: RED, boxShadow: '0 10px 22px -10px rgba(220,38,38,.7)' }}><X size={15} strokeWidth={2.5} />Rədd et</button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {mode === 'partial' && <p className="text-[11px] text-ink-faint">Yuxarıdakı cədvəldə hər məhsul üçün təsdiq miqdarını düzəldin, sonra təsdiqləyin.</p>}
                    <textarea value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} rows={2}
                      placeholder="Commentariya (istəyə bağlı)…"
                      className="proc-input text-[13px]" />
                    {(decideErr || decide.isError) && <p className="text-[12px] text-[var(--status-red)]">{decideErr || decide.error?.message}</p>}
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setMode(null); setDecisionComment(''); }} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-ink-muted hover:bg-elevated">Ləğv</button>
                      <button onClick={() => submitDecision(mode === 'approve' ? 'approved' : mode === 'partial' ? 'partially_approved' : 'rejected')}
                        disabled={decide.isPending} className={mode === 'reject' ? 'rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50' : 'proc-btn rounded-lg px-4 py-2 text-[13px] disabled:opacity-50'}
                        style={mode === 'reject' ? { background: RED } : { background: `linear-gradient(135deg, ${EM}, ${BLUE})` }}>
                        {decide.isPending ? '...' : mode === 'approve' ? 'Təsdiqlə' : mode === 'partial' ? 'Qismən təsdiqlə' : 'Rədd et'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <Comments orderId={orderId} me={me} comments={data.comments} />

            <div className="proc-card p-4">
              <div className="proc-card-title"><History size={15} color={EM} /> Tarixçə</div>
              <div className="relative space-y-3 pl-5 before:absolute before:left-[5px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-[var(--line)]">
                {(data.history || []).map((h) => {
                  const hm = STATUS_META[h.to_status];
                  return (
                    <div key={h.id} className="relative text-[11px]">
                      <span className="absolute top-1 grid size-3 place-items-center rounded-full bg-surface" style={{ left: -22, boxShadow: `0 0 0 2px ${hm?.color || EM}` }}>
                        <span className="size-1.5 rounded-full" style={{ background: hm?.color || EM }} />
                      </span>
                      <span className="text-ink-muted">{h.from_status ? `${STATUS_META[h.from_status]?.label || h.from_status} → ` : ''}<b className="text-ink" style={hm ? { color: hm.color } : undefined}>{STATUS_META[h.to_status]?.label || h.to_status}</b></span>
                      <span className="block text-[10px] text-ink-faint">{h.actor_name || ''} · {fmtDateTime(h.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Silinmə detalları drawer-i (sifariş drawer-i məntiqi): baxış + redaktə + silmə ──
function RemovalDrawer({ removalId, stock, onClose, onChanged }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['proc', 'removal', removalId],
    queryFn: () => api.get(`/procurement/warehouse/removals/${removalId}`),
  });
  const [editing, setEditing] = useState(false);
  const [docNo, setDocNo] = useState('');
  const [destination, setDestination] = useState('');
  const [headerNote, setHeaderNote] = useState('');
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState('');

  // Double-click guard: açılışı edən klik paneli bağlaya bilməz (OrderDrawer ilə eyni).
  const openedAt = useRef(Date.now());
  const safeClose = () => { if (Date.now() - openedAt.current > 500) onClose?.(); };

  // Edit formasını açılan silinmə üzrə BİR dəfə doldur — sonrakı refetch-lər
  // yazılmış dəyərləri əzməsin (OrderDrawer-dakı seededFor nümunəsi).
  const seededFor = useRef(null);
  useEffect(() => {
    if (data?.removal && seededFor.current !== removalId) {
      setDocNo(data.removal.doc_no || '');
      setDestination(data.removal.destination || '');
      setHeaderNote(data.removal.note || '');
      setLines((data.removal.items || []).map((ln) => ({
        warehouse_item_id: ln.warehouse_item_id ? String(ln.warehouse_item_id) : '',
        product_name: ln.product_name,
        unit: ln.unit,
        qty: String(ln.qty),
        note: ln.note || '',
      })));
      setEditing(false);
      setErr('');
      seededFor.current = removalId;
    }
  }, [data, removalId]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['proc', 'removal', removalId] });
    qc.invalidateQueries({ queryKey: ['proc', 'warehouse'] });
    qc.invalidateQueries({ queryKey: ['proc', 'warehouse-removals'] });
    onChanged?.();
  };

  const save = useMutation({
    mutationFn: (form) => api.put(`/procurement/warehouse/removals/${removalId}`, form),
    onSuccess: () => { setEditing(false); setErr(''); refresh(); },
    onError: (e) => setErr(e?.message || 'Yadda saxlanmadı'),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/procurement/warehouse/removals/${removalId}`),
    onSuccess: () => { onChanged?.(); onClose?.(); },
  });

  const removal = data?.removal;
  const items = removal?.items || [];
  const stockById = new Map((stock || []).map((s) => [String(s.id), s]));
  // Bu silinmədəki köhnə miqdarlar — redaktədə mövcudluq = hazırkı stok + köhnə.
  const oldTotals = new Map();
  for (const ln of items) {
    if (ln.warehouse_item_id == null) continue;
    oldTotals.set(String(ln.warehouse_item_id), (oldTotals.get(String(ln.warehouse_item_id)) || 0) + Number(ln.qty));
  }
  const availFor = (wid) => {
    const s = stockById.get(String(wid));
    if (!s) return null;
    return Number(s.qty) + (oldTotals.get(String(wid)) || 0);
  };

  const askDelete = () => {
    if (remove.isPending) return;
    if (!window.confirm(`Silinmə №${removal?.doc_no} silinəcək və ${items.length} sətir stoka geri qaytarılacaq. Davam edilsin?`)) return;
    remove.mutate();
  };

  const setLine = (idx, k, v) => setLines((p) => p.map((ln, i) => (i === idx ? { ...ln, [k]: v } : ln)));

  const submit = () => {
    setErr('');
    if (!destination.trim()) { setErr('Təyinat / obyekt mütləqdir (məs: Hotel)'); return; }
    if (!lines.length) { setErr('Ən azı bir məhsul seçin'); return; }
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const prod = stockById.get(String(ln.warehouse_item_id));
      if (!prod) { setErr(`Sətir ${i + 1} — məhsul seçin (stokda olmayanı yenidən seçin və ya sətri silin)`); return; }
      if (String(ln.qty).trim() === '' || !(Number(ln.qty) > 0)) { setErr(`"${prod.name}" — miqdar 0-dan böyük olmalıdır`); return; }
    }
    // Eyni məhsul bir neçə sətirdədirsə cəm yoxlanılır (server də yoxlayır).
    const sums = new Map();
    for (const ln of lines) sums.set(String(ln.warehouse_item_id), (sums.get(String(ln.warehouse_item_id)) || 0) + Number(ln.qty));
    for (const [wid, total] of sums) {
      const avail = availFor(wid);
      const prod = stockById.get(wid);
      if (avail != null && total > avail) { setErr(`"${prod.name}" — cəmi ${avail} ${prod.unit} mövcuddur (bu silinmədəki daxil)`); return; }
    }
    save.mutate({
      doc_no: docNo.trim(),
      destination: destination.trim(),
      note: headerNote.trim(),
      lines: lines.map((ln) => ({
        warehouse_item_id: Number(ln.warehouse_item_id),
        qty: Number(ln.qty),
        note: String(ln.note || '').trim(),
      })),
    });
  };

  return (
    <div className="fixed inset-0 z-50" onClick={safeClose}>
      <div className="proc-backdrop absolute inset-0 backdrop-blur-[3px]" style={{ background: 'color-mix(in oklab, var(--bg) 55%, transparent)' }} />
      <div className="proc-drawer absolute top-0 right-0 h-full w-full bg-elevated shadow-float flex flex-col proc-scroll overflow-y-auto" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <Style />
        <div className="proc-hdr sticky top-0 bg-elevated z-10">
          <span className="proc-accent-bar proc-accent-bar--trio" />
          <h2 className="text-[14px] font-semibold text-ink">Silinmə №{removal?.doc_no ?? removalId}</h2>
          {!editing && removal && (
            <button onClick={() => { setErr(''); setEditing(true); }} title="Redaktə et"
              className="proc-drawer-close text-ink-faint hover:text-ink hover:bg-elevated">
              <Pencil size={16} />
            </button>
          )}
          <button onClick={askDelete} disabled={remove.isPending} title="Silinməni sil (stoka geri qaytar)"
            className="proc-drawer-close text-[var(--status-red)] hover:bg-[var(--status-red)]/10 disabled:opacity-50">
            <Trash2 size={17} />
          </button>
          <button onClick={onClose} className="proc-drawer-close text-ink-faint hover:text-ink hover:bg-elevated"><X size={18} /></button>
        </div>
        {isLoading || !removal ? (
          <div className="space-y-4 p-4">
            <div className="proc-skel h-28 rounded-2xl" />
            <div className="proc-skel h-44 rounded-2xl" style={{ opacity: .8 }} />
          </div>
        ) : editing ? (
          <div className="p-4 space-y-4">
            <div className="proc-card p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-[13px] block"><span className="proc-label">№</span>
                  <input value={docNo} onChange={(e) => setDocNo(e.target.value)} className="proc-input" /></label>
                <label className="text-[13px] block"><span className="proc-label">Təyinat / obyekt *</span>
                  <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Məs: Hotel" className="proc-input" /></label>
                <label className="text-[13px] block col-span-1 sm:col-span-2"><span className="proc-label">Qeyd</span>
                  <input value={headerNote} onChange={(e) => setHeaderNote(e.target.value)} className="proc-input" /></label>
              </div>
            </div>
            <div className="proc-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line text-[12px] font-bold">Məhsullar</div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-ink-faint">
                    <th className="px-2.5 py-1.5">Məhsul *</th>
                    <th className="px-2.5 py-1.5 text-right">Mövcud</th>
                    <th className="px-2.5 py-1.5 text-right">Miqdar *</th>
                    <th className="px-2.5 py-1.5">Açıqlama</th>
                    <th className="px-2.5 py-1.5 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((ln, idx) => {
                    const gone = ln.warehouse_item_id && !stockById.get(String(ln.warehouse_item_id));
                    const avail = availFor(ln.warehouse_item_id);
                    return (
                      <tr key={idx} className="border-t border-line/50">
                        <td className="px-2.5 py-1.5">
                          <select value={ln.warehouse_item_id} onChange={(e) => setLine(idx, 'warehouse_item_id', e.target.value)}
                            className="proc-input min-w-[140px] px-1.5 py-1 text-[11px]">
                            <option value="">— Seçin —</option>
                            {gone && <option value={ln.warehouse_item_id} disabled>{ln.product_name} (stokda yoxdur)</option>}
                            {(stock || []).map((s) => (
                              <option key={s.id} value={s.id}>{s.name} ({s.qty} {s.unit})</option>
                            ))}
                          </select>
                          {gone && <div className="mt-1 text-[10px] text-[var(--status-red)]">Yenidən seçin və ya sətri silin</div>}
                        </td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums text-ink-muted">{avail != null ? avail : '—'}</td>
                        <td className="px-2.5 py-1.5 text-right">
                          <input type="number" step="any" min="0" value={ln.qty} onChange={(e) => setLine(idx, 'qty', e.target.value)}
                            className="proc-input w-20 px-1.5 py-1 text-[11px] text-right tabular-nums" />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <input value={ln.note} onChange={(e) => setLine(idx, 'note', e.target.value)}
                            placeholder="Açıqlama" className="proc-input min-w-[110px] px-1.5 py-1 text-[11px]" />
                        </td>
                        <td className="px-2.5 py-1.5 text-center">
                          <button onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p))} className="proc-rowbtn proc-rowbtn--danger"><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={() => setLines((p) => [...p, { warehouse_item_id: '', product_name: '', unit: '', qty: '', note: '' }])}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink hover:border-[var(--accent)]">
              <Plus size={14} /> Sətir əlavə et</button>
            {(err || save.isError) && <p className="text-[12px] text-[var(--status-red)]">{err || save.error?.message}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setEditing(false); setErr(''); }} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-ink-muted hover:bg-elevated">Ləğv</button>
              <button onClick={submit} disabled={save.isPending} className="proc-btn rounded-lg px-4 py-2 text-[13px] disabled:opacity-50">
                {save.isPending ? '...' : 'Yadda saxla'}</button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="proc-card p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12px]">
                <div><div className="proc-label">№</div><div className="font-mono font-bold">{removal.doc_no}</div></div>
                <div><div className="proc-label">Təyinat / obyekt</div><div className="font-semibold break-words">{removal.destination}</div></div>
                <div><div className="proc-label">Tarix</div><div>{fmtDateTime(removal.created_at)}</div></div>
                <div><div className="proc-label">Yaradan</div><div className="break-words">{removal.created_by_name || '—'}</div></div>
                {removal.note && <div className="col-span-1 sm:col-span-2"><div className="proc-label">Qeyd</div><div className="break-words">{removal.note}</div></div>}
              </div>
            </div>
            <div className="proc-card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-line text-[12px] font-bold">Məhsullar</div>
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-ink-faint">
                    <th className="px-2.5 py-1.5">Məhsul</th>
                    <th className="px-2.5 py-1.5 text-right">Miqdar</th>
                    <th className="px-2.5 py-1.5">Açıqlama</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-line/50">
                      <td className="px-2.5 py-2"><span className="block break-words">{it.product_name}</span><div className="text-[10px] text-ink-faint">{it.unit}</div></td>
                      <td className="px-2.5 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{it.qty} {it.unit}</td>
                      <td className="px-2.5 py-2 text-ink-muted break-words">{it.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(remove.isError || remove.error) && <p className="text-[12px] text-[var(--status-red)]">{remove.error?.message || 'Silinmədi'}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Catalog form (boss only) ──
// Known firms — bunlar firma cədvəllərinin adlarıdır
const FIRM_OPTIONS = ['İmza', 'Premier'];

function CatalogForm({ row, firms, onClose, onSave, saving }) {
  // Mövcud firmalar + məlum firmalar → birləşdirilmiş siyahı
  const allFirmOpts = [...new Set([...FIRM_OPTIONS, ...(firms || []).filter((f) => f !== 'UMUMI')])].sort();
  const [form, setForm] = useState({
    internal_id: row?.internal_id || '',
    name: row?.name || '',
    unit: row?.unit || 'əd',
    buy_price: row?.buy_price ?? '',
    firm: row?.firm && row.firm !== 'UMUMI' ? row.firm : (allFirmOpts[0] || ''),
  });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // ID avtomatik padding: "1" → "0001", "23" → "0023"
  const handleIdChange = (e) => {
    const raw = e.target.value.replace(/\D/g, ''); // yalnız rəqəmlər
    setForm((p) => ({ ...p, internal_id: raw }));
  };
  const handleIdBlur = () => {
    if (!form.internal_id) return;
    const num = parseInt(form.internal_id, 10);
    if (!isNaN(num)) {
      setForm((p) => ({ ...p, internal_id: String(num).padStart(4, '0') }));
    }
  };

  const submit = () => {
    setErr('');
    const idVal = form.internal_id.trim();
    if (!idVal || !form.name.trim() || !form.unit.trim()) { setErr('ID, ad və vahid mütləqdir'); return; }
    if (String(form.buy_price).trim() === '' || !(Number(form.buy_price) >= 0)) { setErr('Qiyməti daxil edin (0 və ya böyük)'); return; }
    if (!form.firm) { setErr('Firma seçin'); return; }
    onSave({ internal_id: idVal, name: form.name.trim(), unit: form.unit.trim(), buy_price: Number(form.buy_price), firm: form.firm });
  };
  return (
    <Modal onClose={onClose} maxWidth={480}>
      <div className="proc-modal-hdr">
        <span className="proc-accent-bar" />
        <h3 className="flex items-center gap-2 text-[14px] font-bold">
          <Tag size={18} color={EM} />
          {row ? 'Məhsulu redaktə et' : 'Yeni məhsul'}
        </h3>
        <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:text-ink hover:bg-elevated"><X size={18} /></button>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-[13px] block"><span className="proc-label">Məhsul ID * (0001 formatı)</span>
          <input value={form.internal_id} onChange={handleIdChange} onBlur={handleIdBlur}
            placeholder="0001" className="proc-input font-mono" inputMode="numeric" maxLength={10} /></label>
        <label className="text-[13px] block"><span className="proc-label">Ölçü vahidi *</span>
          <input value={form.unit} onChange={set('unit')} className="proc-input" /></label>
        <label className="text-[13px] block col-span-1 sm:col-span-2"><span className="proc-label">Məhsul adı *</span>
          <input value={form.name} onChange={set('name')} className="proc-input" /></label>
        <label className="text-[13px] block"><span className="proc-label">Qiymət (<span className="cur">₼</span>) *</span>
          <input type="number" step="any" value={form.buy_price} onChange={set('buy_price')} className="proc-input tabular-nums" /></label>
        <label className="text-[13px] block"><span className="proc-label">Firma *</span>
          <select value={form.firm} onChange={set('firm')} className="proc-input">
            {allFirmOpts.map((f) => <option key={f} value={f}>{f === 'İmza' ? 'İmza (Ofis məhsulları)' : f === 'Premier' ? 'Premier (Texnoloji avadanlıqlar)' : f}</option>)}
            {!allFirmOpts.length && <option value="">— Firma yoxdur —</option>}
          </select>
        </label>
      </div>
      {err && <p className="px-5 pb-1 text-[12px] text-[var(--status-red)]">{err}</p>}
      <div className="proc-modal-ftr">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-ink-muted hover:bg-elevated">Ləğv</button>
        <button onClick={submit} disabled={saving} className="proc-btn rounded-lg px-4 py-2 text-[13px] disabled:opacity-50">{saving ? '...' : 'Yadda saxla'}</button>
      </div>
    </Modal>
  );
}

// ── Anbar: Əlavə et formu (Malın adı | Ölçü vahidi | Miqdarı) ──
function WarehouseForm({ onClose, onSave, saving }) {
  const [form, setForm] = useState({ name: '', unit: 'ədəd', qty: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const submit = () => {
    setErr('');
    if (!form.name.trim()) { setErr('Məhsul adı mütləqdir'); return; }
    if (String(form.qty).trim() === '' || !(Number(form.qty) >= 0)) { setErr('Miqdarı daxil edin (0 və ya böyük)'); return; }
    onSave({ name: form.name.trim(), unit: form.unit.trim() || 'ədəd', qty: Number(form.qty) });
  };
  return (
    <Modal onClose={onClose} maxWidth={480}>
      <div className="proc-modal-hdr">
        <span className="proc-accent-bar" />
        <h3 className="flex items-center gap-2 text-[14px] font-bold">
          <Warehouse size={18} color={EM} />
          Anbara əlavə et
        </h3>
        <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:text-ink hover:bg-elevated"><X size={18} /></button>
      </div>
      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-[13px] block col-span-1 sm:col-span-2"><span className="proc-label">Malın adı *</span>
          <input value={form.name} onChange={set('name')} placeholder="Məs: HDMI kabel 2m" className="proc-input" /></label>
        <label className="text-[13px] block"><span className="proc-label">Ölçü vahidi</span>
          <input value={form.unit} onChange={set('unit')} placeholder="ədəd" className="proc-input" /></label>
        <label className="text-[13px] block"><span className="proc-label">Miqdarı *</span>
          <input type="number" step="any" min="0" value={form.qty} onChange={set('qty')} className="proc-input tabular-nums" /></label>
      </div>
      {err && <p className="px-5 pb-1 text-[12px] text-[var(--status-red)]">{err}</p>}
      <div className="proc-modal-ftr">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-ink-muted hover:bg-elevated">Ləğv</button>
        <button onClick={submit} disabled={saving} className="proc-btn rounded-lg px-4 py-2 text-[13px] disabled:opacity-50">{saving ? '...' : 'Yadda saxla'}</button>
      </div>
    </Modal>
  );
}

const blankRemovalLine = () => ({ warehouse_item_id: '', qty: '', note: '' });

// ── Silinmə yarat: № + Təyinat/obyekt + bir neçə məhsul (məhsul + miqdar + açıqlama) ──
function RemovalForm({ stock, nextDocNo, onClose, onSave, saving, serverErr }) {
  const [docNo, setDocNo] = useState(nextDocNo || '');
  const [destination, setDestination] = useState('');
  const [lines, setLines] = useState([blankRemovalLine()]);
  const [err, setErr] = useState('');
  const setLine = (idx, k, v) => setLines((p) => p.map((ln, i) => (i === idx ? { ...ln, [k]: v } : ln)));
  const stockById = new Map((stock || []).map((s) => [String(s.id), s]));

  const submit = () => {
    setErr('');
    if (!destination.trim()) { setErr('Təyinat / obyekt mütləqdir (məs: Hotel)'); return; }
    if (!lines.length) { setErr('Ən azı bir məhsul seçin'); return; }
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const prod = stockById.get(String(ln.warehouse_item_id));
      if (!prod) { setErr(`Sətir ${i + 1} — məhsul seçin`); return; }
      if (String(ln.qty).trim() === '' || !(Number(ln.qty) > 0)) { setErr(`"${prod.name}" — miqdar 0-dan böyük olmalıdır`); return; }
      if (Number(ln.qty) > Number(prod.qty)) { setErr(`"${prod.name}" — stokda ${prod.qty} ${prod.unit} var, artıq silinə bilməz`); return; }
    }
    onSave({
      doc_no: docNo.trim(),
      destination: destination.trim(),
      lines: lines.map((ln) => ({
        warehouse_item_id: Number(ln.warehouse_item_id),
        qty: Number(ln.qty),
        note: String(ln.note || '').trim(),
      })),
    });
  };

  return (
    <Modal onClose={onClose} maxWidth={720}>
      <div className="proc-modal-hdr shrink-0">
        <span className="proc-accent-bar" />
        <h3 className="flex items-center gap-2 text-[14px] font-bold">
          <Minus size={18} color={EM} />
          Silinmə yarat
        </h3>
        <button onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:text-ink hover:bg-elevated"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4 proc-scroll">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[13px] block"><span className="proc-label">№</span>
            <input value={docNo} onChange={(e) => setDocNo(e.target.value)} placeholder="Məs: 1" className="proc-input" /></label>
          <label className="text-[13px] block"><span className="proc-label">Təyinat / obyekt *</span>
            <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Məs: Hotel" className="proc-input" /></label>
        </div>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead>
              <tr className="border-b border-line bg-elevated/40 text-left text-[10px] uppercase tracking-wider text-ink-faint">
                <th className="px-2.5 py-1.5 w-8 text-center">№</th>
                <th className="px-2.5 py-1.5">Məhsul *</th>
                <th className="px-2.5 py-1.5 w-24 text-right">Stok</th>
                <th className="px-2.5 py-1.5 w-24 text-right">Miqdar *</th>
                <th className="px-2.5 py-1.5">Açıqlama</th>
                <th className="px-2.5 py-1.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((ln, idx) => {
                const prod = stockById.get(String(ln.warehouse_item_id));
                return (
                  <tr key={idx} className="border-b border-line/60 last:border-b-0">
                    <td className="px-2.5 py-1.5 text-center text-ink-faint">{idx + 1}</td>
                    <td className="px-2.5 py-1.5">
                      <select value={ln.warehouse_item_id} onChange={(e) => setLine(idx, 'warehouse_item_id', e.target.value)}
                        className="proc-input min-w-[160px] px-2 py-1.5">
                        <option value="">— Seçin —</option>
                        {(stock || []).map((s) => (
                          <option key={s.id} value={s.id}>{s.name} ({s.qty} {s.unit})</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums text-ink-muted">{prod ? `${prod.qty} ${prod.unit}` : '—'}</td>
                    <td className="px-2.5 py-1.5">
                      <input type="number" step="any" min="0" value={ln.qty} onChange={(e) => setLine(idx, 'qty', e.target.value)}
                        className="proc-input w-20 px-2 py-1.5 text-right tabular-nums" /></td>
                    <td className="px-2.5 py-1.5">
                      <input value={ln.note} onChange={(e) => setLine(idx, 'note', e.target.value)}
                        placeholder="Məs: istifadədən çıxarılıb" className="proc-input min-w-[140px] px-2 py-1.5" /></td>
                    <td className="px-2.5 py-1.5 text-center">
                      <button onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, i) => i !== idx) : p))} className="proc-rowbtn proc-rowbtn--danger"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <button onClick={() => setLines((p) => [...p, blankRemovalLine()])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink hover:border-[var(--accent)]">
            <Plus size={14} /> Sətir əlavə et</button>
        </div>
        {(err || serverErr) && <p className="text-[12px] text-[var(--status-red)]">{err || serverErr}</p>}
      </div>
      <div className="proc-modal-ftr shrink-0">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-ink-muted hover:bg-elevated">Ləğv</button>
        <button onClick={submit} disabled={saving} className="proc-btn rounded-lg px-4 py-2 text-[13px] disabled:opacity-50">{saving ? '...' : 'Təsdiqlə'}</button>
      </div>
    </Modal>
  );
}

const SECTIONS = [
  { key: 'panel', label: 'Panel', icon: LayoutDashboard },
  { key: 'orders', label: 'Sifarişlər', icon: ShoppingCart, endpoint: '/procurement/orders' },
  { key: 'catalog', label: 'Qiymət kataloqu', icon: Tag, endpoint: '/procurement/catalog' },
  { key: 'warehouse', label: 'Anbar', icon: Warehouse, endpoint: '/procurement/warehouse' },
  { key: '1c', label: '1C', icon: Database },
];

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const color = item.color || item.payload?.fill || 'var(--ink)';
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[12px] shadow-float">
      <div className="font-bold" style={{ color }}>{item.name}</div>
      <div className="mt-0.5 font-semibold text-ink">{item.value}</div>
    </div>
  );
}

function Dashboard({ dash }) {
  if (!dash) return <SkeletonTable />;
  const trend = (dash.volume_trend || []).map((d) => ({ name: fmtMonth(d.month), value: d.value }));
  const c = dash.cancelled || {};
  const statusAmounts = dash.status_amounts || {};
  const donut = [
    { name: 'Təsdiqlənmiş', value: Math.max(0, (dash.counts ? (dash.counts.approved + dash.counts.partially_approved) : 0)) },
    { name: 'Rədd edilmiş', value: c.rejected_orders || 0 },
    { name: 'Gözləyən', value: dash.counts?.pending || 0 },
  ].filter((d) => d.value > 0);
  const COLORS = [EM, RED, AMBER];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={ShoppingCart} label="Təsdiq həcmi (cari)" value={money(trend.reduce((s, d) => s + d.value, 0))} accent={EM} />
        <Kpi icon={PieIcon} label="Qənaət (rədd+qismən)" value={money(c.saved_amount)} accent={BLUE} />
        <Kpi icon={XCircle} label="Rədd payı" value={`${c.share || 0}%`} accent={RED} />
        <Kpi icon={Clock} label="Gözləyən sifariş" value={dash.counts?.pending || 0} accent={AMBER} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="proc-card proc-rise p-5">
          <h3 className="flex items-center gap-2 mb-2.5 text-[12px] font-bold"><TrendingUp size={15} color={EM} />Aylar üzrə təsdiqlənmiş sifariş həcmi</h3>
          {trend.length === 0 ? <div className="grid h-[340px] place-items-center"><EmptyState icon={PieIcon} title="Hələ təsdiqlənmiş həcm yoxdur" hint="Boss ilk sifarişi təsdiqləyən kimi qrafik burada görünəcək" /></div> : (
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={trend} margin={{ top: 10, right: 10, left: -10, bottom: 8 }}>
                <CartesianGrid fill="var(--surface)" strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-2)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} />
                <Tooltip cursor={false} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 12 }} formatter={(v) => money(v)} />
                <Bar dataKey="value" name="Təsdiqlənmiş həcm" fill={EM} activeBar={false} radius={[6, 6, 0, 0]} maxBarSize={48} animationDuration={900} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="proc-card proc-rise p-5">
          <h3 className="flex items-center gap-2 mb-2.5 text-[12px] font-bold"><PieIcon size={15} color={RED} />Ləğv payı və qənaət</h3>
          {donut.length === 0 ? <div className="grid h-[260px] place-items-center"><EmptyState title="Hələ sifariş yoxdur" hint="İlk sifariş yaradılanda pay bölgüsü burada görünəcək" /></div> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={donut} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {donut.map((e, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip content={<PieTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="mt-2 grid grid-cols-2 gap-3 border-t border-line pt-3 text-center">
            {[
              ['Təsdiqlənmiş', statusAmounts.approved, EM],
              ['Qismən təsdiq', statusAmounts.partially_approved, BLUE],
              ['Rədd edilmiş', statusAmounts.rejected, RED],
              ['Gözləyən', statusAmounts.pending, AMBER],
            ].map(([label, value, color]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wider text-ink-faint">{label}</div>
                <div className="mt-1 text-base font-black tabular-nums" style={{ color }}>{money(value)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Procurement({ me }) {
  const isBoss = me?.proc_role === 'boss';
  const [section, setSection] = useState('panel');
  const [navOpen, setNavOpen] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [openOrder, setOpenOrder] = useState(null);
  const [editing, setEditing] = useState(null); // {} = new, {id} = edit
  const [editDetail, setEditDetail] = useState(null);
  const [catEditing, setCatEditing] = useState(null);
  const [catSearch, setCatSearch] = useState('');
  const [firmFilter, setFirmFilter] = useState('');
  const catFileRef = useRef(null);
  const [importing, setImporting] = useState(false);
  // ── Anbar state ──
  const [whSearch, setWhSearch] = useState('');
  const [whAdding, setWhAdding] = useState(false);
  const [removalOpen, setRemovalOpen] = useState(false);
  const [openRemoval, setOpenRemoval] = useState(null); // id = drawer açıq
  const [removalErr, setRemovalErr] = useState('');
  const whFileRef = useRef(null);
  const [whImporting, setWhImporting] = useState(false);
  const active = SECTIONS.find((s) => s.key === section) || SECTIONS[0];
  const qc = useQueryClient();

  const { data: dash } = useQuery({ queryKey: ['proc', 'dashboard'], queryFn: () => api.get('/procurement/dashboard') });
  // Single source of truth per tab: orders query vs catalog query (same
  // endpoint, no duplicate fetch — display and search read the same rows).
  const listQ = useQuery({
    queryKey: ['proc', section, statusFilter, firmFilter],
    queryFn: () => api.get(active.endpoint
      + (section === 'orders' && statusFilter ? `?status=${statusFilter}` : '')
      + (section === 'catalog' && firmFilter ? `?firm=${encodeURIComponent(firmFilter)}` : '')),
    enabled: !!active.endpoint,
  });
  // The legacy UMUMI rows stay available to order history, but are not a
  // visible catalog section or part of firm catalog exports.
  const catalog = section === 'catalog'
    ? (listQ.data?.items || []).filter((c) => c.firm && c.firm !== 'UMUMI')
    : [];
  // Unfiltered load — only feeds the firm dropdown (Hamısı + distinct firms).
  const firmQ = useQuery({
    queryKey: ['proc', 'catalog-firms'],
    queryFn: () => api.get('/procurement/catalog'),
    enabled: section === 'catalog',
  });
  const firms = [...new Set((firmQ.data?.items || [])
    .map((c) => c.firm)
    .filter((firm) => firm && firm !== 'UMUMI'))].sort((a, b) => a.localeCompare(b, 'az'));

  useEffect(() => { setSearch(''); setPage(1); setStatusFilter(''); setFirmFilter(''); setWhSearch(''); }, [section]);

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ['proc', 'orders'] });
    qc.invalidateQueries({ queryKey: ['proc', 'dashboard'] });
    qc.invalidateQueries({ queryKey: ['proc', 'catalog'] });
    qc.invalidateQueries({ queryKey: ['proc', 'catalog-firms'] });
    qc.invalidateQueries({ queryKey: ['proc', 'warehouse'] });
    qc.invalidateQueries({ queryKey: ['proc', 'warehouse-removals'] });
  };
  const [saveErr, setSaveErr] = useState('');
  const saveOrder = useMutation({
    mutationFn: (form) => (editing?.id ? api.put(`/procurement/orders/${editing.id}`, form) : api.post('/procurement/orders', form)),
    onSuccess: (d, form) => {
      setEditing(null); setEditDetail(null); setSaveErr(''); refetchAll();
      // Keep an open detail drawer fresh (boss decision panel + totals).
      const id = editing?.id || d?.id;
      if (id) qc.invalidateQueries({ queryKey: ['proc', 'order', id] });
    },
    onError: (e) => setSaveErr(e?.message || 'Yadda saxlanmadı'),
  });
  const saveCat = useMutation({
    mutationFn: (form) => (catEditing?.id ? api.put(`/procurement/catalog/${catEditing.id}`, form) : api.post('/procurement/catalog', form)),
    onSuccess: () => { setCatEditing(null); refetchAll(); },
    onError: (e) => window.alert(e?.code === 'internal_id_taken' ? 'Bu ID artıq kataloqdadır' : (e?.message || 'Xəta')),
  });
  const delCat = useMutation({
    mutationFn: (row) => api.del(`/procurement/catalog/${row.id}`),
    onSuccess: refetchAll,
    onError: (e) => window.alert(e?.message || 'Silinmədi'),
  });
  const replaceCat = useMutation({
    mutationFn: ({ items, firm }) => api.post('/procurement/catalog/replace', { items, ...(firm ? { firm } : {}) }),
    onSuccess: (d, vars) => { refetchAll(); window.alert(vars?.firm ? `${d?.count ?? ''} məhsul yükləndi — "${vars.firm}" firması yeniləndi` : `${d?.count ?? ''} məhsul yükləndi — bütün kataloq yeniləndi`); },
    onError: (e) => window.alert(e?.message || 'Import alınmadı'),
  });

  // ── Anbar queries (only when the warehouse tab is active) ──
  const whQ = useQuery({
    queryKey: ['proc', 'warehouse'],
    queryFn: () => api.get('/procurement/warehouse'),
    enabled: section === 'warehouse',
  });
  const remQ = useQuery({
    queryKey: ['proc', 'warehouse-removals'],
    queryFn: () => api.get('/procurement/warehouse/removals'),
    enabled: section === 'warehouse',
  });
  const warehouse = whQ.data?.items || [];
  const removals = remQ.data?.items || [];

  const addWh = useMutation({
    mutationFn: (form) => api.post('/procurement/warehouse', form),
    onSuccess: () => { setWhAdding(false); refetchAll(); },
    onError: (e) => window.alert(e?.message || 'Yadda saxlanmadı'),
  });
  const replaceWh = useMutation({
    mutationFn: ({ items }) => api.post('/procurement/warehouse/replace', { items }),
    onSuccess: (d) => { refetchAll(); window.alert(`${d?.count ?? ''} məhsul yükləndi — anbar tam yeniləndi`); },
    onError: (e) => window.alert(e?.message || 'Import alınmadı'),
  });
  const createRemoval = useMutation({
    mutationFn: (form) => api.post('/procurement/warehouse/removals', form),
    onSuccess: () => { setRemovalOpen(false); setRemovalErr(''); refetchAll(); },
    onError: (e) => setRemovalErr(e?.message || 'Silinmə yaradılmadı'),
  });

  // Anbar export: hazırkı anbar Excel formatında (Malın adı | Ölçü vahidi | Miqdarı).
  const handleWarehouseExport = async () => {
    if (!warehouse.length) { window.alert('Anbar boşdur — export ediləcək məhsul yoxdur'); return; }
    try {
      const XLSX = await import('xlsx');
      const sheet = XLSX.utils.aoa_to_sheet([
        ['Malın adı', 'Ölçü vahidi', 'Miqdarı'],
        ...warehouse.map((w) => [w.name, w.unit, Number(w.qty)]),
      ]);
      sheet['!cols'] = [{ wch: 52 }, { wch: 12 }, { wch: 12 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Anbar');
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      XLSX.writeFile(wb, `anbar-${stamp}.xlsx`);
    } catch (err) {
      window.alert(err?.message || 'Excel yazılmadı');
    }
  };

  // Tam yeniləmə: Excel (Malın adı | Ölçü vahidi | Miqdarı) → bütün anbar əvəz olunur.
  const handleWarehouseFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setWhImporting(true);
    try {
      const buf = await f.arrayBuffer();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) { window.alert('Excel-də vərəq tapılmadı'); return; }
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!grid.length) { window.alert('Fayl boşdur'); return; }
      const normCell = (v) => String(v ?? '').trim();
      const numCell = (v) => {
        if (v === '' || v == null) return NaN;
        if (typeof v === 'number') return v;
        let s = String(v).replace(/\s/g, '');
        if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
        else if (s.includes(',')) s = s.replace(',', '.');
        return Number(s);
      };
      const head = grid[0].map((c) => normCell(c).toLowerCase());
      const findCol = (keys) => head.findIndex((c) => keys.some((k) => c.includes(k)));
      const nameIdx = findCol(['mal', 'ad', 'name', 'məhsul', 'mehsul']);
      const unitIdx = findCol(['ölçü', 'olcu', 'vahid', 'unit']);
      const qtyIdx = findCol(['miqdar', 'say', 'qty', 'miqdar']);
      const looksHeader = nameIdx >= 0 || unitIdx >= 0 || qtyIdx >= 0;
      const col = (i, fallback) => (i >= 0 ? i : fallback);
      const body = looksHeader ? grid.slice(1) : grid;
      const items = [];
      for (let i = 0; i < body.length; i++) {
        const r = body[i];
        const name = normCell(r[col(nameIdx, 0)]);
        if (!name) continue; // tam boş sətir
        items.push({ name, unit: normCell(r[col(unitIdx, 1)]) || 'ədəd', qty: numCell(r[col(qtyIdx, 2)]) });
      }
      if (!items.length) { window.alert('Heç bir məhsul tapılmadı. Format: Malın adı | Ölçü vahidi | Miqdarı'); return; }
      const bad = items.find((it) => !it.name || !Number.isFinite(it.qty) || it.qty < 0);
      if (bad) { window.alert(`Yoxlayın: "${bad.name || 'boş sətir'}" — ad və miqdar düzgün olmalıdır`); return; }
      if (!window.confirm(`${items.length} məhsul tapıldı. BÜTÜN anbar əvəz olunacaq. Davam edilsin?`)) return;
      await replaceWh.mutateAsync({ items });
    } catch (err) {
      window.alert(err?.message || 'Excel oxunmadı');
    } finally {
      setWhImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  // Main export always contains every firm catalog, regardless of the active
  // firm/search filters. Per-firm exports below remain scoped to one group.
  const handleCatalogExport = async () => {
    const rows = (firmQ.data?.items || []).filter((c) => c.firm && c.firm !== 'UMUMI');
    if (!rows.length) { window.alert('Kataloq boşdur — export ediləcək məhsul yoxdur'); return; }
    try {
      const XLSX = await import('xlsx');
      const sheet = XLSX.utils.aoa_to_sheet([
        ['ID', 'Ad', 'Vahid', 'Alis', 'Firma'],
        ...rows.map((c) => [c.internal_id, c.name, c.unit, Number(c.buy_price), c.firm || 'UMUMI']),
      ]);
      sheet['!cols'] = [{ wch: 18 }, { wch: 42 }, { wch: 10 }, { wch: 12 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, 'Kataloq');
      const d = new Date();
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      XLSX.writeFile(wb, `kataloq-${stamp}.xlsx`);
    } catch (err) {
      window.alert(err?.message || 'Excel yazılmadı');
    }
  };

  // Excel (.xlsx/.xls/.csv) → scoped replace: firma seçilibsə yalnız o firma,
  // seçilməyibsə bütün kataloq əvəz olunur (server: { items, firm? }).
  // Yeni format: ID | Ad | Vahid | Alis | Firma (sıra yox, addan tapılır,
  // Satış sütunu oxunmur). Köhnə Satış-lı fayllar da qəbul olunur.
  const handleCatalogFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImporting(true);
    try {
      const buf = await f.arrayBuffer();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) { window.alert('Excel-də vərəq tapılmadı'); return; }
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!grid.length) { window.alert('Fayl boşdur'); return; }
      const normCell = (v) => String(v ?? '').trim();
      const numCell = (v) => {
        if (v === '' || v == null) return NaN;
        if (typeof v === 'number') return v;
        let s = String(v).replace(/\s/g, '');
        // Comma-dot tolerant: "1.234,56" → 1234.56, plain "12,5" → 12.5.
        if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
        else if (s.includes(',')) s = s.replace(',', '.');
        return Number(s);
      };
      const head = grid[0].map((c) => normCell(c).toLowerCase());
      const findCol = (keys) => head.findIndex((c) => keys.some((k) => c.includes(k)));
      const idIdx = findCol(['id']);
      const nameIdx = findCol(['ad', 'name', 'məhsul', 'mehsul']);
      const unitIdx = findCol(['vahid', 'unit']);
      const buyIdx = findCol(['alış', 'alis', 'qiymət', 'qiymet', 'price']);
      const firmIdx = findCol(['firma', 'firm', 'şirkət', 'sirket', 'company']);
      const satIdx = findCol(['satış', 'satis']);
      const looksHeader = idIdx >= 0 || nameIdx >= 0 || unitIdx >= 0 || buyIdx >= 0 || firmIdx >= 0 || satIdx >= 0;
      const legacy = firmIdx < 0 && (satIdx >= 0 || (!looksHeader && grid[0].length <= 4));
      const col = (i, fallback) => (i >= 0 ? i : fallback);
      const scope = firmFilter || 'UMUMI';
      const body = looksHeader ? grid.slice(1) : grid;
      const items = [];
      for (let i = 0; i < body.length; i++) {
        const r = body[i];
        const id = normCell(r[col(idIdx, 0)]).toUpperCase();
        const name = normCell(r[col(nameIdx, 1)]);
        if (!id && !name) continue; // tam boş sətir
        const firmRaw = legacy ? '' : normCell(r[col(firmIdx, 4)]);
        items.push({
          internal_id: id,
          name,
          unit: normCell(r[col(unitIdx, 2)]) || 'əd',
          buy_price: numCell(r[col(buyIdx, 3)]),
          firm: (firmRaw || scope).slice(0, 60) || 'UMUMI',
        });
      }
      if (!items.length) { window.alert('Heç bir məhsul tapılmadı. Format: ID | Ad | Vahid | Alis | Firma (kohne Satis-li fayllar da qebul olunur, Satis oxunmur)'); return; }
      const bad = items.find((it) => !it.internal_id || !it.name || !Number.isFinite(it.buy_price) || it.buy_price < 0);
      if (bad) { window.alert(`Yoxlayın: "${bad.internal_id || bad.name || 'boş sətir'}" — ID, ad və Alis qiyməti düzgün olmalıdır. Format: ID | Ad | Vahid | Alis | Firma (kohne Satis-li fayllar da qebul olunur, Satis oxunmur)`); return; }
      const confirmMsg = firmFilter
        ? `${items.length} məhsul tapıldı. Yalnız "${firmFilter}" firması əvəz olunacaq (digər firmalar toxunulmur). Davam edilsin?`
        : `${items.length} məhsul tapıldı. BÜTÜN kataloq əvəz olunacaq (bütün firmalar silinəcək). Davam edilsin?`;
      if (!window.confirm(confirmMsg)) return;
      await replaceCat.mutateAsync({ items, firm: firmFilter || undefined });
    } catch (err) {
      window.alert(err?.message || 'Excel oxunmadı');
    } finally {
      setImporting(false);
      if (e.target) e.target.value = '';
    }
  };

  // Edit flow needs full detail (items) — fetch once when opening the form.
  // Clears stale rows first (no flash of the previous order) and surfaces
  // load errors instead of silently closing.
  const [editErr, setEditErr] = useState('');
  useEffect(() => {
    if (editing?.id) {
      setEditDetail(null);
      setEditErr('');
      api.get(`/procurement/orders/${editing.id}`).then(setEditDetail).catch((e) => setEditErr(e?.message || 'Sifariş yüklənmədi'));
    } else {
      setEditDetail(null);
      setEditErr('');
    }
  }, [editing?.id]);

  const allRows = listQ.data?.items || [];
  const rows = search
    ? allRows.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
    : allRows;
  const PAGE_SIZE = 50;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const catRows = catSearch
    ? catalog.filter((c) => `${c.internal_id} ${c.name} ${c.firm || ''}`.toLowerCase().includes(catSearch.toLowerCase()))
    : catalog;

  // Anbar sətirləri (axtarış: ad + vahid).
  const whRows = whSearch
    ? warehouse.filter((w) => `${w.name} ${w.unit}`.toLowerCase().includes(whSearch.toLowerCase()))
    : warehouse;

  // Silinmələr — flattened: hər sətir bir məhsul (№ | Tarix | Təyinat | Məhsul | Miqdar | Açıqlama).
  const removalRows = [];
  for (const r of removals) {
    for (const ln of (r.items || [])) {
      removalRows.push({
        id: ln.id,
        removal_id: r.id,
        doc_no: r.doc_no,
        destination: r.destination,
        created_at: r.created_at,
        product_name: ln.product_name,
        unit: ln.unit,
        qty: ln.qty,
        note: ln.note,
      });
    }
  }

  const WH_COLS = [
    { key: 'n', label: '№', width: '7%', cell: (r) => <span className="text-ink-faint tabular-nums">{r._n}</span> },
    { key: 'name', label: 'Malın adı', width: '58%', strong: true, cell: (r) => <span className="block truncate">{r.name}</span> },
    { key: 'unit', label: 'Ölçü vahidi', width: '15%', cell: (r) => <span className="block truncate text-ink-muted">{r.unit}</span> },
    { key: 'qty', label: 'Miqdarı', width: '20%', align: 'right', cell: (r) => <span className="tabular-nums font-semibold">{r.qty}</span> },
  ];
  const REM_COLS = [
    { key: 'doc_no', label: '№', width: '7%', cell: (r) => <span className="font-mono font-bold">{r.doc_no}</span> },
    { key: 'created_at', label: 'Tarix', width: '15%', cell: (r) => <span className="block truncate font-medium text-ink-muted">{fmtDateTime(r.created_at)}</span> },
    { key: 'destination', label: 'Təyinat', width: '14%', strong: true, cell: (r) => <span className="block truncate">{r.destination}</span> },
    { key: 'product_name', label: 'Məhsul', width: '32%', cell: (r) => <span className="block truncate">{r.product_name}</span> },
    { key: 'qty', label: 'Miqdar', width: '12%', align: 'right', cell: (r) => <span className="tabular-nums font-semibold">{r.qty} {r.unit}</span> },
    { key: 'note', label: 'Açıqlama', width: '20%', cell: (r) => <span className="block truncate text-ink-muted">{r.note || '—'}</span> },
  ];
  const whNumbered = whRows.map((w, i) => ({ ...w, _n: i + 1 }));

  const ORDER_COLS = [
    { key: 'id', label: '#', width: '7%', cell: (r) => <span className="text-ink-faint">#{r.id}</span> },
    { key: 'requester_name', label: 'Sifariş edən', width: '18%', strong: true, cell: (r) => <span className="block truncate">{r.requester_name}</span> },
    { key: 'reason', label: 'Səbəb', width: '25%', cell: (r) => <span className="block truncate text-ink-muted">{r.reason || '—'}</span> },
    { key: 'items_count', label: 'Məhsul', width: '9%', align: 'right' },
    { key: 'requested', label: 'Tələb cəmi', width: '14%', align: 'right', cell: (r) => money(r.requested) },
    { key: 'created_at', label: 'Tarix', width: '13%', cell: (r) => <span className="block truncate font-medium text-ink-muted">{fmtDate(r.created_at)}</span> },
    { key: 'status', label: 'Status', width: '14%', cell: (r) => <StatusBadge value={r.status} /> },
  ];

  // Status qrupları: Gözləyir → Qismən təsdiq → Təsdiqlənib → Rədd edilib
  const STATUS_ORDER = ['pending', 'partially_approved', 'approved', 'rejected'];
  const orderGroups = (() => {
    const groups = new Map(STATUS_ORDER.map((s) => [s, []]));
    for (const r of pageRows) {
      const key = STATUS_ORDER.includes(r.status) ? r.status : 'pending';
      groups.get(key).push(r);
    }
    return STATUS_ORDER.map((s) => ({ status: s, rows: groups.get(s) })).filter((g) => g.rows.length > 0);
  })();

  const CAT_COLS = [
    { key: 'internal_id', label: 'ID', width: '20%', strong: true, cell: (r) => <span className="block truncate font-mono">{r.internal_id}</span> },
    { key: 'name', label: 'Məhsul', width: '42%', cell: (r) => <span className="block truncate">{r.name}</span> },
    { key: 'unit', label: 'Vahid', width: '15%', cell: (r) => <span className="block truncate text-ink-muted">{r.unit}</span> },
    { key: 'buy_price', label: 'Alış qiyməti', width: '23%', align: 'right', cell: (r) => money(r.buy_price) },
  ];

  // Firma adlarına görə qruplaşdır — hər firmaya ayrı cədvəl
  const firmGroups = (() => {
    const allCat = catSearch ? catRows : catalog;
    const groups = new Map();
    for (const item of allCat) {
      const firmKey = item.firm;
      if (!groups.has(firmKey)) groups.set(firmKey, []);
      groups.get(firmKey).push(item);
    }
    // Sıralama: İmza → Premier → digər firmalar.
    const order = (f) => {
      if (f === 'İmza') return 0;
      if (f === 'Premier') return 1;
      return 2;
    };
    return [...groups.entries()].sort((a, b) => order(a[0]) - order(b[0]));
  })();

  return (
    <div className="proc-app flex min-h-screen">
      <Style />
      {mobileNav && <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px] sm:hidden" onClick={() => setMobileNav(false)} />}
      <aside className={`${navOpen ? 'w-[196px]' : 'w-[60px]'} ${mobileNav ? 'flex' : 'hidden'} sm:flex shrink-0 self-start sticky top-0 h-[100dvh] border-r border-line bg-surface/70 backdrop-blur flex-col min-h-0 transition-[width] duration-200 max-sm:fixed max-sm:inset-y-0 max-sm:left-0 max-sm:z-50 max-sm:w-[196px] max-sm:bg-surface`}>
        {navOpen ? (
          <div className="proc-hdr pl-2 pr-2.5">
            <Wallet size={22} color={EM} className="shrink-0" />
            <div className="min-w-0 flex-1"><div className="proc-grad text-[15px] font-black leading-none">Procurement</div><div className="text-[8px] tracking-wider text-ink-faint uppercase">Appina</div></div>
            <button onClick={() => setNavOpen(false)} title="Bağla" className="shrink-0 p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-elevated"><PanelLeftClose size={17} /></button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 py-2.5 border-b border-line">
            <Wallet size={22} color={EM} className="shrink-0" />
            <button onClick={() => setNavOpen(true)} title="Aç" className="p-1.5 rounded-lg text-ink-faint hover:text-ink hover:bg-elevated"><PanelLeftOpen size={18} /></button>
          </div>
        )}
        <nav className="flex-1 overflow-y-auto pl-1 pr-2 py-2 space-y-0.5 proc-scroll">
          {SECTIONS.map((s) => {
            const on = s.key === section;
            return (
              <button key={s.key} onClick={() => { setSection(s.key); setMobileNav(false); }} title={s.label}
                className={`w-full flex items-center gap-2.5 ${navOpen ? 'px-2.5' : 'px-0 justify-center'} py-2 rounded-xl text-[14px] font-semibold transition ${on ? '' : 'text-ink-muted hover:bg-elevated'}`}
                style={on ? { background: GREEN_TINT, color: ACTIVE, boxShadow: navOpen ? `inset 2px 0 0 ${ACTIVE}, 0 6px 16px -8px ${ACTIVE}66` : `0 6px 16px -8px ${ACTIVE}66` } : undefined}>
                <s.icon size={16} color={on ? ACTIVE : 'currentColor'} strokeWidth={on ? 2.5 : 2} /> {navOpen && s.label}
              </button>
            );
          })}
        </nav>
        {navOpen ? (
          <div className="border-t border-line p-2.5">
            <div className="flex items-center gap-2 rounded-xl border border-line bg-bg p-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-black text-white" style={{ background: `linear-gradient(135deg, ${EM}, ${BLUE})` }}>
                {(me?.full_name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[11px] font-bold text-ink">{me?.full_name}</span>
                <span className={`proc-role mt-0.5 ${isBoss ? 'proc-role--boss' : 'proc-role--spec'}`}>{isBoss ? 'BOSS' : 'SPECIALIST'}</span>
              </span>
              <button onClick={logout} title="Çıxış" className="shrink-0 rounded-lg p-1.5 text-ink-faint hover:bg-elevated hover:text-ink"><LogOut size={15} /></button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 border-t border-line py-2.5">
            <span className="grid size-9 place-items-center rounded-xl text-[11px] font-black text-white" style={{ background: `linear-gradient(135deg, ${EM}, ${BLUE})` }}>
              {(me?.full_name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('')}
            </span>
            <button onClick={logout} title="Çıxış" className="rounded-lg p-1.5 text-ink-faint hover:bg-elevated hover:text-ink"><LogOut size={15} /></button>
          </div>
        )}
      </aside>

      <section className="proc-main flex-1 min-w-0 overflow-y-auto">
        <div className="proc-content">
          <div className="proc-page-header proc-rise">
            <button onClick={() => setMobileNav(true)} title="Menyu" className="proc-icon-btn sm:hidden"><Menu size={18} /></button>
            <active.icon size={24} color={EM} className="shrink-0" />
            <h2 className="text-[20px] font-bold leading-none tracking-tight text-ink">
              {active.label}
              {section === 'orders' && <span className="text-[13px] font-medium tabular-nums text-ink-faint"> · {allRows.length} qeyd</span>}
              {section === 'catalog' && <span className="text-[13px] font-medium tabular-nums text-ink-faint"> · {catalog.length} məhsul</span>}
              {section === 'warehouse' && <span className="text-[13px] font-medium tabular-nums text-ink-faint"> · {warehouse.length} məhsul</span>}
            </h2>
            {active.endpoint && (
              <div className="proc-toolbar">
                <div className="proc-search">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-ink-faint" />
                  <input value={section === 'catalog' ? catSearch : section === 'warehouse' ? whSearch : search} onChange={(e) => section === 'catalog' ? setCatSearch(e.target.value) : section === 'warehouse' ? setWhSearch(e.target.value) : setSearch(e.target.value)}
                    placeholder="Axtar..."                     className="proc-control pl-8 pr-2 text-[13px] rounded-lg bg-input border border-line outline-none focus:border-[var(--accent)]" />
                </div>
                {section === 'catalog' && (
                  <select value={firmFilter} onChange={(e) => setFirmFilter(e.target.value)}
                    title="Firma üzrə filtrlə"
                    className="proc-control text-[12px] outline-none focus:border-[var(--accent)]">
                    <option value="">Hamısı</option>
                    {firms.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                )}
                {section === 'orders' && (
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-lg border border-line bg-input px-2.5 py-2 text-[12px] outline-none focus:border-[var(--accent)]">
                    <option value="">Hamısı</option>
                    <option value="pending">Gözləyir</option>
                    <option value="approved">Təsdiqlənib</option>
                    <option value="partially_approved">Qismən</option>
                    <option value="rejected">Rədd</option>
                  </select>
                )}
                {section === 'orders' && !isBoss &&                 <button onClick={() => setEditing({})} className="proc-btn inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[13px]"><Plus size={15} /> Yeni sifariş</button>}
                {section === 'warehouse' && (
                  <>
                    <input ref={whFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleWarehouseFile} />
                    <button onClick={() => setWhAdding(true)} className="proc-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px]"><Plus size={15} /> Əlavə et</button>
                    <button onClick={() => whFileRef.current?.click()} disabled={whImporting || replaceWh.isPending}
                      title="Excel faylı seçin (Malın adı | Ölçü vahidi | Miqdarı) — bütün anbar əvəz olunur"
                      className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-bold hover:brightness-110 disabled:opacity-50"
                      style={{ borderColor: `${AMBER}80`, background: `${AMBER}1a`, color: AMBER }}>
                      <Upload size={15} /> {whImporting || replaceWh.isPending ? 'Yüklənir…' : 'Tam yeniləmə'}
                    </button>
                    <button onClick={handleWarehouseExport}
                      title="Hazırkı anbarı Excel-ə çıxar"
                      className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-bold hover:brightness-110"
                      style={{ borderColor: `${EM}80`, background: `${EM}1a`, color: EM }}>
                      <Download size={15} /> Export
                    </button>
                  </>
                )}
                {section === 'catalog' && isBoss && (
                  <>
                    <input ref={catFileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleCatalogFile} />
                    <button onClick={handleCatalogExport}
                      title="Bütün firma kataloqlarını birləşdirib Excel-ə çıxar"
                      className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-bold hover:brightness-110"
                      style={{ borderColor: `${EM}80`, background: `${EM}1a`, color: EM }}>
                      <Download size={15} /> Excel-ə çıxar
                    </button>
                    <button onClick={() => catFileRef.current?.click()} disabled={importing || replaceCat.isPending}
                      title="Excel faylı seçin (ID | Ad | Vahid | Alis | Firma) — firma seçilibsə yalnız o firma, seçilməyibsə bütün kataloq əvəz olunur"
                      className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-bold hover:brightness-110 disabled:opacity-50"
                      style={{ borderColor: `${AMBER}80`, background: `${AMBER}1a`, color: AMBER }}>
                      <Upload size={15} /> {importing || replaceCat.isPending ? 'Yüklənir…' : 'Excel ilə tam yenilə'}
                    </button>
                    <button onClick={() => setCatEditing({})} className="proc-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px]"><Plus size={15} /> Yeni məhsul əlavə et</button>
                  </>
                )}
              </div>
            )}
          </div>

          {section === 'panel' && <Dashboard dash={dash} />}

          {section === 'orders' && (listQ.isLoading
            ? <SkeletonTable />
            : pageRows.length === 0 ? (
              <EmptyState icon={ShoppingCart} title={search || statusFilter ? 'Axtarışa uyğun sifariş yoxdur' : 'Hələ sifariş yoxdur'}
                hint={search || statusFilter ? 'Filtrləri təmizləyib yenidən cəhd edin' : (!isBoss ? 'İlk təchizat tələbini yaratmaq üçün düyməyə basın' : 'Specialistlər sifariş yaratdıqca burada görünəcək')}
                action={!isBoss && !search && !statusFilter ? (
                  <button onClick={() => setEditing({})} className="proc-btn proc-btn-grad inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px]" style={{ boxShadow: `0 10px 22px -10px ${EM}88` }}><Plus size={15} /> Yeni sifariş</button>
                ) : null} />
            ) : (
              <div className="space-y-5">
                {orderGroups.map(({ status: grpStatus, rows: grpRows }) => {
                  const meta = STATUS_META[grpStatus];
                  const GrpIcon = meta?.icon || Clock;
                  return (
                    <div key={grpStatus}>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="proc-status-badge inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold"
                          style={{ color: meta?.color, background: meta?.bg, boxShadow: `inset 0 0 0 1px ${meta?.color}44` }}>
                          <GrpIcon size={12} strokeWidth={2.5} />
                          {meta?.label}
                        </span>
                        <span className="text-[12px] font-semibold text-ink-faint tabular-nums">{grpRows.length} sifariş</span>
                      </div>
                      <Table columns={ORDER_COLS} rows={grpRows} minWidth={900} onRowClick={(r) => setOpenOrder(r.id)}
                        rowActions={(r) => (<>
                          <button onClick={() => setOpenOrder(r.id)} className="p-1.5 rounded-lg hover:bg-elevated text-ink-faint hover:text-[var(--accent)]" title="Ətraflı bax"><Eye size={14} /></button>
                          {(!isBoss && r.status === 'pending') && (
                            <button onClick={() => setEditing({ id: r.id })} className="p-1.5 rounded-lg hover:bg-elevated text-ink-faint hover:text-[var(--accent)]" title="Redaktə"><Pencil size={14} /></button>
                          )}
                        </>)} />
                    </div>
                  );
                })}
              </div>
            )
          )}

          {section === 'catalog' && (listQ.isLoading
            ? <SkeletonTable />
            : catRows.length === 0 ? (
              <EmptyState icon={Tag} title={catSearch ? 'Axtarışa uyğun məhsul yoxdur' : 'Kataloq boşdur'}
                hint={catSearch ? 'Başqa ID və ya ad yazın' : (isBoss ? 'İlk məhsulu əlavə edin və ya Excel-dən tam yükləyin — sifarişlər buradan ID ilə seçiləcək' : 'Boss kataloqu doldurana qədər gözləyin')}
                action={isBoss && !catSearch ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button onClick={() => catFileRef.current?.click()} disabled={importing || replaceCat.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-[13px] font-bold hover:brightness-110 disabled:opacity-50"
                      style={{ borderColor: `${AMBER}80`, background: `${AMBER}1a`, color: AMBER }}>
                      <FileSpreadsheet size={15} /> Excel ilə tam yenilə
                    </button>
                    <button onClick={() => setCatEditing({})} className="proc-btn proc-btn-grad inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px]" style={{ boxShadow: `0 10px 22px -10px ${EM}88` }}><Plus size={15} /> Yeni məhsul əlavə et</button>
                  </div>
                ) : null} />
            ) : (
              <div className="space-y-6">
                {firmGroups.map(([firmName, firmItems]) => {
                  const isImza = firmName === 'İmza';
                  const isPremier = firmName === 'Premier';
                  const firmColor = isImza ? EM : isPremier ? VIOLET : BLUE;
                  const firmLabel = isImza
                    ? 'İmza — Ofis məhsulları'
                    : isPremier
                      ? 'Premier — Texnoloji avadanlıqlar'
                      : firmName === 'UMUMI' ? 'Ümumi kataloq' : firmName;
                  return (
                    <div key={firmName} className="proc-rise">
                      {/* Firma başlığı + firma üçün ayrıca import/export */}
                      <div className="mb-2.5 flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2">
                          <span className="grid size-6 place-items-center rounded-lg shrink-0" style={{ background: `${firmColor}1a`, color: firmColor }}>
                            <Tag size={12} strokeWidth={2.5} />
                          </span>
                          <span className="text-[13px] font-bold" style={{ color: firmColor }}>{firmLabel}</span>
                          <span className="text-[11px] text-ink-faint tabular-nums font-semibold">{firmItems.length} məhsul</span>
                        </div>
                        {isBoss && (
                          <div className="ml-auto flex flex-wrap items-center gap-1.5">
                            {/* Bu firma üçün export */}
                            <button
                              onClick={async () => {
                                if (!firmItems.length) { window.alert('Bu firmada məhsul yoxdur'); return; }
                                try {
                                  const XLSX = await import('xlsx');
                                  const sheet = XLSX.utils.aoa_to_sheet([
                                    ['ID', 'Ad', 'Vahid', 'Alis', 'Firma'],
                                    ...firmItems.map((c) => [c.internal_id, c.name, c.unit, Number(c.buy_price), c.firm || 'UMUMI']),
                                  ]);
                                  sheet['!cols'] = [{ wch: 14 }, { wch: 42 }, { wch: 10 }, { wch: 12 }, { wch: 18 }];
                                  const wb = XLSX.utils.book_new();
                                  const safeSheet = firmName.slice(0, 31);
                                  XLSX.utils.book_append_sheet(wb, sheet, safeSheet);
                                  const d2 = new Date();
                                  const stamp = `${d2.getFullYear()}-${String(d2.getMonth() + 1).padStart(2, '0')}-${String(d2.getDate()).padStart(2, '0')}`;
                                  XLSX.writeFile(wb, `kataloq-${firmName.toLowerCase().replace(/\s+/g, '-')}-${stamp}.xlsx`);
                                } catch (ex) { window.alert(ex?.message || 'Excel yazılmadı'); }
                              }}
                              title={`"${firmName}" firmasını Excel-ə çıxar`}
                              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold hover:brightness-110"
                              style={{ borderColor: `${firmColor}60`, background: `${firmColor}12`, color: firmColor }}>
                              <Download size={12} /> Çıxar
                            </button>
                            {/* Bu firma üçün import */}
                            <label
                              title={`"${firmName}" firmasını Excel-dən yenilə`}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold hover:brightness-110"
                              style={{ borderColor: `${AMBER}60`, background: `${AMBER}12`, color: AMBER }}>
                              <Upload size={12} /> {importing || replaceCat.isPending ? 'Yüklənir…' : 'Yenilə'}
                              <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  setImporting(true);
                                  try {
                                    const buf = await f.arrayBuffer();
                                    const XLSX = await import('xlsx');
                                    const wb2 = XLSX.read(buf, { type: 'array' });
                                    const ws = wb2.Sheets[wb2.SheetNames[0]];
                                    if (!ws) { window.alert('Excel-də vərəq tapılmadı'); return; }
                                    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
                                    if (!grid.length) { window.alert('Fayl boşdur'); return; }
                                    const normCell = (v) => String(v ?? '').trim();
                                    const numCell = (v) => {
                                      if (v === '' || v == null) return NaN;
                                      if (typeof v === 'number') return v;
                                      let s = String(v).replace(/\s/g, '');
                                      if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
                                      else if (s.includes(',')) s = s.replace(',', '.');
                                      return Number(s);
                                    };
                                    const head = grid[0].map((c) => normCell(c).toLowerCase());
                                    const findCol = (keys) => head.findIndex((c) => keys.some((k) => c.includes(k)));
                                    const idIdx = findCol(['id']);
                                    const nameIdx = findCol(['ad', 'name', 'məhsul', 'mehsul']);
                                    const unitIdx = findCol(['vahid', 'unit']);
                                    const buyIdx = findCol(['alış', 'alis', 'qiymət', 'qiymet', 'price']);
                                    const looksHeader = idIdx >= 0 || nameIdx >= 0 || unitIdx >= 0 || buyIdx >= 0;
                                    const col = (i, fallback) => (i >= 0 ? i : fallback);
                                    const body2 = looksHeader ? grid.slice(1) : grid;
                                    const items2 = [];
                                    for (let i = 0; i < body2.length; i++) {
                                      const row = body2[i];
                                      const id = normCell(row[col(idIdx, 0)]).toUpperCase();
                                      const name = normCell(row[col(nameIdx, 1)]);
                                      if (!id && !name) continue;
                                      items2.push({ internal_id: id, name, unit: normCell(row[col(unitIdx, 2)]) || 'əd', buy_price: numCell(row[col(buyIdx, 3)]), firm: firmName });
                                    }
                                    if (!items2.length) { window.alert('Heç bir məhsul tapılmadı'); return; }
                                    const bad2 = items2.find((it) => !it.internal_id || !it.name || !Number.isFinite(it.buy_price) || it.buy_price < 0);
                                    if (bad2) { window.alert(`Yoxlayın: "${bad2.internal_id || bad2.name || 'boş sətir'}" — ID, ad və alış qiyməti düzgün olmalıdır`); return; }
                                    if (!window.confirm(`${items2.length} məhsul tapıldı. Yalnız "${firmName}" firması əvəz olunacaq. Davam edilsin?`)) return;
                                    await replaceCat.mutateAsync({ items: items2, firm: firmName });
                                  } catch (ex) { window.alert(ex?.message || 'Excel oxunmadı'); }
                                  finally { setImporting(false); if (e.target) e.target.value = ''; }
                                }} />
                            </label>
                          </div>
                        )}
                      </div>
                      <Table columns={CAT_COLS} rows={firmItems}
                        rowActions={isBoss ? ((r) => (<>
                          <button onClick={() => setCatEditing(r)} className="p-1.5 rounded-lg hover:bg-elevated text-ink-faint hover:text-[var(--accent)]" title="Redaktə"><Pencil size={14} /></button>
                          <button onClick={() => { if (window.confirm('Bu məhsul silinsin?')) delCat.mutate(r); }} className="p-1.5 rounded-lg hover:bg-elevated text-ink-faint hover:text-[var(--status-red)]" title="Sil"><Trash2 size={14} /></button>
                        </>)) : undefined} />
                    </div>
                  );
                })}
              </div>
            )
          )}

          {active.endpoint && section === 'orders' && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2 text-[13px]">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="rounded-lg border border-line px-3 py-1.5 font-semibold disabled:opacity-40 hover:border-[var(--accent)]"><ChevronLeft size={15} /></button>
              <span className="px-2 text-ink-muted">{safePage} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="rounded-lg border border-line px-3 py-1.5 font-semibold disabled:opacity-40 hover:border-[var(--accent)]"><ChevronRight size={15} /></button>
            </div>
          )}

          {/* ── Anbar: yuxarıda əsas anbar, aşağıda Silinmələr ── */}
          {section === 'warehouse' && (whQ.isLoading || remQ.isLoading
            ? <SkeletonTable />
            : (
              <div className="space-y-6">
                <div>
                  {whNumbered.length === 0 ? (
                    <EmptyState icon={Warehouse} title={whSearch ? 'Axtarışa uyğun məhsul yoxdur' : 'Anbar boşdur'}
                      hint={whSearch ? 'Başqa ad yazın' : 'Excel-dən Tam yeniləmə edin və ya Əlavə et düyməsi ilə ilk məhsulu yaradın'} />
                  ) : (
                    <Table columns={WH_COLS} rows={whNumbered} minWidth={640} />
                  )}
                </div>
                <div>
                  <div className="mb-2.5 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className="grid size-6 place-items-center rounded-lg shrink-0" style={{ background: `${RED}1a`, color: RED }}>
                        <Minus size={12} strokeWidth={2.5} />
                      </span>
                      <span className="text-[13px] font-bold">Silinmələr</span>
                      <span className="text-[11px] text-ink-faint tabular-nums font-semibold">{removalRows.length} sətir</span>
                    </div>
                    <div className="ml-auto">
                      <button onClick={() => { setRemovalErr(''); setRemovalOpen(true); }}
                        disabled={!warehouse.length}
                        className="proc-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] disabled:opacity-50">
                        <Plus size={15} /> Silinmə yarat</button>
                    </div>
                  </div>
                  {removalRows.length === 0 ? (
                    <EmptyState icon={Minus} title="Hələ silinmə yoxdur"
                      hint="Əsas anbardan silinən mallar burada görünəcək — miqdar avtomatik azalacaq" />
                  ) : (
                    <Table columns={REM_COLS} rows={removalRows} minWidth={860} onRowClick={(r) => setOpenRemoval(r.removal_id)} />
                  )}
                </div>
              </div>
            )
          )}

          {/* ── 1C: tamamilə boş bölmə (yalnız səhifə + naviqasiya) ── */}
          {section === '1c' && null}

          <footer className="mt-4 pt-2 border-t border-line text-center">
            <p className="text-[11px] font-semibold text-ink-faint">Appina Procurement — Developed by <a href="https://www.linkedin.com/in/elinzrv/" target="_blank" rel="noopener noreferrer" title="LinkedIn — Elməddin Nəzərli" className="proc-grad font-black hover:opacity-80 hover:underline underline-offset-2">Elməddin Nəzərli</a></p>
          </footer>
        </div>
      </section>


      {openOrder && <OrderDrawer orderId={openOrder} me={me} onClose={() => setOpenOrder(null)} onChanged={refetchAll} />}
      {openRemoval && <RemovalDrawer removalId={openRemoval} stock={warehouse} onClose={() => setOpenRemoval(null)} onChanged={refetchAll} />}
      {editing && (editing.id && !editDetail
        ? <Modal onClose={() => setEditing(null)} maxWidth={400}><div className="p-8 text-center text-ink-faint">{editErr || 'Yüklənir…'}</div></Modal>
        : <OrderForm order={editing.id ? { ...editing, ...editDetail?.order, items: editDetail?.items } : null}
            onClose={() => { setEditing(null); setEditDetail(null); setSaveErr(''); }}
            onSave={(form) => { setSaveErr(''); saveOrder.mutate(form); }} saving={saveOrder.isPending} serverErr={saveErr} />)}
      {catEditing && <CatalogForm row={catEditing.id ? catEditing : null} firms={firms} onClose={() => setCatEditing(null)} onSave={(f) => saveCat.mutate(f)} saving={saveCat.isPending} />}
      {whAdding && <WarehouseForm onClose={() => setWhAdding(false)} onSave={(f) => addWh.mutate(f)} saving={addWh.isPending} />}
      {removalOpen && (
        <RemovalForm stock={warehouse}
          nextDocNo={String((removals.reduce((m, r) => Math.max(m, Number(r.doc_no) || 0), 0) || removals.length) + 1)}
          onClose={() => { setRemovalOpen(false); setRemovalErr(''); }}
          onSave={(f) => { setRemovalErr(''); createRemoval.mutate(f); }}
          saving={createRemoval.isPending} serverErr={removalErr} />
      )}
    </div>
  );
}

// ── Auth shell: tap-to-enter profile picker (no passwords) ──
function initials(name) {
  return String(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function Login({ onDone }) {
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(null);
  useEffect(() => {
    api.get('/auth/users').then((d) => setUsers(d.users || [])).catch((e) => setErr(e?.message || 'İstifadəçilər yüklənmədi'));
  }, []);
  const enter = async (login) => {
    setErr(''); setBusy(login);
    try { const d = await api.post('/auth/login', { login }); onDone(d.user); }
    catch (e) { setErr(e?.message || 'Giriş alınmadı'); setBusy(null); }
  };
  const bosses = (users || []).filter((u) => u.proc_role === 'boss');
  const specs = (users || []).filter((u) => u.proc_role !== 'boss');
  const card = (u, label) => {
    const boss = u.proc_role === 'boss';
    const accent = boss ? EM : BLUE;
    return (
      <button key={u.login} onClick={() => enter(u.login)} disabled={busy !== null}
        className="proc-card hov group flex w-full items-center gap-3 p-3 text-left disabled:opacity-60">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl text-[12px] font-black text-white" style={{ background: `linear-gradient(135deg, ${accent}, ${boss ? BLUE : VIOLET})` }}>
          {boss ? 'B' : 'S'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold">{label}</span>
          <span className={`proc-role mt-0.5 ${boss ? 'proc-role--boss' : 'proc-role--spec'}`}>
            {boss ? 'BOSS' : 'SPECIALIST'}
          </span>
        </span>
        <span className="proc-btn shrink-0 rounded-lg px-3 py-2 text-[12px] transition group-hover:brightness-110" style={{ background: `linear-gradient(135deg, ${accent}, ${BLUE})` }}>
          {busy === u.login ? '…' : 'Gir'}
        </span>
      </button>
    );
  };
  return (
    <div className="proc-app relative grid min-h-screen place-items-center overflow-hidden p-6">
      <Style />
      <div className="proc-login-glow" />
      <div className="proc-card proc-rise relative w-full max-w-md p-7 sm:p-8">
        <span className="proc-accent-bar proc-accent-bar--trio" style={{ insetInline: '1.5rem', borderRadius: '0 0 9999px 9999px' }} />
        <div className="text-center">
          <Lock size={34} color={EM} className="mx-auto mb-5" />
          <h2 className="proc-grad text-[22px] font-black leading-none tracking-tight">Procurement</h2>
          <p className="mt-2 text-[12px] text-ink-faint">Appina təchizat idarəetməsi — profilini seç, daxil ol</p>
        </div>
        <div className="mt-6">
          {users === null && !err && (
            <div className="space-y-2.5">
              <div className="proc-skel h-[68px] rounded-2xl" />
              <div className="proc-skel h-[68px] rounded-2xl" style={{ opacity: .75 }} />
              <div className="proc-skel h-[68px] rounded-2xl" style={{ opacity: .5 }} />
            </div>
          )}
          {bosses.length > 0 && (
            <>
              <div className="proc-label" style={{ marginBottom: 8 }}>Rəhbərlik</div>
              <div className="space-y-2.5">{bosses[0] && card(bosses[0], 'Boss')}</div>
            </>
          )}
          {specs.length > 0 && (
            <>
              <div className="proc-label" style={{ marginBottom: 8, marginTop: 20 }}>Mütəxəssislər</div>
              <div className="space-y-2.5">{specs[0] && card(specs[0], 'Specialist')}</div>
            </>
          )}
        </div>
        {err && <p className="mt-3 text-center text-[12px] text-[var(--status-red)]">{err}</p>}
        <p className="mt-5 text-center text-[10px] text-ink-faint">Şifrə yoxdur — kartına toxun, işə başla</p>
      </div>
    </div>
  );
}

export function AuthShell() {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get('/auth/me').then((d) => setMe(d.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);
  if (loading) return <div className="proc-app min-h-screen grid place-items-center text-ink-faint"><Style />Yüklənir…</div>;
  if (!me) return <Login onDone={setMe} />;
  return <Procurement me={me} />;
}

// Standalone logout helper (used by future header menu).
export async function logout() {
  try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
  window.location.reload();
}
