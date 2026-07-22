import { useEffect, useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Skeleton } from '../components/ui';
import { sa } from '../api/client';
import { useToast } from '../components/Toast';

export default function Settings() {
  const { toast } = useToast();
  const [items, setItems] = useState(null);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    sa.settings().then((r) => {
      setItems(r.data.settings);
      setVals(Object.fromEntries(r.data.settings.map((s) => [s.key, s.value])));
    });
  }, []);

  const set = (k, v) => { setVals((p) => ({ ...p, [k]: v })); setSaved(false); };

  async function save() {
    setBusy(true);
    try { await sa.saveSettings(vals); setSaved(true); toast.success('Settings saved'); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } finally { setBusy(false); }
  }

  if (!items) return <div className="grid" style={{ gap: 16 }}><Skeleton h={180} r={14} /><Skeleton h={180} r={14} /></div>;

  const groups = {
    'Fees & Taxes': ['commission_percent', 'delivery_fee', 'service_fee', 'tax_percent'],
    'Localization': ['currency', 'supported_cities', 'business_hours_default'],
    'Operations': ['max_active_rider_tasks', 'push_enabled'],
  };
  const byKey = Object.fromEntries(items.map((i) => [i.key, i]));

  return (
    <>
      <PageHead title="Platform Settings" sub="Global configuration"
        actions={<button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : saved ? <><Icon name="check" size={15} /> Saved</> : 'Save Changes'}</button>} />

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))' }}>
        {Object.entries(groups).map(([title, keys]) => (
          <div key={title} className="card card-pad">
            <div className="card-title" style={{ marginBottom: 14 }}>{title}</div>
            <div className="grid" style={{ gap: 14 }}>
              {keys.map((k) => {
                const it = byKey[k]; if (!it) return null;
                return (
                  <div key={k} className="spread" style={{ gap: 14 }}>
                    <label className="muted" style={{ fontSize: 13.5, fontWeight: 600 }}>{it.label}</label>
                    {it.type === 'bool' ? (
                      <button className="btn sm" style={{ background: vals[k] === 'true' ? 'var(--ok)' : 'var(--surface-2)', color: vals[k] === 'true' ? '#fff' : 'var(--text-2)', borderColor: 'transparent' }} onClick={() => set(k, vals[k] === 'true' ? 'false' : 'true')}>
                        {vals[k] === 'true' ? 'Enabled' : 'Disabled'}
                      </button>
                    ) : (
                      <input className="input" style={{ width: 180, textAlign: 'right' }} type={it.type === 'number' ? 'number' : 'text'} value={vals[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
