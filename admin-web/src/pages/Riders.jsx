import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, money, Modal, SkeletonTable, Empty, initials, fmtDateTime, Check, BulkBar } from '../components/ui';
import { sa } from '../api/client';
import { useToast } from '../components/Toast';
import { useBulkSelect } from '../hooks/useBulkSelect';

const RIDER = { online: '#10b981', busy: '#f59e0b', offline: '#6b7280' };

export default function Riders() {
  const { toast, confirm } = useToast();
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [create, setCreate] = useState(false);
  const sel = useBulkSelect((rows || []).map((r) => r.id));

  const [params] = useSearchParams();
  async function load() { setRows(null); const r = await sa.riders(); setRows(r.data.riders); }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.get('new') === '1') setCreate(true); }, [params]);

  async function patch(id, body) {
    setBusyId(id);
    try { await sa.patchRider(id, body); toast.success('Rider updated'); await load(); } catch (e) { toast.error(e.response?.data?.error || 'Update failed'); } finally { setBusyId(null); }
  }

  // Run a PATCH across every selected rider, with one confirm + summary toast.
  async function bulk(body, verb) {
    const ids = sel.ids;
    if (!ids.length) return;
    if (!(await confirm({ title: `${verb} ${ids.length} rider${ids.length > 1 ? 's' : ''}?`, danger: /suspend|reject/i.test(verb), confirmLabel: verb }))) return;
    const res = await Promise.allSettled(ids.map((id) => sa.patchRider(id, body)));
    const ok = res.filter((r) => r.status === 'fulfilled').length;
    const failed = res.length - ok;
    if (ok) toast.success(`${verb} ${ok} rider${ok > 1 ? 's' : ''}`);
    if (failed) toast.error(`${failed} failed`);
    sel.clear(); await load();
  }

  const online = (rows || []).filter((r) => r.riderStatus === 'online' || r.riderStatus === 'busy').length;

  return (
    <>
      <PageHead title="Riders" sub={`Delivery fleet · ${online} online`}
        actions={<><Link className="btn" to="/live-ops"><Icon name="map" size={15} /> Live Map</Link>
          <button className="btn primary" onClick={() => setCreate(true)}><Icon name="rider" size={15} /> Add Rider</button></>} />

      {rows == null ? <SkeletonTable cols={7} /> : (
      <div className="card">
        {rows.length === 0 ? <Empty title="No riders" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th className="check-col"><Check checked={sel.allSelected} indeterminate={sel.someSelected} onChange={sel.toggleAll} label="Select all riders" /></th>
                <th>Rider</th><th>Status</th><th>Pickups</th><th>Earnings</th><th>Last Seen</th><th>Approval</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={sel.has(r.id) ? 'selected' : ''}>
                    <td className="check-col"><Check checked={sel.has(r.id)} onChange={() => sel.toggle(r.id)} label={`Select ${r.name}`} /></td>
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
      )}

      <BulkBar count={sel.count} onClear={sel.clear}>
        <button className="btn sm ok" onClick={() => bulk({ approved: true }, 'Approve')}>Approve</button>
        <button className="btn sm" onClick={() => bulk({ status: 'active' }, 'Activate')}>Activate</button>
        <button className="btn sm danger" onClick={() => bulk({ status: 'inactive' }, 'Suspend')}>Suspend</button>
      </BulkBar>

      {create && <CreateRider onClose={() => setCreate(false)} onDone={() => { setCreate(false); load(); }} />}
    </>
  );
}

function CreateRider({ onClose, onDone }) {
  const { toast } = useToast();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try { await sa.createRider(f); toast.success('Rider created'); onDone(); } catch (e) { toast.error(e.response?.data?.error || 'Failed to create rider'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Add Rider" onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Create</button></>}>
      <div className="grid" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>First name</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.firstName} onChange={set('firstName')} /></div>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Last name</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.lastName} onChange={set('lastName')} /></div>
        </div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Email</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="email" value={f.email} onChange={set('email')} /></div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Phone</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.phone} onChange={set('phone')} /></div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Temporary password</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="text" value={f.password} onChange={set('password')} placeholder="min 6 chars" /></div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}><Icon name="check" size={12} /> The rider is created approved and can sign in immediately, then go online from the rider app.</div>
      </div>
    </Modal>
  );
}
