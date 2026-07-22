import { useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, initials } from '../components/ui';
import { sa } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

export default function Profile() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [f, setF] = useState({ firstName: user.firstName, lastName: user.lastName, phone: user.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setP = (k) => (e) => setPw({ ...pw, [k]: e.target.value });

  async function saveProfile() {
    setBusy(true); setMsg(null);
    try { const r = await sa.updateProfile(f); localStorage.setItem('admin_user', JSON.stringify(r.data.user)); setMsg({ ok: 'Profile updated.' }); }
    catch (e) { setMsg({ err: e.response?.data?.error || 'Failed' }); } finally { setBusy(false); }
  }
  async function changePw() {
    setBusy(true); setMsg(null);
    try {
      const r = await sa.changePassword(pw);
      toast.success((r.data.message || 'Password changed') + ' Signing you out…');
      setTimeout(logout, 1200);
    } catch (e) { setMsg({ err: e.response?.data?.error || 'Failed' }); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="Profile" sub="Your administrator account" />
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="row" style={{ gap: 14, marginBottom: 18 }}>
            <div className="avatar" style={{ width: 54, height: 54, fontSize: 20 }}>{initials(`${user.firstName} ${user.lastName}`)}</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{user.firstName} {user.lastName}</div>
              <div className="muted" style={{ fontSize: 13 }}>{user.email}</div>
              <div style={{ marginTop: 5 }}><Badge text={user.userType === 'superadmin' ? 'Super Admin' : 'Admin'} color={user.userType === 'superadmin' ? '#4f46e5' : '#0ea5e9'} /></div>
            </div>
          </div>
          <div className="grid" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 10 }}>
              <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>First name</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.firstName} onChange={set('firstName')} /></div>
              <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Last name</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.lastName} onChange={set('lastName')} /></div>
            </div>
            <div><label className="muted" style={{ fontSize: 12.5 }}>Phone</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.phone} onChange={set('phone')} /></div>
            <button className="btn primary" disabled={busy} onClick={saveProfile} style={{ alignSelf: 'flex-start' }}>Save Profile</button>
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 14 }}>Change Password</div>
          <div className="grid" style={{ gap: 12 }}>
            <div><label className="muted" style={{ fontSize: 12.5 }}>Current password</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="password" value={pw.currentPassword} onChange={setP('currentPassword')} /></div>
            <div><label className="muted" style={{ fontSize: 12.5 }}>New password</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="password" value={pw.newPassword} onChange={setP('newPassword')} placeholder="min 6 chars" /></div>
            <button className="btn" disabled={busy || !pw.currentPassword || pw.newPassword.length < 6} onClick={changePw} style={{ alignSelf: 'flex-start' }}><Icon name="shield" size={15} /> Update Password</button>
            <div className="muted" style={{ fontSize: 12 }}>Changing your password signs out all other sessions.</div>
          </div>
        </div>
      </div>
      {msg && <div className="card card-pad" style={{ marginTop: 16, color: msg.ok ? 'var(--ok)' : 'var(--danger)', fontSize: 14 }}>{msg.ok ? '✓ ' : ''}{msg.ok || msg.err}</div>}
    </>
  );
}
