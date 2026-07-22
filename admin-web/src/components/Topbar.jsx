import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { initials } from './ui';
import { api } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

// Live API/DB health indicator — polls the public health endpoint.
function SystemStatus() {
  const [state, setState] = useState('ok');
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await api.get('/health', { timeout: 6000 });
        if (alive) setState(r.data?.db === 'up' ? 'ok' : 'warn');
      } catch { if (alive) setState('down'); }
    };
    check();
    const t = setInterval(check, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const label = state === 'ok' ? 'All systems operational' : state === 'warn' ? 'Degraded' : 'Connection issue';
  return (
    <span className={`sys-status ${state}`} title={label} role="status">
      <span className="d" style={{ background: 'currentColor' }} />
      <span className="sys-label">{label}</span>
    </span>
  );
}

export default function Topbar({ onToggleSidebar, onToggleMobile }) {
  const { theme, toggle } = useTheme();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);

  function submitSearch(e) {
    e.preventDefault();
    const s = q.trim();
    if (!s) return;
    // Global search: numeric → order id, else users search.
    if (/^\d+$/.test(s)) nav(`/orders?focus=${s}`);
    else nav(`/users?q=${encodeURIComponent(s)}`);
  }

  return (
    <header className="topbar">
      <button className="collapse-btn desktop-only" onClick={onToggleSidebar} title="Collapse sidebar"><Icon name="menu" size={18} /></button>
      <button className="collapse-btn mobile-only" onClick={onToggleMobile} title="Menu"><Icon name="menu" size={18} /></button>

      <form className="search" onSubmit={submitSearch}>
        <Icon name="search" size={16} color="var(--text-3)" />
        <input placeholder="Search orders, users, providers…" value={q} onChange={(e) => setQ(e.target.value)} />
        <kbd>⌘K</kbd>
      </form>

      <div className="topbar-right">
        <SystemStatus />
        <button className="icon-btn" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
          <Icon name={theme === 'light' ? 'moon' : 'sun'} size={17} />
        </button>
        <button className="icon-btn bell" onClick={() => nav('/notifications')} title="Notifications">
          <Icon name="bell" size={17} /><span className="dot" />
        </button>
        <div style={{ position: 'relative' }}>
          <button className="avatar" onClick={() => setMenu((m) => !m)} title={user?.email}>{initials(`${user?.firstName} ${user?.lastName}`)}</button>
          {menu && (
            <div className="card" style={{ position: 'absolute', right: 0, top: 44, width: 220, padding: 6, zIndex: 50 }} onMouseLeave={() => setMenu(false)}>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{user?.firstName} {user?.lastName}</div>
                <div className="muted" style={{ fontSize: 12 }}>{user?.email}</div>
                <div style={{ marginTop: 6 }}><span className="badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>{user?.userType === 'superadmin' ? 'Super Admin' : 'Admin'}</span></div>
              </div>
              <button className="nav-item" style={{ color: 'var(--text)', width: '100%' }} onClick={() => { setMenu(false); nav('/profile'); }}><Icon name="profile" size={16} /> Profile</button>
              <button className="nav-item" style={{ color: 'var(--danger)', width: '100%' }} onClick={logout}><Icon name="logout" size={16} /> Logout</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
