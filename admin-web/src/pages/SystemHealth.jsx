import { useEffect, useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Loading } from '../components/ui';
import { sa } from '../api/client';

function StatusPill({ ok, label }) {
  const good = ok === true || ok === 'up' || ok === 'configured';
  const color = good ? '#10b981' : ok === 'stub' ? '#f59e0b' : '#ef4444';
  return (
    <div className="card card-pad row" style={{ justifyContent: 'space-between' }}>
      <div className="row" style={{ gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: 5, background: color, boxShadow: `0 0 0 4px ${color}22` }} />
        <span style={{ fontWeight: 600 }}>{label}</span>
      </div>
      <span className="badge" style={{ background: `${color}22`, color }}>{good ? 'Operational' : (typeof ok === 'string' ? ok : 'Down')}</span>
    </div>
  );
}

function Meter({ label, value, max, unit, tint }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="card card-pad">
      <div className="spread"><span className="muted" style={{ fontSize: 13 }}>{label}</span><span className="mono" style={{ fontWeight: 700 }}>{value} {unit}</span></div>
      <div style={{ height: 8, borderRadius: 5, background: 'var(--surface-2)', marginTop: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: tint, borderRadius: 5 }} />
      </div>
    </div>
  );
}

const fmtUptime = (s) => {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return [d && `${d}d`, h && `${h}h`, `${m}m`].filter(Boolean).join(' ');
};

export default function SystemHealth() {
  const [h, setH] = useState(null);
  async function load() { try { const r = await sa.systemHealth(); setH(r.data); } catch (e) {} }
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);
  if (!h) return <Loading label="Checking systems…" />;

  return (
    <>
      <PageHead title="System Health" sub={`Node ${h.node} · ${h.env} · up ${fmtUptime(h.uptimeSeconds)}`}
        actions={<button className="btn" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>} />

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', marginBottom: 18 }}>
        <StatusPill ok={h.api} label="API Server" />
        <StatusPill ok={h.database} label="Database" />
        <StatusPill ok={h.socketio} label="Socket.IO" />
        <StatusPill ok={h.paymentGateway} label="Payment Gateway" />
        <StatusPill ok="up" label="Notification Service" />
        <StatusPill ok="configured" label="Maps (OSM)" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <Meter label="Memory · RSS" value={h.memory.rssMb} max={1024} unit="MB" tint="#4f46e5" />
        <Meter label="Heap Used" value={h.memory.heapUsedMb} max={h.memory.heapTotalMb || 512} unit="MB" tint="#10b981" />
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 10 }}>Runtime</div>
          <Row k="Uptime" v={fmtUptime(h.uptimeSeconds)} />
          <Row k="Environment" v={h.env} />
          <Row k="Node" v={h.node} />
          <Row k="Heap Total" v={`${h.memory.heapTotalMb} MB`} />
          <Row k="Checked" v={new Date(h.timestamp).toLocaleTimeString()} />
        </div>
      </div>
    </>
  );
}

const Row = ({ k, v }) => <div className="spread" style={{ padding: '6px 0', fontSize: 13.5 }}><span className="muted">{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>;
