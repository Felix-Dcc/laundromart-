import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, Modal, SkeletonTable, Empty, money, fmtDate } from '../components/ui';
import { sa } from '../api/client';
import { useToast } from '../components/Toast';

function promoStatus(p) {
  if (!p.active) return ['Inactive', '#6b7280'];
  if (p.expiresAt && new Date(p.expiresAt) < new Date()) return ['Expired', '#ef4444'];
  if (p.maxUses && p.usedCount >= p.maxUses) return ['Used up', '#f59e0b'];
  return ['Active', '#10b981'];
}

export default function Promotions() {
  const { toast, confirm } = useToast();
  const [rows, setRows] = useState(null);
  const [create, setCreate] = useState(false);

  const [params] = useSearchParams();
  async function load() { setRows(null); const r = await sa.promotions(); setRows(r.data.promotions); }
  useEffect(() => { load(); }, []);
  useEffect(() => { if (params.get('new') === '1') setCreate(true); }, [params]);

  async function toggle(p) { try { await sa.patchPromo(p.id, { active: !p.active }); toast.success(p.active ? 'Promo deactivated' : 'Promo activated'); load(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } }
  async function del(p) { if (!(await confirm({ title: 'Delete promo', message: `Delete code ${p.code}?`, danger: true, confirmLabel: 'Delete' }))) return; try { await sa.deletePromo(p.id); toast.success('Promo deleted'); load(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } }

  const active = (rows || []).filter((p) => promoStatus(p)[0] === 'Active').length;

  return (
    <>
      <PageHead title="Promotions" sub={`Promo codes & discounts · ${active} active`}
        actions={<button className="btn primary" onClick={() => setCreate(true)}><Icon name="promo" size={15} /> New Promo Code</button>} />

      {rows == null ? <SkeletonTable cols={7} /> : (
      <div className="card">
        {rows.length === 0 ? <Empty title="No promotions yet" sub="Create your first promo code to run a campaign." /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Usage</th><th>Window</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const [label, color] = promoStatus(p);
                  return (
                    <tr key={p.id}>
                      <td><span className="mono" style={{ fontWeight: 800, letterSpacing: '.5px' }}>{p.code}</span>{p.description && <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>}</td>
                      <td style={{ fontWeight: 700, color: '#059669' }}>{p.type === 'percent' ? `${p.value}%` : money(p.value)}</td>
                      <td className="mono">{p.minOrder > 0 ? money(p.minOrder) : '—'}</td>
                      <td className="mono">{p.usedCount}{p.maxUses ? ` / ${p.maxUses}` : ''}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{p.startsAt ? fmtDate(p.startsAt) : 'Now'} → {p.expiresAt ? fmtDate(p.expiresAt) : 'No end'}</td>
                      <td><Badge text={label} color={color} /></td>
                      <td>
                        <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn sm" onClick={() => toggle(p)}>{p.active ? 'Deactivate' : 'Activate'}</button>
                          <button className="icon-btn" title="Delete" onClick={() => del(p)}><Icon name="trash" size={15} color="var(--danger)" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      <div className="card card-pad" style={{ marginTop: 16, color: 'var(--text-2)', fontSize: 13 }}>
        <Icon name="promo" size={14} /> Referral campaigns, loyalty rewards and seasonal automations build on this promo engine — coming next.
      </div>

      {create && <CreatePromo onClose={() => setCreate(false)} onDone={() => { setCreate(false); load(); }} />}
    </>
  );
}

function CreatePromo({ onClose, onDone }) {
  const { toast } = useToast();
  const [f, setF] = useState({ code: '', type: 'percent', value: '', minOrder: '', maxUses: '', expiresAt: '', description: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try { await sa.createPromo(f); toast.success('Promo created'); onDone(); } catch (e) { toast.error(e.response?.data?.error || 'Failed'); } finally { setBusy(false); }
  }
  return (
    <Modal title="New Promo Code" onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>Create</button></>}>
      <div className="grid" style={{ gap: 12 }}>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Code</label><input className="input mono" style={{ width: '100%', marginTop: 4, textTransform: 'uppercase' }} value={f.code} onChange={set('code')} placeholder="WELCOME10" /></div>
        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Type</label><select className="input" style={{ width: '100%', marginTop: 4 }} value={f.type} onChange={set('type')}><option value="percent">Percent %</option><option value="fixed">Fixed amount</option></select></div>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Value</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="number" value={f.value} onChange={set('value')} placeholder={f.type === 'percent' ? '10' : '5.00'} /></div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Min order (opt.)</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="number" value={f.minOrder} onChange={set('minOrder')} placeholder="0" /></div>
          <div style={{ flex: 1 }}><label className="muted" style={{ fontSize: 12.5 }}>Max uses (opt.)</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="number" value={f.maxUses} onChange={set('maxUses')} placeholder="∞" /></div>
        </div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Expires (opt.)</label><input className="input" style={{ width: '100%', marginTop: 4 }} type="date" value={f.expiresAt} onChange={set('expiresAt')} /></div>
        <div><label className="muted" style={{ fontSize: 12.5 }}>Description (opt.)</label><input className="input" style={{ width: '100%', marginTop: 4 }} value={f.description} onChange={set('description')} placeholder="10% off first order" /></div>
      </div>
    </Modal>
  );
}
