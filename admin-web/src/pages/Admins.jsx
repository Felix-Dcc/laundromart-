import { useEffect, useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, Modal, SkeletonTable, Empty, initials, fmtDate } from '../components/ui';
import { sa } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function Admins() {
  const { isSuper, user } = useAuth();
  const { toast, confirm } = useToast();
  const [rows, setRows] = useState(null);
  const [create, setCreate] = useState(false);

  async function load() { setRows(null); const r = await sa.admins(); setRows(r.data.admins); }
  useEffect(() => { load(); }, []);

  async function patch(a, body, confirmMsg) {
    if (confirmMsg && !(await confirm({ title: 'Change role', message: confirmMsg }))) return;
    try { await sa.patchAdmin(a.id, body); toast.success('Admin updated'); load(); } catch (e) { toast.error(e.response?.data?.error || 'Update failed'); }
  }
  async function del(a) {
    if (!(await confirm({ title: 'Delete admin', message: `Delete ${a.email}? This cannot be undone.`, danger: true, confirmLabel: 'Delete' }))) return;
    try { await sa.deleteAdmin(a.id); toast.success('Admin deleted'); load(); } catch (e) { toast.error(e.response?.data?.error || 'Delete failed'); }
  }

  return (
    <>
      <PageHead title="Admins" sub="Platform administrators & permissions"
        actions={isSuper && <button className="btn primary" onClick={() => setCreate(true)}><Icon name="admins" size={15} /> Add Admin</button>} />

      {!isSuper && <div className="card card-pad" style={{ marginBottom: 14, color: 'var(--text-2)', fontSize: 13 }}><Icon name="shield" size={14} /> Only super admins can create or modify administrators.</div>}

      {rows == null ? <SkeletonTable cols={6} /> : (
      <div className="card">
        {rows.length === 0 ? <Empty title="No admins" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Admin</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td><div className="row"><div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{initials(`${a.firstName} ${a.lastName}`)}</div><span style={{ fontWeight: 600 }}>{a.firstName} {a.lastName}{a.id === user.id ? ' (you)' : ''}</span></div></td>
                    <td className="muted">{a.email}</td>
                    <td><Badge text={a.userType === 'superadmin' ? 'Super Admin' : 'Admin'} color={a.userType === 'superadmin' ? '#4f46e5' : '#0ea5e9'} /></td>
                    <td><Badge text={a.status} color={a.status === 'active' ? '#10b981' : '#6b7280'} /></td>
                    <td className="muted">{fmtDate(a.createdAt)}</td>
                    <td>
                      {isSuper && a.id !== user.id && (
                        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <button className="icon-btn" title={a.status === 'active' ? 'Suspend' : 'Activate'} onClick={() => patch(a, { status: a.status === 'active' ? 'inactive' : 'active' })}><Icon name={a.status === 'active' ? 'x' : 'check'} size={15} color={a.status === 'active' ? 'var(--warn)' : 'var(--ok)'} /></button>
                          <button className="icon-btn" title={a.userType === 'superadmin' ? 'Demote to Admin' : 'Promote to Super Admin'} onClick={() => patch(a, { role: a.userType === 'superadmin' ? 'admin' : 'superadmin' }, `Change ${a.email} role?`)}><Icon name="shield" size={15} /></button>
                          <button className="icon-btn" title="Delete" onClick={() => del(a)}><Icon name="trash" size={15} color="var(--danger)" /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {create && <CreateAdmin onClose={() => setCreate(false)} onDone={() => { setCreate(false); load(); }} />}
    </>
  );
}

function CreateAdmin({ onClose, onDone }) {
  const { toast } = useToast();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', role: 'admin' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try { await sa.createAdmin(f); toast.success('Admin created'); onDone(); } catch (e) { toast.error(e.response?.data?.error || 'Failed to create admin'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Add Admin" onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Create</button></>}>
      <div className="grid" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>First name</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.firstName} onChange={set('firstName')} /></div>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Last name</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.lastName} onChange={set('lastName')} /></div>
        </div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Email</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="email" value={f.email} onChange={set('email')} /></div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Phone</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.phone} onChange={set('phone')} /></div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Temporary password</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="text" value={f.password} onChange={set('password')} placeholder="min 6 chars" /></div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Role</label><select className="input" style={{ width: '100%', marginTop: 4 }} value={f.role} onChange={set('role')}><option value="admin">Admin</option><option value="superadmin">Super Admin</option></select></div>
      </div>
    </Modal>
  );
}
