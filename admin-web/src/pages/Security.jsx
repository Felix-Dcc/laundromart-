import { useEffect, useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Kpi, Badge, Loading, Empty, fmtDateTime } from '../components/ui';
import { sa } from '../api/client';

export default function Security() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(null);

  async function load() { const r = await sa.security(); setD(r.data); }
  useEffect(() => { load(); }, []);

  async function revoke(s) {
    if (!window.confirm(`Force-logout ${s.user}? Their session will end immediately.`)) return;
    setBusy(s.id);
    try { await sa.revokeSession(s.id); await load(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } finally { setBusy(null); }
  }

  if (!d) return <Loading label="Loading security…" />;

  return (
    <>
      <PageHead title="Security" sub="Access, sessions & login integrity"
        actions={<button className="btn" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>} />

      <div className="kpi-grid" style={{ marginBottom: 18, gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>
        <Kpi icon="check" label="Successful Logins Today" value={d.successToday} tint="#10b981" />
        <Kpi icon="shield" label="Failed Attempts (24h)" value={d.failed24h} tint={d.failed24h > 0 ? '#ef4444' : '#6b7280'} />
        <Kpi icon="users" label="Active Admin Sessions" value={d.sessions.length} tint="#4f46e5" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr', alignItems: 'start' }}>
        {/* Login history */}
        <div className="card">
          <div className="card-pad" style={{ borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Login History</div>
          {d.loginHistory.length === 0 ? <Empty title="No login records" /> : (
            <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
              <table className="tbl">
                <thead><tr><th>Result</th><th>Email</th><th>IP</th><th>Device</th><th>When</th></tr></thead>
                <tbody>
                  {d.loginHistory.map((h) => (
                    <tr key={h.id}>
                      <td><Badge text={h.success ? 'Success' : 'Failed'} color={h.success ? '#10b981' : '#ef4444'} /></td>
                      <td className="muted">{h.email}</td>
                      <td className="mono muted" style={{ fontSize: 12 }}>{h.ip || '—'}</td>
                      <td className="muted" style={{ fontSize: 11, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={h.device}>{h.device ? h.device.split(' ')[0] : '—'}</td>
                      <td className="muted">{fmtDateTime(h.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sessions + 2FA */}
        <div className="grid" style={{ gap: 16 }}>
          <div className="card">
            <div className="card-pad" style={{ borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Active Admin Sessions</div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {d.sessions.map((s) => (
                <div key={s.id} className="spread" style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.user} <Badge text={s.role === 'superadmin' ? 'Super' : 'Admin'} color={s.role === 'superadmin' ? '#4f46e5' : '#0ea5e9'} /></div>
                    <div className="muted" style={{ fontSize: 11.5 }}>Since {fmtDateTime(s.createdAt)}</div>
                  </div>
                  <button className="btn sm danger" disabled={busy === s.id} onClick={() => revoke(s)}><Icon name="logout" size={13} /> Force logout</button>
                </div>
              ))}
            </div>
          </div>

          <TwoFactor />
        </div>
      </div>
    </>
  );
}

function TwoFactor() {
  const [enabled, setEnabled] = useState(null);
  const [setup, setSetup] = useState(null); // { qr, secret }
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { sa.twofaStatus().then((r) => setEnabled(r.data.enabled)).catch(() => setEnabled(false)); }, []);

  async function start() { setBusy(true); setMsg(null); try { const r = await sa.twofaSetup(); setSetup(r.data); } catch (e) { setMsg({ err: 'Failed to start setup.' }); } finally { setBusy(false); } }
  async function enable() {
    setBusy(true); setMsg(null);
    try { await sa.twofaEnable(code); setEnabled(true); setSetup(null); setCode(''); setMsg({ ok: '2FA enabled.' }); }
    catch (e) { setMsg({ err: e.response?.data?.error || 'Failed' }); } finally { setBusy(false); }
  }
  async function disable() {
    const t = prompt('Enter a current authenticator code to disable 2FA:');
    if (t == null) return;
    setBusy(true); setMsg(null);
    try { await sa.twofaDisable(t); setEnabled(false); setMsg({ ok: '2FA disabled.' }); }
    catch (e) { setMsg({ err: e.response?.data?.error || 'Failed' }); } finally { setBusy(false); }
  }

  return (
    <div className="card card-pad">
      <div className="spread" style={{ marginBottom: 10 }}>
        <div className="card-title">Two-Factor Authentication</div>
        <Badge text={enabled == null ? '…' : enabled ? 'Enabled' : 'Not enabled'} color={enabled ? '#10b981' : '#f59e0b'} />
      </div>

      {enabled ? (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Your account is protected with an authenticator app. You'll be asked for a code at every login.</div>
          <button className="btn danger" disabled={busy} onClick={disable}>Disable 2FA</button>
        </>
      ) : setup ? (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Scan this QR in Google Authenticator / Authy, then enter the 6-digit code to confirm.</div>
          <img src={setup.qr} alt="2FA QR" style={{ width: 168, height: 168, borderRadius: 10, background: '#fff', padding: 6, display: 'block' }} />
          <div className="mono muted" style={{ fontSize: 11, margin: '8px 0' }}>Secret: {setup.secret}</div>
          <div className="row" style={{ gap: 8 }}>
            <input className="input mono" style={{ width: 120, letterSpacing: 3 }} placeholder="000000" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <button className="btn primary" disabled={busy || code.length !== 6} onClick={enable}>Verify & Enable</button>
          </div>
        </>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Add a second layer of protection with a TOTP authenticator app.</div>
          <button className="btn" disabled={busy} onClick={start}><Icon name="shield" size={15} /> Set up 2FA</button>
        </>
      )}
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.ok ? 'var(--ok)' : 'var(--danger)' }}>{msg.ok ? '✓ ' : ''}{msg.ok || msg.err}</div>}
    </div>
  );
}
