import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { useAuth } from '../context/AuthContext';
import { getRecaptchaToken, preloadRecaptcha, recaptchaEnabled } from '../lib/recaptcha';

const HIGHLIGHTS = [
  { icon: 'analytics', text: 'Real-time revenue, orders & growth analytics' },
  { icon: 'map', text: 'Live operations — riders, pickups & deliveries' },
  { icon: 'shield', text: 'Role-based access, 2FA & full audit logging' },
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [twofa, setTwofa] = useState('');
  const [needs2fa, setNeeds2fa] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { preloadRecaptcha(); }, []);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const recaptchaToken = await getRecaptchaToken('admin_login');
      await login(email.trim(), password, needs2fa ? twofa : undefined, recaptchaToken);
      nav('/');
    } catch (e) {
      if (e.twofaRequired) { setNeeds2fa(true); setErr(needs2fa ? 'Invalid code — try again.' : ''); }
      else setErr(e.forbidden ? e.message : (e.response?.data?.errors?.[0] || 'Invalid email or password.'));
    } finally { setBusy(false); }
  }

  return (
    <div className="auth-split">
      {/* Brand panel */}
      <div className="auth-brand">
        <div className="auth-brand-inner">
          <div className="auth-logo">
            <div className="logo" style={{ width: 44, height: 44, borderRadius: 13, background: 'rgba(255,255,255,.16)', display: 'grid', placeItems: 'center' }}>
              <Icon name="dashboard" size={22} color="#fff" />
            </div>
            <span>LaundroMart</span>
          </div>
          <h1 className="auth-headline">The command center for your entire platform.</h1>
          <p className="auth-tagline">Manage orders, providers, riders, payments and live operations from one place.</p>
          <ul className="auth-highlights">
            {HIGHLIGHTS.map((h) => (
              <li key={h.text}><span className="auth-hl-ico"><Icon name={h.icon} size={16} color="#fff" /></span>{h.text}</li>
            ))}
          </ul>
        </div>
        <div className="auth-brand-foot">© {new Date().getFullYear()} LaundroMart · Admin</div>
      </div>

      {/* Form panel */}
      <div className="auth-form-wrap">
        <div className="auth-card">
          <div className="auth-form-head">
            <h2>Welcome back</h2>
            <p className="muted">Sign in to the administration console.</p>
          </div>

          <form onSubmit={submit} className="grid" style={{ gap: 14 }}>
            <div className="field">
              <label>Email address</label>
              <div className="field-input">
                <Icon name="users" size={16} color="var(--text-3)" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@laundromart.com" autoFocus required autoComplete="username" disabled={needs2fa} />
              </div>
            </div>

            <div className="field">
              <label>Password</label>
              <div className="field-input">
                <Icon name="shield" size={16} color="var(--text-3)" />
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" disabled={needs2fa} />
                <button type="button" className="field-eye" onClick={() => setShowPw((s) => !s)} aria-label={showPw ? 'Hide password' : 'Show password'} tabIndex={-1}>
                  <Icon name={showPw ? 'sun' : 'moon'} size={15} />
                </button>
              </div>
            </div>

            {needs2fa && (
              <div className="field">
                <label>Authenticator code</label>
                <div className="field-input">
                  <Icon name="shield" size={16} color="var(--brand)" />
                  <input className="mono" style={{ letterSpacing: 6, textAlign: 'center' }} value={twofa} onChange={(e) => setTwofa(e.target.value.replace(/\D/g, ''))} placeholder="000000" maxLength={6} autoFocus inputMode="numeric" />
                </div>
              </div>
            )}

            {err && <div className="auth-err" role="alert"><Icon name="x" size={14} /> {err}</div>}

            <button className="btn primary" style={{ justifyContent: 'center', height: 46, fontSize: 15, marginTop: 2 }} disabled={busy || (needs2fa && twofa.length !== 6)}>
              {busy ? <span className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,.4)' }} /> : needs2fa ? 'Verify & sign in' : 'Sign in'}
            </button>
          </form>

          <div className="auth-foot">
            <span><Icon name="shield" size={12} /> Super Admin & Admin access only</span>
            {recaptchaEnabled && <span className="auth-recaptcha">Protected by reCAPTCHA</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
