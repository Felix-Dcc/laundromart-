import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/client';

const AuthCtx = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('admin_user') || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem('admin_token');
    if (!t) { setLoading(false); return; }
    authApi.me()
      .then((r) => { setUser(r.data.user); localStorage.setItem('admin_user', JSON.stringify(r.data.user)); })
      .catch(() => { localStorage.removeItem('admin_token'); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password, twofaToken, recaptchaToken) {
    let r;
    try {
      r = await authApi.login(email, password, twofaToken, recaptchaToken);
    } catch (err) {
      // 2FA gate: signal the login screen to collect a code.
      if (err.response?.status === 401 && err.response.data?.twofaRequired) {
        const e = new Error(err.response.data.errors?.[0] || 'Enter your authenticator code.');
        e.twofaRequired = true; throw e;
      }
      throw err;
    }
    const u = r.data.user;
    if (u.userType !== 'admin' && u.userType !== 'superadmin') {
      const e = new Error('This dashboard is for administrators only.');
      e.forbidden = true; throw e;
    }
    localStorage.setItem('admin_token', r.data.token);
    localStorage.setItem('admin_user', JSON.stringify(u));
    setUser(u);
    return u;
  }
  function logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    setUser(null);
    location.href = '/login';
  }

  const isSuper = user?.userType === 'superadmin';
  return <AuthCtx.Provider value={{ user, loading, login, logout, isSuper }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
