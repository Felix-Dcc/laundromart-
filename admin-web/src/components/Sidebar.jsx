import { NavLink } from 'react-router-dom';
import Icon from './Icon';

// All command-center sections. `phase1` items are fully built; the rest render
// a polished "coming soon" page so navigation is complete from day one.
export const NAV = [
  { group: 'Overview', items: [
    { to: '/', icon: 'dashboard', label: 'Dashboard', end: true },
    { to: '/live-ops', icon: 'map', label: 'Live Operations' },
  ]},
  { group: 'Operations', items: [
    { to: '/orders', icon: 'orders', label: 'Orders' },
    { to: '/users', icon: 'users', label: 'Users' },
    { to: '/providers', icon: 'provider', label: 'Providers' },
    { to: '/riders', icon: 'rider', label: 'Riders' },
    { to: '/admins', icon: 'admins', label: 'Admins' },
  ]},
  { group: 'Finance & Insight', items: [
    { to: '/payments', icon: 'payments', label: 'Payments' },
    { to: '/analytics', icon: 'analytics', label: 'Analytics' },
    { to: '/reports', icon: 'reports', label: 'Reports' },
    { to: '/reviews', icon: 'reviews', label: 'Reviews' },
  ]},
  { group: 'Engagement', items: [
    { to: '/promotions', icon: 'promo', label: 'Promotions' },
    { to: '/notifications', icon: 'bell', label: 'Notifications' },
    { to: '/support', icon: 'support', label: 'Support' },
  ]},
  { group: 'Platform', items: [
    { to: '/settings', icon: 'settings', label: 'Platform Settings' },
    { to: '/audit', icon: 'audit', label: 'Audit Logs' },
    { to: '/security', icon: 'shield', label: 'Security' },
    { to: '/health', icon: 'health', label: 'System Health' },
    { to: '/profile', icon: 'profile', label: 'Profile' },
  ]},
];

export default function Sidebar({ collapsed, mobileOpen, pending }) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-brand">
        <div className="logo"><Icon name="dashboard" size={17} color="#fff" /></div>
        <span className="brand-text">Command Center</span>
      </div>
      <nav className="nav">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="nav-group-label">{g.group}</div>
            {g.items.map((it) => (
              <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={it.label}>
                <span className="ico"><Icon name={it.icon} size={18} /></span>
                <span className="nav-label">{it.label}</span>
                {it.to === '/providers' && pending?.providers > 0 && <span className="badge-dot">{pending.providers}</span>}
                {it.to === '/riders' && pending?.riders > 0 && <span className="badge-dot">{pending.riders}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
