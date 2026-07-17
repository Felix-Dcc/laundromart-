import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, money, Loading, Empty, initials, fmtDateTime } from '../components/ui';
import { sa } from '../api/client';

const RIDER = { online: '#10b981', busy: '#f59e0b', offline: '#6b7280' };

export default function Riders() {
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() { setRows(null); const r = await sa.riders(); setRows(r.data.riders); }
  useEffect(() => { load(); }, []);

  async function patch(id, body) {
    setBusyId(id);
    try { await sa.patchRider(id, body); await load(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } finally { setBusyId(null); }
  }

  const online = (rows || []).filter((r) => r.riderStatus === 'online' || r.riderStatus === 'busy').length;

  return (
    <>
      <PageHead title="Riders" sub={`Delivery fleet · ${online} online`}
        actions={<Link className="btn" to="/live-ops"><Icon name="map" size={15} /> Live Map</Link>} />

      <div className="card">
        {rows == null ? <Loading /> : rows.length === 0 ? <Empty title="No riders" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Rider</th><th>Status</th><th>Pickups</th><th>Earnings</th><th>Last Seen</th><th>Approval</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><div className="row"><div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{initials(r.name)}</div><div><div style={{ fontWeight: 600 }}>{r.name}</div><div className="muted" style={{ fontSize: 12 }}>{r.phone}</div></div></div></td>
                    <td><Badge text={r.riderStatus || 'offline'} color={RIDER[r.riderStatus] || '#6b7280'} /></td>
                    <td className="mono">{r.totalPickups}</td>
                    <td className="mono">{money(r.totalEarnings)}</td>
                    <td className="muted">{r.lastUpdate ? fmtDateTime(r.lastUpdate) : '—'}</td>
                    <td>{r.approved ? <Badge text="Approved" color="#10b981" /> : <Badge text="Pending" color="#f59e0b" />}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        {!r.approved
                          ? <><button className="btn sm ok" disabled={busyId === r.id} onClick={() => patch(r.id, { approved: true })}>Approve</button>
                              <button className="btn sm danger" disabled={busyId === r.id} onClick={() => patch(r.id, { approved: false, status: 'inactive' })}>Reject</button></>
                          : <button className="icon-btn" title={r.status === 'active' ? 'Suspend' : 'Activate'} onClick={() => patch(r.id, { status: r.status === 'active' ? 'inactive' : 'active' })}><Icon name={r.status === 'active' ? 'x' : 'check'} size={15} color={r.status === 'active' ? 'var(--warn)' : 'var(--ok)'} /></button>}
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
