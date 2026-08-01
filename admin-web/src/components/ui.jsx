import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

// Trap focus inside an overlay and close it on Escape. Shared by Modal/Drawer
// so every dialog is keyboard-accessible without repeating the plumbing.
function useDialogA11y(onClose) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    const prev = document.activeElement;
    const focusables = () => node?.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (focusables()?.[0] || node)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key === 'Tab' && node) {
        const els = [...focusables()].filter((el) => !el.disabled);
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return ref;
}

export const money = (n) => `GHS ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// Client-side CSV export from an array of objects.
export function exportCsv(filename, rows) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const download = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const xmlEsc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/\r?\n/g, ' ');

/**
 * Excel export via SpreadsheetML 2003 — a real Microsoft format, so Excel opens
 * it without the "format and extension don't match" warning you get from the
 * common trick of renaming an HTML table to .xls. Numbers stay numeric, so
 * totals and sorting work. No dependency: admin-web builds with `npm ci`, and a
 * spreadsheet library would add hundreds of KB for one button.
 */
export function exportExcel(filename, rows, sheetName = 'Report') {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    const isNum = typeof v === 'number' && Number.isFinite(v);
    return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${xmlEsc(isNum ? v : v)}</Data></Cell>`;
  };
  const header = `<Row>${cols.map((c) => `<Cell ss:StyleID="h"><Data ss:Type="String">${xmlEsc(c)}</Data></Cell>`).join('')}</Row>`;
  const body = rows.map((r) => `<Row>${cols.map((c) => cell(r[c])).join('')}</Row>`).join('');
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1"/><Interior ss:Color="#EEF2FF" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="${xmlEsc(sheetName).slice(0, 31)}"><Table>${header}${body}</Table></Worksheet></Workbook>`;
  download(new Blob([xml], { type: 'application/vnd.ms-excel' }), filename);
}

/**
 * PDF via the browser's own print pipeline ("Save as PDF"). This handles page
 * breaks, repeating table headers and the user's paper size for free — better
 * output than hand-rolling a PDF, and again no dependency.
 */
