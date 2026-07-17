import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, Modal, fmtDate, Loading, Empty, initials } from '../components/ui';
import { adminApi, sa } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Users() {
  const { isSuper } = useAuth();
  const [params] = useSearchParams();
  const [rows, setRows] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState(params.get('q') || '');
  const [edit, setEdit] = useState(null);
  const [tempPw, setTempPw] = useState(null);

  const load = useCallback(async (p = 1) => {
    setRows(null);
    const r = await adminApi.users({ page: p, userType: 'user', search: search || undefined });
    setRows(r.data.users); setPage(p); setPages(r.data.pagination?.totalPages || 1);
  }, [search]);
  useEffect(() => { load(1); }, []); // eslint-disable-line

  async function toggle(u) {
    try { await adminApi.toggleUser(u.id); load(page); } catch (e) { alert(e.response?.data?.error || 'Failed'); }
  }
  async function del(u) {
    if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    try { await sa.deleteUser(u.id); load(page); } catch (e) { alert(e.response?.data?.error || 'Failed'); }
  }
  async function reset(u) {
    if (!window.confirm(`Reset password for ${u.email}?`)) return;
    try { const r = await sa.resetPassword(u.id); setTempPw({ email: u.email, pw: r.data.temporaryPassword }); } catch (e) { alert(e.response?.data?.error || 'Failed'); }
  }

  return (
    <>
      <PageHead title="Users" sub="Customer accounts" />
      <div className="toolbar">
        <form className="search" style={{ maxWidth: 320 }} onSubmit={(e) => { e.preventDefault(); load(1); }}>
          <Icon name="search" size={15} color="var(--text-3)" />
          <input placeholder="Search name / email / phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <button className="btn" onClick={() => load(page)}><Icon name="refresh" size={15} /> Refresh</button>
      </div>

      <div className="card">
        {rows == null ? <Loading /> : rows.length === 0 ? <Empty title="No users found" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>User</th><th>Email</th><th>Phone</th><th>Orders</th><th>Status</th><th>Joined</th><th></th></tr></thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td><div className="row"><div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{initials(`${u.firstName} ${u.lastName}`)}</div><span style={{ fontWeight: 600 }}>{u.firstName} {u.lastName}</span></div></td>
                    <td className="muted">{u.email}</td>
                    <td className="muted">{u.phone}</td>
                    <td className="mono">{u._count?.laundryRequests ?? '—'}</td>
                    <td><Badge text={u.status} color={u.status === 'active' ? '#10b981' : '#6b7280'} /></td>
                    <td className="muted">{fmtDate(u.createdAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                        <button className="icon-btn" title="Edit" onClick={() => setEdit(u)}><Icon name="edit" size={15} /></button>
                        <button className="icon-btn" title={u.status === 'active' ? 'Suspend' : 'Activate'} onClick={() => toggle(u)}><Icon name={u.status === 'active' ? 'x' : 'check'} size={15} color={u.status === 'active' ? 'var(--warn)' : 'var(--ok)'} /></button>
                        {isSuper && <button className="icon-btn" title="Reset password" onClick={() => reset(u)}><Icon name="shield" size={15} /></button>}
                        {isSuper && <button className="icon-btn" title="Delete" onClick={() => del(u)}><Icon name="trash" size={15} color="var(--danger)" /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && pages > 1 && (
          <div className="spread" style={{ padding: 12 }}>
            <span className="muted" style={{ fontSize: 13 }}>Page {page} of {pages}</span>
            <div className="row"><button className="btn sm" disabled={page <= 1} onClick={() => load(page - 1)}><Icon name="chevronL" size={14} /></button><button className="btn sm" disabled={page >= pages} onClick={() => load(page + 1)}><Icon name="chevronR" size={14} /></button></div>
          </div>
        )}
      </div>

      {edit && <EditUser user={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(page); }} />}
      {tempPw && (
        <Modal title="Password Reset" onClose={() => setTempPw(null)} actions={<button className="btn primary" onClick={() => setTempPw(null)}>Done</button>}>
          <div className="muted" style={{ fontSize: 13 }}>Temporary password for <b style={{ color: 'var(--text)' }}>{tempPw.email}</b>. Share it securely — it won't be shown again.</div>
          <div className="mono" style={{ fontSize: 20, fontWeight: 800, background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 10, marginTop: 12, textAlign: 'center', letterSpacing: '1px' }}>{tempPw.pw}</div>
        </Modal>
      )}
    </>
  );
}

function EditUser({ user, onClose, onSaved }) {
  const [f, setF] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone, address: user.address || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try { await sa.patchUser(user.id, f); onSaved(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Edit User" onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Save</button></>}>
      <div className="grid" style={{ gap: 12 }}>
        {['firstName', 'lastName', 'phone', 'address'].map((k) => (
          <div key={k}><label className="muted" style={{ fontSize: 12.5, fontWeight: 600, textTransform: 'capitalize' }}>{k.replace('Name', ' name')}</label>
            <input className="input" style={{ width: '100%', marginTop: 4 }} value={f[k]} onChange={set(k)} /></div>
        ))}
      </div>
    </Modal>
  );
}
