import { useEffect, useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, money, Modal, SkeletonTable, Empty, initials } from '../components/ui';
import { sa } from '../api/client';
import { useToast } from '../components/Toast';

export default function Providers() {
  const { toast } = useToast();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [create, setCreate] = useState(false);

  async function load() { setRows(null); const r = await sa.providers(search || undefined); setRows(r.data.providers); }
  useEffect(() => { load(); }, []); // eslint-disable-line

  async function patch(id, body) {
    setBusyId(id);
    try { await sa.patchProvider(id, body); toast.success('Provider updated'); await load(); } catch (e) { toast.error(e.response?.data?.error || 'Update failed'); } finally { setBusyId(null); }
  }

  const pendingCount = (rows || []).filter((p) => !p.approved).length;

  return (
    <>
      <PageHead title="Providers" sub={`Laundromats${pendingCount ? ` · ${pendingCount} pending approval` : ''}`}
        actions={<button className="btn primary" onClick={() => setCreate(true)}><Icon name="provider" size={15} /> Add Provider</button>} />
      <div className="toolbar">
        <form className="search" style={{ maxWidth: 320 }} onSubmit={(e) => { e.preventDefault(); load(); }}>
          <Icon name="search" size={15} color="var(--text-3)" />
          <input placeholder="Search business / email" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <button className="btn" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>
      </div>

      {rows == null ? <SkeletonTable cols={7} /> : (
      <div className="card">
        {rows.length === 0 ? <Empty title="No providers" /> : (
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
      )}

      {create && <CreateProvider onClose={() => setCreate(false)} onDone={() => { setCreate(false); load(); }} />}
    </>
  );
}

function CreateProvider({ onClose, onDone }) {
  const { toast } = useToast();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', businessName: '', businessHours: '7:00 AM – 9:00 PM', latitude: '', longitude: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try { await sa.createProvider(f); toast.success('Provider created'); onDone(); } catch (e) { toast.error(e.response?.data?.error || 'Failed to create provider'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Add Provider" onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Create</button></>}>
      <div className="grid" style={{ gap: 12 }}>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Business name</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.businessName} onChange={set('businessName')} placeholder="e.g. Cape Clean Laundry" /></div>
        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Owner first name</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.firstName} onChange={set('firstName')} /></div>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Owner last name</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.lastName} onChange={set('lastName')} /></div>
        </div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Email</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="email" value={f.email} onChange={set('email')} /></div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Phone</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.phone} onChange={set('phone')} /></div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Temporary password</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="text" value={f.password} onChange={set('password')} placeholder="min 6 chars" /></div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Business hours</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.businessHours} onChange={set('businessHours')} placeholder="7:00 AM – 9:00 PM" /></div>
        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Latitude</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.latitude} onChange={set('latitude')} placeholder="5.1121" /></div>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Longitude</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.longitude} onChange={set('longitude')} placeholder="-1.2860" /></div>
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}><Icon name="check" size={12} /> Created approved, verified and open. Add latitude &amp; longitude so it appears in customer search — without them the laundromat won't be discoverable.</div>
      </div>
    </Modal>
  );
}
