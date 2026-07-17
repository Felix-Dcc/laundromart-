import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twofa, setTwofa] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await login(email.trim(), password, needs2fa ? twofa : undefined); nav('/'); }
    catch (e) {
      if (e.twofaRequired) { setNeeds2fa(true); setErr(needs2fa ? 'Invalid code — try again.' : ''); }
      else setErr(e.forbidden ? e.message : (e.response?.data?.errors?.[0] || 'Invalid email or password.'));
    }
    finally { setBusy(false); }
  }

  return (
    <div className="center-screen" style={{ background: 'radial-gradient(1200px 600px at 20% -10%, rgba(79,70,229,.18), transparent), var(--bg)' }}>
      <div className="card" style={{ width: 400, maxWidth: '100%', padding: 30 }}>
        <div className="row" style={{ marginBottom: 18 }}>
          <div className="logo" style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,var(--brand),var(--brand-2))', display: 'grid', placeItems: 'center' }}>
            <Icon name="dashboard" size={22} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Command Center</div>
            <div className="muted" style={{ fontSize: 13 }}>Laundromat platform administration</div>
          </div>
        </div>

        <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
          <div>
            <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Email</label>
            <input className="input" style={{ width: '100%', marginTop: 5 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@lms.com" autoFocus required />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Password</label>
            <input className="input" style={{ width: '100%', marginTop: 5 }} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required disabled={needs2fa} />
          </div>
          {needs2fa && (
            <div>
              <label className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Authenticator Code</label>
              <input className="input mono" style={{ width: '100%', marginTop: 5, letterSpacing: 4, textAlign: 'center' }} value={twofa} onChange={(e) => setTwofa(e.target.value.replace(/\D/g, ''))} placeholder="000000" maxLength={6} autoFocus />
            </div>
          )}
          {err && <div style={{ color: 'var(--danger)', fontSize: 13, background: 'rgba(239,68,68,.1)', padding: '8px 12px', borderRadius: 9 }}>{err}</div>}
          <button className="btn primary" style={{ justifyContent: 'center', height: 44 }} disabled={busy || (needs2fa && twofa.length !== 6)}>
            {busy ? <span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.4)' }} /> : needs2fa ? 'Verify & Sign in' : 'Sign in'}
          </button>
        </form>
        <div className="muted" style={{ fontSize: 12, marginTop: 14, textAlign: 'center' }}>Super Admin & Admin access only</div>
      </div>
    </div>
  );
}
