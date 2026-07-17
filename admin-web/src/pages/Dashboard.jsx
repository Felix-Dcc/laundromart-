import { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Link } from 'react-router-dom';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Kpi, money, Loading, fmtDateTime } from '../components/ui';
import { sa, adminApi } from '../api/client';
import { onOrderFeed } from '../lib/socket';

const AXIS = { fontSize: 11, fill: 'var(--text-3)' };
const tip = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text)' };

function ChartCard({ title, sub, children }) {
  return (
    <div className="card card-pad">
      <div className="spread" style={{ marginBottom: 10 }}>
        <div><div className="card-title">{title}</div>{sub && <div className="card-sub">{sub}</div>}</div>
      </div>
      <div style={{ height: 220 }}><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </div>
  );
}

export default function Dashboard() {
  const [ov, setOv] = useState(null);
  const [ts, setTs] = useState(null);
  const [activity, setActivity] = useState([]);

  async function load() {
    const [o, t, a] = await Promise.all([
      sa.overview(), sa.timeseries(14), adminApi.auditLogs({ limit: 8 }).catch(() => ({ data: { logs: [] } })),
    ]);
    setOv(o.data); setTs(t.data); setActivity(a.data.logs || []);
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const off = onOrderFeed(() => sa.overview().then((r) => setOv(r.data)).catch(() => {}));
    return off;
  }, []);

  if (!ov || !ts) return <Loading label="Loading command center…" />;

  return (
    <>
      <PageHead
        title="Dashboard"
        sub="Real-time platform overview"
        actions={<button className="btn" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>}
      />

      {/* KPI grid */}
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Kpi icon="cash" label="Total Revenue" value={money(ov.revenue.total)} tint="#10b981" />
        <Kpi icon="cash" label="Today's Revenue" value={money(ov.revenue.today)} tint="#0ea5e9" />
        <Kpi icon="cash" label="Monthly Revenue" value={money(ov.revenue.month)} tint="#4f46e5" />
        <Kpi icon="orders" label="Active Orders" value={ov.orders.active} tint="#f59e0b" />
        <Kpi icon="check" label="Completed Orders" value={ov.orders.completed} tint="#059669" />
        <Kpi icon="x" label="Cancelled Orders" value={ov.orders.cancelled} tint="#ef4444" />
        <Kpi icon="users" label="Total Users" value={ov.users.total} tint="#6366f1" />
        <Kpi icon="provider" label="Total Providers" value={ov.providers.total} tint="#8b5cf6" />
        <Kpi icon="rider" label="Total Riders" value={ov.riders.total} tint="#0ea5e9" />
        <Kpi icon="rider" label="Active Riders" value={ov.riders.active} tint="#10b981" />
        <Kpi icon="provider" label="Active Providers" value={ov.providers.active} tint="#10b981" />
        <Kpi icon="provider" label="Pending Providers" value={ov.providers.pending} tint="#f59e0b" />
        <Kpi icon="rider" label="Pending Riders" value={ov.riders.pending} tint="#f59e0b" />
        <Kpi icon="users" label="New Users Today" value={ov.users.newToday} tint="#0ea5e9" />
        <Kpi icon="analytics" label="Platform Growth" value={`${ov.growth}%`} tint={ov.growth >= 0 ? '#10b981' : '#ef4444'} delta={ov.growth} />
      </div>

      {/* Charts */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginBottom: 18 }}>
        <ChartCard title="Revenue" sub="Last 14 days">
          <AreaChart data={ts.series}>
            <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={AXIS} /><YAxis tick={AXIS} width={40} />
            <Tooltip contentStyle={tip} formatter={(v) => money(v)} />
            <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#rev)" />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Orders" sub="Placed per day">
          <BarChart data={ts.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="day" tick={AXIS} /><YAxis tick={AXIS} width={30} allowDecimals={false} />
            <Tooltip contentStyle={tip} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="orders" fill="#4f46e5" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ChartCard>

        <ChartCard title="Growth" sub="New users, providers & riders">
          <LineChart data={ts.series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={AXIS} /><YAxis tick={AXIS} width={30} allowDecimals={false} />
            <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="users" stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="providers" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="riders" stroke="#0ea5e9" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>

        <ChartCard title="Peak Order Hours" sub="All-time by hour of day">
          <BarChart data={ts.peakHours}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="hour" tick={{ ...AXIS, fontSize: 9 }} interval={2} /><YAxis tick={AXIS} width={30} allowDecimals={false} />
            <Tooltip contentStyle={tip} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="orders" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      {/* Quick actions + recent activity */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr' }}>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 12 }}>Quick Actions</div>
          <div className="grid" style={{ gap: 10 }}>
            <Link className="btn" to="/live-ops"><Icon name="map" size={16} /> Live Operations</Link>
            <Link className="btn" to="/orders"><Icon name="orders" size={16} /> Manage Orders</Link>
            <Link className="btn" to="/providers"><Icon name="provider" size={16} /> Review Providers {ov.providers.pending > 0 ? `(${ov.providers.pending})` : ''}</Link>
            <Link className="btn" to="/riders"><Icon name="rider" size={16} /> Review Riders {ov.riders.pending > 0 ? `(${ov.riders.pending})` : ''}</Link>
          </div>
        </div>

        <div className="card card-pad">
          <div className="spread" style={{ marginBottom: 12 }}>
            <div className="card-title">Recent Activity</div>
            <Link className="btn sm ghost" to="/audit">View all</Link>
          </div>
          {activity.length === 0 ? <div className="muted" style={{ fontSize: 13 }}>No recent activity.</div> : activity.map((l) => (
            <div key={l.id} className="row" style={{ padding: '9px 0', borderBottom: '1px solid var(--border)', gap: 10 }}>
              <div className="k-ico" style={{ width: 32, height: 32, background: 'var(--brand-soft)', color: 'var(--brand)', marginBottom: 0 }}><Icon name="audit" size={15} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{l.description}</div>
                <div className="muted" style={{ fontSize: 11.5 }}>{l.user ? `${l.user.firstName} ${l.user.lastName}` : 'System'} · {fmtDateTime(l.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
