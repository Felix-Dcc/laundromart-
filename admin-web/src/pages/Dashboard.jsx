import { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Link } from 'react-router-dom';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Kpi, money, SkeletonKpis, Skeleton, fmtDateTime } from '../components/ui';
import { sa, adminApi } from '../api/client';
import { onOrderFeed } from '../lib/socket';

const AXIS = { fontSize: 11, fill: 'var(--text-3)' };
const tip = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text)' };
const RANGES = [{ label: '7D', days: 7 }, { label: '30D', days: 30 }, { label: '90D', days: 90 }, { label: '1Y', days: 365 }];
const fmtMins = (m) => (m == null ? '—' : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

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
  const [range, setRange] = useState(30);

  async function load(days = range) {
    const [o, t, a] = await Promise.all([
      sa.overview(), sa.timeseries(days), adminApi.auditLogs({ limit: 8 }).catch(() => ({ data: { logs: [] } })),
    ]);
    setOv(o.data); setTs(t.data); setActivity(a.data.logs || []);
  }
  useEffect(() => { load(range); }, [range]);
  useEffect(() => {
    const off = onOrderFeed(() => sa.overview().then((r) => setOv(r.data)).catch(() => {}));
    return off;
  }, []);

  if (!ov) return (
    <>
      <PageHead title="Dashboard" sub="Real-time platform overview" />
      <SkeletonKpis count={12} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginTop: 18 }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={264} r={14} />)}
      </div>
    </>
  );

  const rangeLabel = RANGES.find((r) => r.days === range)?.label || `${range}D`;
  return (
    <>
      <PageHead
        title="Dashboard"
        sub="Real-time platform overview"
        actions={<>
          <div className="seg" role="group" aria-label="Chart time range">
            {RANGES.map((r) => (
              <button key={r.days} className={`seg-btn ${range === r.days ? 'active' : ''}`} aria-pressed={range === r.days} onClick={() => setRange(r.days)}>{r.label}</button>
            ))}
          </div>
          <button className="btn" onClick={() => load()}><Icon name="refresh" size={15} /> Refresh</button>
        </>}
      />

      {/* KPI grid — full executive metric set */}
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Kpi icon="cash" label="Total Revenue" value={money(ov.revenue.total)} tint="#10b981" />
        <Kpi icon="cash" label="Today's Revenue" value={money(ov.revenue.today)} tint="#0ea5e9" />
        <Kpi icon="cash" label="Monthly Revenue" value={money(ov.revenue.month)} tint="#4f46e5" />
        <Kpi icon="orders" label="Today's Orders" value={ov.orders.today ?? '—'} tint="#6366f1" />
        <Kpi icon="orders" label="Active Orders" value={ov.orders.active} tint="#f59e0b" />
        <Kpi icon="check" label="Completed Orders" value={ov.orders.completed} tint="#059669" />
        <Kpi icon="x" label="Cancelled Orders" value={ov.orders.cancelled} tint="#ef4444" />
        <Kpi icon="users" label="Total Users" value={ov.users.total} tint="#6366f1" />
        <Kpi icon="users" label="New Users Today" value={ov.users.newToday} tint="#0ea5e9" />
        <Kpi icon="provider" label="Total Providers" value={ov.providers.total} tint="#8b5cf6" />
        <Kpi icon="verified" label="Verified Providers" value={ov.providers.verified ?? '—'} tint="#10b981" />
        <Kpi icon="rider" label="Total Riders" value={ov.riders.total} tint="#0ea5e9" />
        <Kpi icon="rider" label="Online Riders" value={ov.riders.online ?? ov.riders.active} tint="#10b981" />
        <Kpi icon="rider" label="Busy Riders" value={ov.riders.busy ?? '—'} tint="#f59e0b" />
        <Kpi icon="shield" label="Pending Approvals" value={(ov.providers.pending || 0) + (ov.riders.pending || 0)} tint="#f59e0b" />
        <Kpi icon="clock" label="Avg Delivery Time" value={fmtMins(ov.quality?.avgDeliveryMins)} tint="#0ea5e9" />
        <Kpi icon="reviews" label="Avg Rating" value={ov.quality?.avgRating != null ? `${ov.quality.avgRating}★` : '—'} tint="#f59e0b" />
        <Kpi icon="analytics" label="Platform Growth" value={`${ov.growth}%`} tint={ov.growth >= 0 ? '#10b981' : '#ef4444'} delta={ov.growth} />
      </div>

      {/* Charts */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginBottom: 18 }}>
        <ChartCard title="Revenue" sub={`Last ${rangeLabel}`}>
          <AreaChart data={ts.series}>
            <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.35} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="day" tick={AXIS} /><YAxis tick={AXIS} width={40} />
            <Tooltip contentStyle={tip} formatter={(v) => money(v)} />
            <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} fill="url(#rev)" />
          </AreaChart>
        </ChartCard>

        <ChartCard title="Orders" sub={`Placed per day · last ${rangeLabel}`}>
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

        <ChartCard title="Order Outcomes" sub={`Completion ${ov.orders.completionRate ?? 0}% · cancellation ${ov.orders.cancellationRate ?? 0}%`}>
          <PieChart>
            <Pie data={[
              { name: 'Completed', value: ov.orders.completed, c: '#10b981' },
              { name: 'Active', value: ov.orders.active, c: '#f59e0b' },
              { name: 'Cancelled', value: ov.orders.cancelled, c: '#ef4444' },
            ].filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={2}>
              {['#10b981', '#f59e0b', '#ef4444'].map((c) => <Cell key={c} fill={c} stroke="var(--surface)" strokeWidth={2} />)}
            </Pie>
            <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
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
