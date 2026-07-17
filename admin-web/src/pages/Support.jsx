import { useEffect, useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, Modal, Drawer, Loading, Empty, fmtDateTime, initials } from '../components/ui';
import { supportApi, adminApi } from '../api/client';

const STATUS = { open: '#0ea5e9', pending: '#f59e0b', resolved: '#10b981', closed: '#6b7280' };
const FILTERS = ['', 'open', 'pending', 'resolved', 'closed'];

export default function Support() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState(null);
  const [create, setCreate] = useState(false);

  async function load() { setRows(null); const r = await supportApi.tickets(status || undefined); setRows(r.data.tickets); }
  useEffect(() => { load(); }, [status]); // eslint-disable-line

  return (
    <>
      <PageHead title="Support" sub="Customer & partner tickets"
        actions={<button className="btn primary" onClick={() => setCreate(true)}><Icon name="support" size={15} /> Log Ticket</button>} />

      <div className="toolbar">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>{FILTERS.map((s) => <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : 'All statuses'}</option>)}</select>
        <button className="btn" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>
      </div>

      <div className="card">
        {rows == null ? <Loading /> : rows.length === 0 ? <Empty title="No tickets" sub="Support tickets appear here as customers raise them." /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Subject</th><th>Customer</th><th>Last message</th><th>Msgs</th><th>Status</th><th>Updated</th></tr></thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="row-click" onClick={() => setOpenId(t.id)}>
                    <td style={{ fontWeight: 600 }}>{t.subject}</td>
                    <td>{t.user}<div className="muted" style={{ fontSize: 11 }}>{t.email}</div></td>
                    <td className="muted" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.lastMessage}</td>
                    <td className="mono">{t.messageCount}</td>
                    <td><Badge text={t.status} color={STATUS[t.status]} /></td>
                    <td className="muted">{fmtDateTime(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openId && <TicketDrawer id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
      {create && <CreateTicket onClose={() => setCreate(false)} onDone={() => { setCreate(false); load(); }} />}
    </>
  );
}

function TicketDrawer({ id, onClose, onChanged }) {
  const [t, setT] = useState(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() { const r = await supportApi.ticket(id); setT(r.data.ticket); }
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try { await supportApi.reply(id, reply.trim()); setReply(''); await load(); onChanged(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } finally { setBusy(false); }
  }
  async function setStatus(s) { try { await supportApi.setStatus(id, s); await load(); onChanged(); } catch (e) { alert('Failed'); } }

  return (
    <Drawer title={t ? t.subject : 'Ticket'} onClose={onClose}
      actions={t && (
        <>
          <select className="input" value={t.status} onChange={(e) => setStatus(e.target.value)}>
            {['open', 'pending', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </>
      )}>
      {!t ? <Loading /> : (
        <div className="grid" style={{ gap: 12 }}>
          <div className="muted" style={{ fontSize: 13 }}>{t.user} · {t.email}</div>
          <div className="grid" style={{ gap: 10, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
            {t.messages.map((m) => (
              <div key={m.id} style={{ alignSelf: m.isStaff ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                <div style={{ background: m.isStaff ? 'var(--brand)' : 'var(--surface-2)', color: m.isStaff ? '#fff' : 'var(--text)', borderRadius: 12, padding: '9px 13px', fontSize: 13.5 }}>{m.body}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 3, textAlign: m.isStaff ? 'right' : 'left' }}>{m.from}{m.isStaff ? ' · staff' : ''} · {fmtDateTime(m.at)}</div>
              </div>
            ))}
          </div>
          <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <textarea className="input" style={{ flex: 1, height: 60, padding: 10, resize: 'vertical' }} placeholder="Type a reply…" value={reply} onChange={(e) => setReply(e.target.value)} />
            <button className="btn primary" disabled={busy || !reply.trim()} onClick={send}>Send</button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function CreateTicket({ onClose, onDone }) {
  const [users, setUsers] = useState([]);
  const [f, setF] = useState({ userId: '', subject: '', message: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { adminApi.users({ page: 1, userType: 'user' }).then((r) => setUsers(r.data.users)); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    if (!f.userId || !f.subject.trim() || !f.message.trim()) { alert('Pick a customer and fill subject + message.'); return; }
    setBusy(true);
    try { await supportApi.create(f); onDone(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } finally { setBusy(false); }
  }
  return (
    <Modal title="Log a Ticket" onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Create</button></>}>
      <div className="grid" style={{ gap: 12 }}>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Customer</label>
          <select className="input" style={{ width: '100%', marginTop: 4 }} value={f.userId} onChange={set('userId')}>
            <option value="">Select a customer…</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} · {u.email}</option>)}
          </select>
        </div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Subject</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.subject} onChange={set('subject')} /></div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Message</label><textarea className="input" style={{ width: '100%', height: 90, padding: 10, marginTop: 4 }} value={f.message} onChange={set('message')} /></div>
      </div>
    </Modal>
  );
}
