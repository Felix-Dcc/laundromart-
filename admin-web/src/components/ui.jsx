import Icon from './Icon';

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

export function Kpi({ icon, label, value, tint = '#4f46e5', delta }) {
  return (
    <div className="kpi">
      <div className="k-ico" style={{ background: hexA(tint, 0.14), color: tint }}><Icon name={icon} size={19} /></div>
      <div className="k-label">{label}</div>
      <div className="k-value mono">{value}</div>
      {delta != null && (
        <div className={`k-delta ${delta >= 0 ? 'up' : 'down'}`}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%</div>
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
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div style={{ fontWeight: 800, fontSize: 16 }}>{title}</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {actions && <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>{actions}</div>}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, actions }) {
  return (
    <div className="overlay" style={{ justifyContent: 'center', alignItems: 'center' }} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ fontWeight: 800 }}>{title}</div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
        {actions && <div style={{ padding: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>{actions}</div>}
      </div>
    </div>
  );
}
