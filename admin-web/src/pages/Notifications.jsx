import { useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { sa } from '../api/client';

const AUDIENCES = [
  { key: 'all', label: 'Everyone', icon: 'users', tint: '#4f46e5' },
  { key: 'user', label: 'Customers', icon: 'users', tint: '#0ea5e9' },
  { key: 'provider', label: 'Providers', icon: 'provider', tint: '#8b5cf6' },
  { key: 'rider', label: 'Riders', icon: 'rider', tint: '#10b981' },
  { key: 'admin', label: 'Admins', icon: 'admins', tint: '#f59e0b' },
];

export default function Notifications() {
  const [audience, setAudience] = useState('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function send() {
    if (!title.trim() || !message.trim()) { setResult({ err: 'Title and message are required.' }); return; }
    if (!window.confirm(`Send this broadcast to "${AUDIENCES.find((a) => a.key === audience).label}"?`)) return;
    setBusy(true); setResult(null);
    try {
      const r = await sa.broadcast({ audience, title: title.trim(), message: message.trim() });
      setResult({ ok: r.data.message }); setTitle(''); setMessage('');
    } catch (e) { setResult({ err: e.response?.data?.error || 'Failed to send.' }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="Notifications" sub="Broadcast announcements to the platform" />
      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 12 }}>Compose Broadcast</div>

          <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Audience</label>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', margin: '8px 0 16px' }}>
            {AUDIENCES.map((a) => (
              <button key={a.key} className="btn" style={{ borderColor: audience === a.key ? a.tint : 'var(--border)', background: audience === a.key ? `${a.tint}18` : 'var(--surface)', color: audience === a.key ? a.tint : 'var(--text)' }} onClick={() => setAudience(a.key)}>
                <Icon name={a.icon} size={15} /> {a.label}
              </button>
            ))}
          </div>

          <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Title</label>
          <input className="input" style={{ width: '100%', margin: '5px 0 14px' }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scheduled maintenance tonight" maxLength={80} />

          <label className="muted" style={{ fontSize: 12.5, fontWeight: 600 }}>Message</label>
          <textarea className="input" style={{ width: '100%', height: 120, padding: 12, margin: '5px 0 14px', resize: 'vertical' }} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your announcement…" maxLength={500} />

          {result?.err && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{result.err}</div>}
          {result?.ok && <div style={{ color: 'var(--ok)', fontSize: 13, marginBottom: 10 }}>✓ {result.ok}</div>}

          <button className="btn primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : <><Icon name="bell" size={15} /> Send Broadcast</>}</button>
        </div>

        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 10 }}>Preview</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 14, background: 'var(--surface-2)' }}>
            <div className="row" style={{ gap: 10 }}>
              <div className="k-ico" style={{ width: 36, height: 36, marginBottom: 0, background: 'var(--brand-soft)', color: 'var(--brand)' }}><Icon name="bell" size={17} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{title || 'Notification title'}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{message || 'Your message preview will appear here.'}</div>
              </div>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>Delivered as an in-app notification to every active recipient. Push is also sent on devices with a registered token.</div>
        </div>
      </div>
    </>
  );
}
