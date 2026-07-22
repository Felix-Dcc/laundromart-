import { useEffect, useState, useCallback } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Kpi, Badge, money, fmtDateTime, SkeletonTable, Empty, exportCsv } from '../components/ui';
import { sa } from '../api/client';
import { payApi } from '../api/client';
import { useToast } from '../components/Toast';

const PAY_STATUS = { paid: '#10b981', pending: '#f59e0b', failed: '#ef4444', refunded: '#6366f1' };
const STATUSES = ['', 'paid', 'pending', 'failed', 'refunded'];

export default function Payments() {
  const { toast, confirm } = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [method, setMethod] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async (p = 1) => {
    setData(null);
    const r = await sa.payments({ page: p, status: status || undefined, method: method || undefined, search: search || undefined });
    setData(r.data); setPage(p);
  }, [status, method, search]);
  useEffect(() => { load(1); }, [status, method]); // eslint-disable-line

  async function refund(t) {
    if (!(await confirm({ title: 'Issue refund', message: `Refund ${money(t.amount)} for ${t.orderNumber}? This returns funds to the customer.`, danger: true, confirmLabel: 'Refund' }))) return;
    setBusy(t.id);
    try { await payApi.refund(t.reference); toast.success('Refund issued'); await load(page); }
    catch (e) { toast.error(e.response?.data?.error || 'Refund failed.'); }
    finally { setBusy(null); }
  }

  return (
    <>
      <PageHead title="Payments" sub="Transactions, revenue & refunds"
        actions={<button className="btn" disabled={!data} onClick={() => exportCsv('payments.csv', data.transactions)}><Icon name="download" size={15} /> Export CSV</button>} />

      {data && (
        <div className="kpi-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
          <Kpi icon="cash" label="Revenue (paid)" value={money(data.summary.revenue)} tint="#10b981" />
          <Kpi icon="refresh" label="Refunds" value={money(data.summary.refunds)} tint="#6366f1" />
          <Kpi icon="x" label="Failed" value={data.summary.failed} tint="#ef4444" />
          <Kpi icon="clock" label="Pending" value={data.summary.pending} tint="#f59e0b" />
        </div>
      )}

      <div className="toolbar">
        <form className="search" style={{ maxWidth: 300 }} onSubmit={(e) => { e.preventDefault(); load(1); }}>
          <Icon name="search" size={15} color="var(--text-3)" />
          <input placeholder="Reference / order / email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}</select>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">All methods</option><option value="momo">Mobile Money</option><option value="card">Card</option></select>
      </div>

      {data == null ? <SkeletonTable cols={8} /> : (
      <div className="card">
        {data.transactions.length === 0 ? <Empty title="No transactions" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Reference</th><th>Order</th><th>Customer</th><th>Method</th><th>Amount</th><th>Status</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {data.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{t.reference}</td>
                    <td style={{ fontWeight: 600 }}>{t.orderNumber || '—'}</td>
                    <td>{t.customer}<div className="muted" style={{ fontSize: 11 }}>{t.email}</div></td>
                    <td style={{ textTransform: 'uppercase', fontSize: 12 }}>{t.method}{t.channel ? ` · ${t.channel}` : ''}</td>
                    <td className="mono">{money(t.amount)}</td>
                    <td><Badge text={t.status} color={PAY_STATUS[t.status] || '#6b7280'} /></td>
                    <td className="muted">{fmtDateTime(t.createdAt)}</td>
                    <td>{t.status === 'paid' && <button className="btn sm" disabled={busy === t.id} onClick={() => refund(t)}>Refund</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.pagination.totalPages > 1 && (
          <div className="spread" style={{ padding: 12 }}>
            <span className="muted" style={{ fontSize: 13 }}>Page {page} of {data.pagination.totalPages}</span>
            <div className="row"><button className="btn sm" disabled={page <= 1} onClick={() => load(page - 1)}><Icon name="chevronL" size={14} /></button><button className="btn sm" disabled={page >= data.pagination.totalPages} onClick={() => load(page + 1)}><Icon name="chevronR" size={14} /></button></div>
          </div>
        )}
      </div>
      )}
    </>
  );
}
