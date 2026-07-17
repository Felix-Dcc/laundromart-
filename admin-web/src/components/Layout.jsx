import { useEffect, useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import Sidebar, { NAV } from './Sidebar';
import Topbar from './Topbar';
import Icon from './Icon';
import ErrorBoundary from './ErrorBoundary';
import { sa } from '../api/client';

const LABELS = Object.fromEntries(NAV.flatMap((g) => g.items).map((i) => [i.to, i.label]));

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('admin_collapsed') === '1');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, setPending] = useState({ providers: 0, riders: 0 });
  const loc = useLocation();

  useEffect(() => { localStorage.setItem('admin_collapsed', collapsed ? '1' : '0'); }, [collapsed]);
  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

  // Keyboard: ⌘/Ctrl-K focuses search; \ toggles the sidebar.
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.querySelector('.search input')?.focus(); }
      if (e.key === '\\' && !/input|textarea/i.test(e.target.tagName)) setCollapsed((c) => !c);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Pending-approval counts for the sidebar badges (light poll).
  useEffect(() => {
    let alive = true;
    const load = () => sa.overview().then((r) => { if (alive) setPending({ providers: r.data.providers.pending, riders: r.data.riders.pending }); }).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const label = LABELS[loc.pathname] || (loc.pathname === '/' ? 'Dashboard' : loc.pathname.slice(1));

  return (
    <div className="shell">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} pending={pending} />
      <div className="main">
        <Topbar onToggleSidebar={() => setCollapsed((c) => !c)} onToggleMobile={() => setMobileOpen((m) => !m)} />
        <div className="content">
          <div className="crumbs">
            <Link to="/">Home</Link>
            {loc.pathname !== '/' && <><Icon name="chevronR" size={13} className="sep" /> <span style={{ color: 'var(--text)' }}>{label}</span></>}
          </div>
          <ErrorBoundary routeKey={loc.pathname}><Outlet /></ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
