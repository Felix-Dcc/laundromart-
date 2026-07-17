import { useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { exportCsv, money } from '../components/ui';
import { adminApi, sa } from '../api/client';

const REPORTS = [
  { key: 'orders', title: 'Orders Report', desc: 'All orders with status, amount & parties', icon: 'orders', tint: '#4f46e5',
    fetch: async () => (await adminApi.orders({ page: 1 })).data.requests.map((o) => ({ order: o.requestNumber, status: o.status, customer: o.user?.name, laundromat: o.provider?.name, amount: o.amountDue, payment: o.paymentStatus, created: o.createdAt })) },
  { key: 'users', title: 'Users Report', desc: 'Customer accounts & activity', icon: 'users', tint: '#0ea5e9',
    fetch: async () => (await adminApi.users({ page: 1, userType: 'user' })).data.users.map((u) => ({ name: `${u.firstName} ${u.lastName}`, email: u.email, phone: u.phone, orders: u._count?.laundryRequests, status: u.status, joined: u.createdAt })) },
  { key: 'payments', title: 'Payments Report', desc: 'Transactions, methods & status', icon: 'payments', tint: '#10b981',
    fetch: async () => (await sa.payments({ page: 1 })).data.transactions },
  { key: 'reviews', title: 'Reviews Report', desc: 'Ratings & comments per provider', icon: 'reviews', tint: '#f59e0b',
    fetch: async () => (await sa.reviews()).data.reviews },
  { key: 'providers', title: 'Providers Report', desc: 'Laundromats, earnings & ratings', icon: 'provider', tint: '#8b5cf6',
    fetch: async () => (await sa.providers()).data.providers.map((p) => ({ name: p.name, email: p.email, status: p.status, approved: p.approved, verified: p.verified, rating: p.rating, orders: p.orders, earnings: p.earnings })) },
  { key: 'analytics', title: 'Analytics Summary', desc: 'Popular services & revenue', icon: 'analytics', tint: '#6366f1',
    fetch: async () => (await sa.analytics()).data.popularServices },
];

export default function Reports() {
  const [busy, setBusy] = useState(null);
  async function run(r) {
    setBusy(r.key);
    try {
      const rows = await r.fetch();
      if (!rows?.length) { alert('No data to export for this report.'); return; }
      exportCsv(`${r.key}-report.csv`, rows);
    } catch (e) { alert('Failed to generate report.'); }
    finally { setBusy(null); }
  }

  return (
    <>
      <PageHead title="Reports" sub="Download platform data as CSV (opens in Excel/Sheets)" />
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
        {REPORTS.map((r) => (
          <div key={r.key} className="card card-pad">
            <div className="k-ico" style={{ background: `${r.tint}22`, color: r.tint }}><Icon name={r.icon} size={20} /></div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{r.title}</div>
            <div className="muted" style={{ fontSize: 13, margin: '4px 0 14px' }}>{r.desc}</div>
            <button className="btn" disabled={busy === r.key} onClick={() => run(r)}>
              {busy === r.key ? 'Preparing…' : <><Icon name="download" size={15} /> Export CSV</>}
            </button>
          </div>
        ))}
      </div>
      <div className="card card-pad" style={{ marginTop: 16, color: 'var(--text-2)', fontSize: 13 }}>
        <Icon name="reports" size={14} /> Scheduled email reports and multi-page PDF exports build on these datasets — coming next.
      </div>
    </>
  );
}
