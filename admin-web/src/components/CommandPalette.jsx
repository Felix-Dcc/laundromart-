import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { NAV } from './Sidebar';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';

/**
 * ⌘K / Ctrl-K command palette — jump to any page or run a quick action.
 * Self-contained: owns its open state via a global key listener. Keyboard-first
 * (arrows to move, Enter to run, Esc to close) and fully accessible.
 */
export default function CommandPalette() {
  const nav = useNavigate();
  const { toggle } = useTheme();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Build the command list: every page + a few quick actions.
  const commands = useMemo(() => {
    const pages = NAV.flatMap((g) => g.items.map((it) => ({
      id: it.to, icon: it.icon, label: it.label, hint: g.group, kind: 'Go to',
      run: () => nav(it.to),
    })));
    const actions = [
      { id: 'a-provider', icon: 'provider', label: 'Add Provider', kind: 'Action', run: () => nav('/providers?new=1') },
      { id: 'a-rider', icon: 'rider', label: 'Add Rider', kind: 'Action', run: () => nav('/riders?new=1') },
      { id: 'a-promo', icon: 'promo', label: 'New Promo Code', kind: 'Action', run: () => nav('/promotions?new=1') },
      { id: 'a-broadcast', icon: 'bell', label: 'Send Broadcast', kind: 'Action', run: () => nav('/notifications') },
      { id: 'a-theme', icon: 'moon', label: 'Toggle Theme', kind: 'Action', run: () => toggle() },
      { id: 'a-logout', icon: 'logout', label: 'Log out', kind: 'Action', run: () => logout() },
    ];
    return [...pages, ...actions];
  }, [nav, toggle, logout]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter((c) => (c.label + ' ' + (c.hint || '') + ' ' + c.kind).toLowerCase().includes(s));
  }, [q, commands]);

  const close = useCallback(() => { setOpen(false); setQ(''); setSel(0); }, []);

  // Global ⌘K / Ctrl-K to open; also `/` when nothing is focused.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 20); }, [open]);
  useEffect(() => { setSel(0); }, [q]);

  function onKeyDown(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const c = results[sel]; if (c) { c.run(); close(); } }
  }

  // Keep the selected row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  if (!open) return null;

  return (
    <div className="overlay cmdk-overlay" onClick={close}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <Icon name="search" size={17} color="var(--text-3)" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages and actions…"
            aria-label="Search commands"
            aria-activedescendant={results[sel] ? `cmd-${results[sel].id}` : undefined}
          />
          <kbd>ESC</kbd>
        </div>
        <div className="cmdk-list" role="listbox" ref={listRef}>
          {results.length === 0 ? (
            <div className="cmdk-empty">No matches for “{q}”</div>
          ) : results.map((c, i) => (
            <button
              key={c.id}
              id={`cmd-${c.id}`}
              data-idx={i}
              role="option"
              aria-selected={i === sel}
              className={`cmdk-row ${i === sel ? 'sel' : ''}`}
              onMouseMove={() => setSel(i)}
              onClick={() => { c.run(); close(); }}
            >
              <span className="cmdk-ico"><Icon name={c.icon} size={16} /></span>
              <span className="cmdk-label">{c.label}</span>
              <span className="cmdk-kind">{c.kind}{c.hint ? ` · ${c.hint}` : ''}</span>
            </button>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
