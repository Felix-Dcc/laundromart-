import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { StatusBadge, Drawer, Modal, money, fmtDateTime, SkeletonTable, Skeleton, Empty } from '../components/ui';
import { adminApi } from '../api/client';
import { onOrderFeed } from '../lib/socket';
import { useToast } from '../components/Toast';

const STATUS_FILTERS = ['', 'awaiting_rider', 'rider_assigned', 'picked_up', 'at_laundromat', 'weight_verified', 'washing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];

export default function Orders() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(params.get('focus') ? Number(params.get('focus')) : null);

  const load = useCallback(async (p = 1) => {
    setRows(null);
    const r = await adminApi.orders({ page: p, status: status || undefined, search: search || undefined });
    setRows(r.data.requests); setPage(p); setPages(r.data.pagination?.totalPages || 1);
  }, [status, search]);

  useEffect(() => { load(1); }, [status]); // eslint-disable-line
  useEffect(() => { const off = onOrderFeed(() => load(page)); return off; }, [load, page]);

  return (
    <>
      <PageHead title="Orders" sub="Every order across the platform" />
      <div className="toolbar">
        <form className="search" style={{ maxWidth: 320 }} onSubmit={(e) => { e.preventDefault(); load(1); }}>
          <Icon name="search" size={15} color="var(--text-3)" />
          <input placeholder="Search # / customer / service" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, ' ') : 'All statuses'}</option>)}
        </select>
        <button className="btn" onClick={() => load(page)}><Icon name="refresh" size={15} /> Refresh</button>
      </div>

      {rows == null ? <SkeletonTable cols={7} /> : (
      <div className="card">
        {rows.length === 0 ? <Empty title="No orders found" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Order</th><th>Customer</th><th>Laundromat</th><th>Status</th><th>Amount</th><th>Payment</th><th>Created</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} className="row-click" onClick={() => setOpenId(o.id)}>
                    <td style={{ fontWeight: 700 }}>{o.requestNumber}</td>
                    <td>{o.user?.name || '—'}</td>
                    <td>{o.provider?.name || <span className="muted">Unassigned</span>}</td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="mono">{money(o.amountDue)}</td>
                    <td><span className="badge" style={{ background: o.paymentStatus === 'paid' ? 'rgba(16,185,129,.14)' : 'rgba(245,158,11,.14)', color: o.paymentStatus === 'paid' ? '#059669' : '#d97706' }}>{o.paymentStatus}</span></td>
                    <td className="muted">{fmtDateTime(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && pages > 1 && (
          <div className="spread" style={{ padding: 12 }}>
            <span className="muted" style={{ fontSize: 13 }}>Page {page} of {pages}</span>
            <div className="row">
              <button className="btn sm" disabled={page <= 1} onClick={() => load(page - 1)}><Icon name="chevronL" size={14} /></button>
              <button className="btn sm" disabled={page >= pages} onClick={() => load(page + 1)}><Icon name="chevronR" size={14} /></button>
            </div>
          </div>
        )}
      </div>
      )}

      {openId && <OrderDrawer id={openId} onClose={() => setOpenId(null)} onChanged={() => load(page)} />}
    </>
  );
}

function OrderDrawer({ id, onClose, onChanged }) {
  const { toast, confirm } = useToast();
  const [order, setOrder] = useState(null);
  const [riders, setRiders] = useState([]);
  const [reassign, setReassign] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await adminApi.orderDetails(id);
    setOrder(r.data.request);
  }
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  async function act(fn, confirmMsg) {
    if (confirmMsg && !(await confirm({ title: 'Confirm action', message: confirmMsg, danger: /cancel|refund/i.test(confirmMsg) }))) return;
    setBusy(true);
    try { await fn(); toast.success('Done'); await load(); onChanged(); }
    catch (e) { toast.error(e.response?.data?.error || 'Action failed.'); }
    finally { setBusy(false); }
  }
  async function openReassign() {
    const r = await adminApi.ridersForAssign();
    setRiders(r.data.riders || []); setReassign(true);
  }

  const canCancel = order && (order.allowedActions || []).some((a) => a.to === 'cancelled');
  const reassignable = order && ['rider_assigned', 'rider_on_the_way', 'rider_arrived'].includes(order.status);

  return (
    <Drawer title={order ? `Order ${order.requestNumber}` : 'Order'} onClose={onClose}
      actions={order && (
        <>
          {reassignable && <button className="btn" disabled={busy} onClick={openReassign}><Icon name="refresh" size={15} /> Reassign Rider</button>}
          {canCancel && <button className="btn danger" disabled={busy} onClick={() => act(() => adminApi.setOrderStatus(id, { newStatus: 'cancelled', adminNotes: 'Cancelled by admin' }), 'Cancel this order?')}><Icon name="x" size={15} /> Cancel</button>}
        </>
      )}>
      {!order ? <div className="grid" style={{ gap: 12 }}><Skeleton h={64} r={12} /><Skeleton h={120} r={12} /><Skeleton h={90} r={12} /></div> : (
        <div className="grid" style={{ gap: 16 }}>
          <div className="spread"><StatusBadge status={order.status} /><span className="mono" style={{ fontWeight: 800, fontSize: 18 }}>{money(order.amountDue)}</span></div>

          <Section title="Parties">
            <Row k="Customer" v={order.user?.name} />
            <Row k="Phone" v={order.user?.phone} />
            <Row k="Laundromat" v={order.provider?.name || 'Unassigned'} />
            <Row k="Pickup Rider" v={order.assignedRider?.name || 'Unassigned'} />
            <Row k="Delivery Rider" v={order.deliveryRider?.name || 'Unassigned'} />
          </Section>

          <Section title="Pricing">
            <Row k="Service" v={order.laundryType} />
            <Row k="Est. Weight" v={`${order.estimatedWeightKg} kg`} />
            {order.weightVerified && <Row k="Actual Weight" v={`${order.actualWeightKg} kg`} />}
            <Row k="Estimated" v={money(order.estimatedAmount)} />
            {order.weightVerified && <Row k="Final" v={money(order.finalAmount)} />}
            <Row k="Payment" v={order.paymentStatus} />
          </Section>

          <Section title="Timeline">
            {(order.statusHistory || []).map((h, i) => (
              <div key={i} className="row" style={{ gap: 10, padding: '6px 0' }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--brand)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{h.label}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{h.by ? `${h.by.name} · ${h.by.role}` : ''} {h.at ? `· ${fmtDateTime(h.at)}` : ''}{h.notes ? ` — ${h.notes}` : ''}</div>
                </div>
              </div>
            ))}
          </Section>
        </div>
      )}

      {reassign && (
        <Modal title="Reassign Rider" onClose={() => setReassign(false)}>
          <div className="grid" style={{ gap: 6, maxHeight: 340, overflowY: 'auto' }}>
            {riders.length === 0 && <div className="muted">No riders available.</div>}
            {riders.map((r) => (
              <button key={r.id} className="btn" style={{ justifyContent: 'space-between' }} disabled={busy}
                onClick={() => act(() => adminApi.reassignRider(id, r.id).then(() => setReassign(false)))}>
                <span>{r.firstName} {r.lastName}</span>
                <span className="muted" style={{ fontSize: 12 }}>{r.riderStatus} · {r.totalPickups} pickups</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </Drawer>
  );
}

const Section = ({ title, children }) => (
  <div><div className="card-title" style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text-2)', marginBottom: 6 }}>{title}</div>{children}</div>
);
const Row = ({ k, v }) => (
  <div className="spread" style={{ padding: '5px 0', fontSize: 13.5 }}><span className="muted">{k}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{v || '—'}</span></div>
);
