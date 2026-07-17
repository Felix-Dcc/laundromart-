import { useEffect, useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, money, Loading, Empty, initials } from '../components/ui';
import { sa } from '../api/client';

export default function Providers() {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() { setRows(null); const r = await sa.providers(search || undefined); setRows(r.data.providers); }
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function patch(id, body) {
    setBusyId(id);
    try { await sa.patchProvider(id, body); await load(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } finally { setBusyId(null); }
  }

  const pendingCount = (rows || []).filter((p) => !p.approved).length;

  return (
    <>
      <PageHead title="Providers" sub={`Laundromats${pendingCount ? ` · ${pendingCount} pending approval` : ''}`} />
      <div className="toolbar">
        <form className="search" style={{ maxWidth: 320 }} onSubmit={(e) => { e.preventDefault(); load(); }}>
          <Icon name="search" size={15} color="var(--text-3)" />
          <input placeholder="Search business / email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <button className="btn" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>
      </div>

      <div className="card">
        {rows == null ? <Loading /> : rows.length === 0 ? <Empty title="No providers" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Laundromat</th><th>Rating</th><th>Orders</th><th>Earnings</th><th>Status</th><th>Approval</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="row">
                        <div className="avatar" style={{ width: 32, height: 32, fontSize: 12, borderRadius: 9 }}>{initials(p.name)}</div>
                        <div>
                          <div className="row" style={{ gap: 6 }}><span style={{ fontWeight: 700 }}>{p.name}</span>{p.verified && <Icon name="verified" size={15} color="var(--brand)" fill="var(--brand-soft)" />}</div>
                          <div className="muted" style={{ fontSize: 12 }}>{p.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>⭐ {p.rating > 0 ? p.rating.toFixed(1) : '—'} <span className="muted">({p.reviewCount})</span></td>
                    <td className="mono">{p.orders}</td>
                    <td className="mono">{money(p.earnings)}</td>
                    <td><Badge text={p.status === 'active' ? (p.acceptingOrders ? 'Active' : 'Paused') : 'Inactive'} color={p.status === 'active' ? (p.acceptingOrders ? '#10b981' : '#f59e0b') : '#6b7280'} /></td>
                    <td>{p.approved ? <Badge text="Approved" color="#10b981" /> : <Badge text="Pending" color="#f59e0b" />}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        {!p.approved
                          ? <><button className="btn sm ok" disabled={busyId === p.id} onClick={() => patch(p.id, { approved: true })}>Approve</button>
                              <button className="btn sm danger" disabled={busyId === p.id} onClick={() => patch(p.id, { approved: false, status: 'inactive' })}>Reject</button></>
                          : <>
                              <button className="icon-btn" title={p.verified ? 'Unverify' : 'Mark verified'} onClick={() => patch(p.id, { verified: !p.verified })}><Icon name="verified" size={15} color={p.verified ? 'var(--brand)' : 'var(--text-3)'} /></button>
                              <button className="icon-btn" title={p.status === 'active' ? 'Suspend' : 'Activate'} onClick={() => patch(p.id, { status: p.status === 'active' ? 'inactive' : 'active' })}><Icon name={p.status === 'active' ? 'x' : 'check'} size={15} color={p.status === 'active' ? 'var(--warn)' : 'var(--ok)'} /></button>
                            </>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
