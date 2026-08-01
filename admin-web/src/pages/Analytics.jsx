import { useEffect, useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Kpi, money, SkeletonKpis, Skeleton, exportCsv, RangePicker } from '../components/ui';
import { STATUS } from '../components/ui';
import { sa } from '../api/client';

const AXIS = { fontSize: 11, fill: 'var(--text-3)' };
const tip = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text)' };
const PIE = ['#4f46e5', '#10b981', '#f59e0b', '#0ea5e9', '#8b5cf6', '#ef4444', '#6366f1', '#059669'];
const PAY = { MOMO: '#10b981', CARD: '#4f46e5', UNKNOWN: '#94a3b8' };

export default function Analytics() {
  const [a, setA] = useState(null);
  // {} = all time · { days } = preset · { from, to } = custom range
  const [range, setRange] = useState({ days: 30 });
  useEffect(() => {
    let cancelled = false;
    setA(null);
    sa.analytics(range).then((r) => { if (!cancelled) setA(r.data); }).catch(() => { if (!cancelled) setA(null); });
    return () => { cancelled = true; };
  }, [range.days, range.from, range.to]); // eslint-disable-line
  // Keep the picker mounted while loading, or it would disappear on every
  // range change and the control would feel like it jumps.
  if (!a) return (
    <>
      <PageHead title="Analytics" sub="Platform performance & trends"
        actions={<RangePicker value={range} onChange={setRange} />} />
      <SkeletonKpis count={6} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', marginTop: 18 }}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={300} r={14} />)}
      </div>
    </>
  );

  const statusData = a.ordersByStatus.map((s) => ({ name: (STATUS[s.status]?.[0] || s.status), value: s.count }));

  return (
    <>
      <PageHead title="Analytics" sub={`Platform performance & trends · ${a.range || 'all time'}`}
        actions={<>
          <RangePicker value={range} onChange={setRange} />
          <button className="btn" onClick={() => exportCsv('services.csv', a.popularServices)}><Icon name="download" size={15} /> Services CSV</button>
          <button className="btn" onClick={() => window.print()}><Icon name="reports" size={15} /> Print / PDF</button>
        </>} />

      <div className="kpi-grid" style={{ marginBottom: 18, gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))' }}>
        <Kpi icon="cash" label="Total Revenue" value={money(a.revenue)} tint="#10b981" />
        <Kpi icon="orders" label="Total Orders" value={a.totalOrders} tint="#4f46e5" />
        <Kpi icon="analytics" label="Avg Order Value" value={money(a.avgOrderValue)} tint="#0ea5e9" />
        <Kpi icon="x" label="Cancellation Rate" value={`${a.cancellationRate}%`} tint="#ef4444" />
        <Kpi icon="users" label="Repeat Customers" value={a.repeatCustomers} tint="#8b5cf6" />
        <Kpi icon="check" label="Paid Transactions" value={a.paidCount} tint="#059669" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))' }}>
        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 10 }}>Orders by Status</div>
          <div style={{ height: 260 }}><ResponsiveContainer>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                {statusData.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
              </Pie>
              <Tooltip contentStyle={tip} /><Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer></div>
        </div>

        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 10 }}>Most Popular Services</div>
          <div style={{ height: 260 }}><ResponsiveContainer>
            <BarChart data={a.popularServices} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={AXIS} allowDecimals={false} /><YAxis type="category" dataKey="service" tick={{ ...AXIS, fontSize: 11 }} width={110} />
              <Tooltip contentStyle={tip} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="orders" fill="#4f46e5" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </div>

        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 10 }}>Top Laundromats</div>
          <div style={{ height: 260 }}><ResponsiveContainer>
            <BarChart data={a.popularLaundromats}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="name" tick={{ ...AXIS, fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={60} /><YAxis tick={AXIS} allowDecimals={false} />
              <Tooltip contentStyle={tip} cursor={{ fill: 'var(--surface-2)' }} />
              <Bar dataKey="orders" fill="#8b5cf6" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </div>

        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 10 }}>Payment Methods</div>
          <div style={{ height: 260 }}>
            {(a.paymentMethods?.length) ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={a.paymentMethods} dataKey="count" nameKey="method" cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2}>
                    {a.paymentMethods.map((m) => <Cell key={m.method} fill={PAY[m.method] || '#6366f1'} />)}
                  </Pie>
                  <Tooltip contentStyle={tip} formatter={(v, n, p) => [`${v} txns · ${money(p.payload.revenue)}`, p.payload.method]} /><Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart label="No payments yet" />}
          </div>
        </div>

        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 10 }}>Rider Performance</div>
          <div style={{ height: 260 }}><ResponsiveContainer>
            <BarChart data={a.riderPerformance || []} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" tick={AXIS} allowDecimals={false} /><YAxis type="category" dataKey="name" tick={{ ...AXIS, fontSize: 11 }} width={110} />
              <Tooltip contentStyle={tip} cursor={{ fill: 'var(--surface-2)' }} formatter={(v, n, p) => [`${v} pickups · ${money(p.payload.earnings)}`, 'Rider']} />
              <Bar dataKey="pickups" fill="#0ea5e9" radius={[0, 5, 5, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </div>

        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 10 }}>Customer Acquisition</div>
          <div className="card-sub" style={{ marginBottom: 8 }}>New customers per week · last 12 weeks</div>
          <div style={{ height: 232 }}><ResponsiveContainer>
            <AreaChart data={a.acquisition || []}>
              <defs><linearGradient id="acq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.35} /><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="week" tick={AXIS} /><YAxis tick={AXIS} width={30} allowDecimals={false} />
              <Tooltip contentStyle={tip} />
              <Area type="monotone" dataKey="customers" stroke="#8b5cf6" strokeWidth={2} fill="url(#acq)" />
            </AreaChart>
          </ResponsiveContainer></div>
        </div>

        <div className="card card-pad">
          <div className="card-title" style={{ marginBottom: 10 }}>Service Revenue</div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Service</th><th>Orders</th><th>Revenue</th></tr></thead>
              <tbody>{a.popularServices.map((s) => (
                <tr key={s.service}><td style={{ fontWeight: 600 }}>{s.service}</td><td className="mono">{s.orders}</td><td className="mono">{money(s.revenue)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyChart({ label }) {
  return <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-3)', fontSize: 13 }}>{label}</div>;
}