export function exportPdf(title, rows, subtitle = '') {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    *{box-sizing:border-box} body{font:12px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:24px}
    h1{font-size:18px;margin:0 0 2px} .sub{color:#666;font-size:11.5px;margin-bottom:14px}
    table{width:100%;border-collapse:collapse} thead{display:table-header-group}
    th{text-align:left;background:#eef2ff;font-size:10.5px;text-transform:uppercase;letter-spacing:.3px}
    th,td{border:1px solid #dcdfe6;padding:6px 8px;font-size:11px} tr{page-break-inside:avoid}
    tbody tr:nth-child(even){background:#fafafa}
    @page{margin:14mm}
  </style></head><body>
    <h1>${esc(title)}</h1>
    <div class="sub">${esc(subtitle)}${subtitle ? ' · ' : ''}${rows.length} rows · generated ${new Date().toLocaleString()}</div>
    <table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table>
  </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return false; // popup blocked — caller surfaces a message
  w.document.write(html);
  w.document.close();
  w.focus();
  // Let layout settle before invoking the print dialog.
  setTimeout(() => w.print(), 250);
  return true;
}

// Order status → label + color (mirrors the mobile/back-end vocabulary).
export const STATUS = {
  created: ['Created', '#f59e0b'], awaiting_rider: ['Awaiting Rider', '#f59e0b'],
  rider_assigned: ['Rider Assigned', '#3b82f6'], rider_on_the_way: ['On The Way', '#3b82f6'],
  rider_arrived: ['Arrived', '#3b82f6'], picked_up: ['Picked Up', '#3b82f6'],
  at_laundromat: ['At Laundromat', '#8b5cf6'], weight_verified: ['Weight Verified', '#8b5cf6'],
  preparing: ['Preparing', '#8b5cf6'], washing: ['Washing', '#8b5cf6'], drying: ['Drying', '#8b5cf6'],
  ironing: ['Ironing', '#8b5cf6'], ready_for_delivery: ['Ready For Pickup', '#10b981'],
  delivery_rider_assigned: ['Delivery Assigned', '#0ea5e9'], rider_to_laundromat: ['To Laundromat', '#0ea5e9'],
  collected_from_laundromat: ['Collected', '#0ea5e9'], out_for_delivery: ['Out For Delivery', '#0ea5e9'],
  rider_arrived_at_customer: ['Arrived At Customer', '#0ea5e9'], delivered: ['Delivered', '#10b981'],
  completed: ['Completed', '#059669'], cancelled: ['Cancelled', '#ef4444'],
  failed: ['Failed', '#ef4444'], refunded: ['Refunded', '#f59e0b'],
};

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function StatusBadge({ status }) {
  const [label, color] = STATUS[status] || [status, '#6b7280'];
  return (
    <span className="badge" style={{ background: hexA(color, 0.14), color }}>
      <span className="d" style={{ background: color }} /> {label}
    </span>
  );
}

export function Badge({ text, color = '#6b7280', dot = true }) {
  return (
    <span className="badge" style={{ background: hexA(color, 0.14), color }}>
      {dot && <span className="d" style={{ background: color }} />} {text}
    </span>
  );
}

// `to` makes a KPI actionable — e.g. pending approvals link straight to the
// queue that clears them. Without it the tile renders exactly as before.
export function Kpi({ icon, label, value, tint = '#4f46e5', delta, to, hint }) {
  const inner = (
    <>
      <div className="k-ico" style={{ background: hexA(tint, 0.14), color: tint }}><Icon name={icon} size={19} /></div>
      <div className="k-label">{label}</div>
      <div className="k-value mono">{value}</div>
      {delta != null && (
        <div className={`k-delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</div>
      )}
      {hint && <div className="k-hint">{hint}</div>}
    </>
  );
  if (!to) return <div className="kpi">{inner}</div>;
  return (
    <Link to={to} className="kpi kpi-link" aria-label={`${label}: ${value}. Open`}>
      {inner}
      <span className="k-go" aria-hidden="true"><Icon name="chevronR" size={14} /></span>
    </Link>
  );
}

// Preset + custom date-range picker. `value` is either { days } or { from, to }.
// Emits the same shape the analytics API accepts, so callers just pass it through.
export const RANGE_PRESETS = [
  { label: 'Today', days: 1 },
  { label: 'Week', days: 7 },
  { label: 'Month', days: 30 },
  { label: 'Year', days: 365 },
  { label: 'All', days: null },
];

export function RangePicker({ value, onChange }) {
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(value?.from || '');
  const [to, setTo] = useState(value?.to || '');
  const today = new Date().toISOString().slice(0, 10);

  function applyCustom() {
    if (!from && !to) return;
    onChange({ from: from || undefined, to: to || undefined });
  }

  return (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <div className="seg" role="group" aria-label="Date range">
        {RANGE_PRESETS.map((p) => {
          const active = !custom && !value?.from && (value?.days ?? null) === p.days;
          return (
            <button
              key={p.label}
              className={`seg-btn ${active ? 'active' : ''}`}
              aria-pressed={active}
              onClick={() => { setCustom(false); onChange(p.days ? { days: p.days } : {}); }}
            >
              {p.label}
            </button>
          );
        })}
        <button className={`seg-btn ${custom ? 'active' : ''}`} aria-pressed={custom} onClick={() => setCustom((c) => !c)}>Custom</button>
      </div>
      {custom && (
        <div className="row" style={{ gap: 6 }}>
          <input className="input input-sm" type="date" max={today} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <span className="muted">→</span>
          <input className="input input-sm" type="date" max={today} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          <button className="btn sm primary" onClick={applyCustom} disabled={!from && !to}>Apply</button>
        </div>
      )}
    </div>
  );
}

export function Loading({ label = 'Loading…' }) {
  return <div className="row" style={{ color: 'var(--text-2)', padding: 40, justifyContent: 'center' }}><span className="spinner" /> <span style={{ marginLeft: 10 }}>{label}</span></div>;
}

export function Empty({ title = 'Nothing here', sub }) {
  return (
    <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-2)' }}>
      <div style={{ fontSize: 34, marginBottom: 6 }}>✦</div>
      <div style={{ fontWeight: 700, color: 'var(--text)' }}>{title}</div>
      {sub && <div style={{ fontSize: 13, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Drawer({ title, onClose, children, actions }) {
  const ref = useDialogA11y(onClose);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {actions && <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>{actions}</div>}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, actions }) {
  const ref = useDialogA11y(onClose);
  return (
    <div className="overlay" style={{ justifyContent: 'center', alignItems: 'center' }} onClick={onClose}>
      <div className="modal" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ fontWeight: 800 }}>{title}</div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {actions && <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>{actions}</div>}
      </div>
    </div>
  );
}

// ── Skeleton loaders — shaped placeholders that reduce layout shift. ──
export function Skeleton({ w = '100%', h = 14, r = 8, style }) {
  return <span className="skel" style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;
}

export function SkeletonTable({ rows = 6, cols = 5 }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16 }}>
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} w={`${100 / cols}%`} h={11} />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ padding: '15px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center' }}>
          {Array.from({ length: cols }).map((_, c) => <Skeleton key={c} w={c === 0 ? '60%' : `${70 / cols}%`} h={13} />)}
        </div>
      ))}
    </div>
  );
}

// ── Bulk-select checkbox (tri-state header supported via `indeterminate`) ──
export function Check({ checked, indeterminate, onChange, label }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked; }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className="row-check"
      checked={!!checked}
      aria-label={label || 'Select row'}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ── Floating bulk-action bar shown when rows are selected. ──
export function BulkBar({ count, onClear, children }) {
  if (!count) return null;
  return (
    <div className="bulkbar" role="region" aria-label="Bulk actions">
      <span className="bulkbar-count">{count} selected</span>
      <div className="bulkbar-actions">{children}</div>
      <button className="btn sm ghost" onClick={onClear}>Clear</button>
    </div>
  );
}

export function SkeletonKpis({ count = 8 }) {
  return (
    <div className="kpi-grid" aria-busy="true" aria-label="Loading metrics">
      {Array.from({ length: count }).map((_, i) => (
        <div className="kpi" key={i}>
          <Skeleton w={40} h={40} r={11} />
          <Skeleton w="70%" h={11} style={{ marginTop: 12 }} />
          <Skeleton w="45%" h={22} style={{ marginTop: 8 }} />
        </div>
      ))}
    </div>
  );
}
