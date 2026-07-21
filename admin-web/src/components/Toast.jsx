import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import Icon from './Icon';

/**
 * App-wide notifications + confirmation dialogs.
 *
 *   const { toast, confirm } = useToast();
 *   toast.success('Saved');            toast.error('Failed');   toast.info('…')
 *   if (await confirm({ title, message, danger })) { … }
 *
 * Replaces native alert()/confirm() with accessible, on-brand UI:
 * toasts are aria-live announced; the confirm dialog traps focus and closes on
 * Escape. Promise-based confirm keeps call sites as simple as the old API.
 */

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

let idSeq = 0;
const ICONS = { success: 'check', error: 'x', info: 'bell', warn: 'shield' };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const [dialog, setDialog] = useState(null); // { title, message, danger, confirmLabel, resolve }

  const remove = useCallback((id) => setItems((l) => l.filter((t) => t.id !== id)), []);

  const push = useCallback((type, message, opts = {}) => {
    const id = ++idSeq;
    setItems((l) => [...l, { id, type, message }]);
    setTimeout(() => remove(id), opts.duration ?? 4200);
    return id;
  }, [remove]);

  const toast = useRef({
    success: (m, o) => push('success', m, o),
    error: (m, o) => push('error', m, o),
    info: (m, o) => push('info', m, o),
    warn: (m, o) => push('warn', m, o),
    show: (m, o) => push(o?.type || 'info', m, o),
  }).current;

  const confirm = useCallback((opts) => new Promise((resolve) => {
    setDialog({ confirmLabel: 'Confirm', ...opts, resolve });
  }), []);

  const closeDialog = useCallback((result) => {
    setDialog((d) => { d?.resolve(result); return null; });
  }, []);

  return (
    <ToastCtx.Provider value={{ toast, confirm }}>
      {children}
      <Toaster items={items} onDismiss={remove} />
      {dialog && <ConfirmDialog {...dialog} onClose={closeDialog} />}
    </ToastCtx.Provider>
  );
}

function Toaster({ items, onDismiss }) {
  return (
    <div className="toaster" role="region" aria-label="Notifications">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} role="status" aria-live="polite">
          <span className="toast-ico"><Icon name={ICONS[t.type] || 'bell'} size={15} /></span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-x" aria-label="Dismiss" onClick={() => onDismiss(t.id)}><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  );
}

function ConfirmDialog({ title, message, danger, confirmLabel, onClose }) {
  const okRef = useRef(null);
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose(false);
      if (e.key === 'Enter') onClose(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" style={{ justifyContent: 'center', alignItems: 'center' }} onClick={() => onClose(false)}>
      <div className="modal" style={{ width: 'min(420px, 92%)' }} role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '22px 22px 8px' }}>
          <div className={`confirm-ico ${danger ? 'danger' : ''}`}><Icon name={danger ? 'trash' : 'shield'} size={20} /></div>
          <div style={{ fontWeight: 800, fontSize: 17, marginTop: 12 }}>{title}</div>
          {message && <div className="muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{message}</div>}
        </div>
        <div style={{ padding: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => onClose(false)}>Cancel</button>
          <button ref={okRef} className={`btn ${danger ? 'danger' : 'primary'}`} onClick={() => onClose(true)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
