import { useEffect, useState, useCallback } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, money, SkeletonTable, Empty } from '../components/ui';
import { sa } from '../api/client';
import { useToast } from '../components/Toast';

const TYPE_LABEL = { per_kg: '/kg', fixed: ' flat', per_item: ' each' };

/**
 * Content moderation. Admins police what providers publish — hide a service or
 * a single image — but never edit prices or service details. Providers own
 * their business; the platform only enforces policy.
 */
export default function Services() {
  const { toast, confirm } = useToast();
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (q = search, hidden = onlyHidden) => {
    setRows(null);
    try {
      const r = await sa.services({ search: q || undefined, hidden: hidden ? 'true' : undefined });
      setRows(r.data.services);
    } catch (e) {
      setRows([]);
      toast.error(e.response?.data?.error || 'Failed to load services');
    }
  }, [search, onlyHidden]); // eslint-disable-line

  useEffect(() => { load(); }, []); // eslint-disable-line

  async function toggleService(s) {
    const hiding = !s.hiddenByAdmin;
    let reason = 'Policy review';
    if (hiding) {
      const ok = await confirm({
        title: `Hide "${s.name}"?`,
        message: `It will stop appearing to customers and cannot be booked. ${s.provider.name} is notified. This does not affect existing orders.`,
        danger: true,
        confirmLabel: 'Hide service',
      });
      if (!ok) return;
    }
    setBusyId(`s${s.id}`);
    try {
      await sa.moderateService(s.id, { hidden: hiding, reason });
      toast.success(hiding ? 'Service hidden' : 'Service restored');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Action failed');
    } finally { setBusyId(null); }
  }

  async function toggleImage(s, img) {
    setBusyId(`i${img.id}`);
    try {
      await sa.moderateImage(s.id, img.id, { hidden: !img.hiddenByAdmin });
      toast.success(img.hiddenByAdmin ? 'Image restored' : 'Image hidden');
      await load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Action failed');
    } finally { setBusyId(null); }
  }

  const hiddenCount = (rows || []).filter((s) => s.hiddenByAdmin).length;

  return (
    <>
      <PageHead
        title="Service Moderation"
        sub={rows == null ? 'Loading…' : `${rows.length} published${hiddenCount ? ` · ${hiddenCount} hidden` : ''}`}
      />

      <div className="toolbar">
        <form className="search" style={{ maxWidth: 340 }} onSubmit={(e) => { e.preventDefault(); load(search, onlyHidden); }}>
          <Icon name="search" size={15} color="var(--text-3)" />
          <input placeholder="Search name, description or category" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <button
          className={`btn ${onlyHidden ? 'primary' : ''}`}
          onClick={() => { const v = !onlyHidden; setOnlyHidden(v); load(search, v); }}
        >
          <Icon name="shield" size={15} /> {onlyHidden ? 'Showing hidden' : 'Hidden only'}
        </button>
        <button className="btn" onClick={() => load(search, onlyHidden)}><Icon name="refresh" size={15} /> Refresh</button>
      </div>

      {rows == null ? <SkeletonTable cols={5} /> : rows.length === 0 ? (
        <div className="card"><Empty title={onlyHidden ? 'Nothing hidden' : 'No services published yet'} /></div>
      ) : (
        <div className="grid" style={{ gap: 14 }}>
          {rows.map((s) => (
            <div key={s.id} className="card" style={{ padding: 16, opacity: s.hiddenByAdmin ? 0.75 : 1 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>{s.name}</span>
                    <Badge text={s.category} color="#6366f1" />
                    {s.hiddenByAdmin
                      ? <Badge text="Hidden" color="#ef4444" />
                      : <Badge text={s.status === 'available' ? 'Live' : s.status.replace(/_/g, ' ')} color={s.status === 'available' ? '#10b981' : '#6b7280'} />}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                    {s.provider.name} · {s.provider.email}
                  </div>
                  {!!s.description && (
                    <div style={{ fontSize: 13, marginTop: 8, maxWidth: 620 }}>{s.description}</div>
                  )}
                  {s.hiddenByAdmin && s.hiddenReason && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 6, color: 'var(--danger)' }}>
                      Reason: {s.hiddenReason}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {/* Read-only: admins never edit a provider's price. */}
                  <div className="mono" style={{ fontWeight: 800 }}>{money(s.price)}{TYPE_LABEL[s.pricingType] || ''}</div>
                  <button
                    className={`btn sm ${s.hiddenByAdmin ? 'ok' : 'danger'}`}
                    style={{ marginTop: 8 }}
                    disabled={busyId === `s${s.id}`}
                    onClick={() => toggleService(s)}
                  >
                    {s.hiddenByAdmin ? 'Restore' : 'Hide'}
                  </button>
                </div>
              </div>

              {s.images.length > 0 && (
                <div className="row" style={{ gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                  {s.images.map((img) => (
                    <div key={img.id} style={{ position: 'relative' }}>
                      <img
                        src={img.thumbnailUrl || img.url}
                        alt=""
                        style={{
                          width: 84, height: 84, objectFit: 'cover', borderRadius: 10,
                          border: '1px solid var(--border)',
                          filter: img.hiddenByAdmin ? 'grayscale(1) brightness(0.6)' : 'none',
                        }}
                      />
                      <button
                        className="btn sm"
                        style={{ position: 'absolute', bottom: 4, left: 4, right: 4, padding: '2px 0', fontSize: 10.5 }}
                        disabled={busyId === `i${img.id}`}
                        onClick={() => toggleImage(s, img)}
                        title={img.hiddenByAdmin ? 'Restore image' : 'Hide image'}
                      >
                        {img.hiddenByAdmin ? 'Restore' : 'Hide'}
                      </button>
                      {img.isCover && !img.hiddenByAdmin && (
                        <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 9.5, fontWeight: 800, background: 'var(--brand)', color: '#fff', borderRadius: 5, padding: '1px 5px' }}>Cover</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
