import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { StatusBadge, money, Loading } from '../components/ui';
import { sa } from '../api/client';
import { onOrderFeed } from '../lib/socket';

const PICKUP_LEG = ['rider_assigned', 'rider_on_the_way', 'rider_arrived', 'picked_up'];
const DELIVERY_LEG = ['delivery_rider_assigned', 'rider_to_laundromat', 'collected_from_laundromat', 'out_for_delivery', 'rider_arrived_at_customer'];

const icon = (html) => L.divIcon({ className: 'liveops-icon', html, iconSize: [22, 22], iconAnchor: [11, 11] });
const dot = (color) => icon(`<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 3px ${color}44"></div>`);
const square = (color) => icon(`<div style="width:15px;height:15px;border-radius:4px;background:${color};border:2px solid #fff;box-shadow:0 0 0 3px ${color}33"></div>`);
const RIDER_COLOR = { online: '#10b981', busy: '#f59e0b' };

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [50, 50], maxZoom: 14 });
  }, [points.length]); // eslint-disable-line
  return null;
}

export default function LiveOps() {
  const [data, setData] = useState(null);
  const tickRef = useRef(null);

  async function load() { try { const r = await sa.liveOps(); setData(r.data); } catch (e) { /* keep last */ } }
  useEffect(() => {
    load();
    tickRef.current = setInterval(load, 8000); // poll rider positions
    const off = onOrderFeed(() => load());      // instant on any order change
    return () => { clearInterval(tickRef.current); off(); };
  }, []);

  const points = useMemo(() => {
    if (!data) return [];
    const p = [];
    data.riders.forEach((r) => r.latitude != null && p.push([r.latitude, r.longitude]));
    data.laundromats.forEach((l) => l.latitude != null && p.push([l.latitude, l.longitude]));
    return p;
  }, [data]);

  if (!data) return <Loading label="Loading live operations…" />;

  const activePickups = data.orders.filter((o) => PICKUP_LEG.includes(o.status)).length;
  const activeDeliveries = data.orders.filter((o) => DELIVERY_LEG.includes(o.status)).length;
  const center = points[0] || [5.1153, -1.2908];

  return (
    <>
      <PageHead title="Live Operations" sub="Real-time fleet, laundromats & active orders"
        actions={<span className="chip"><span className="d" style={{ width: 8, height: 8, borderRadius: 4, background: '#10b981', display: 'inline-block' }} /> Live</span>} />

      <div className="kpi-grid" style={{ marginBottom: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(180px,1fr))' }}>
        <Mini label="Online Riders" value={data.riders.filter((r) => r.status === 'online').length} tint="#10b981" icon="rider" />
        <Mini label="Busy Riders" value={data.riders.filter((r) => r.status === 'busy').length} tint="#f59e0b" icon="rider" />
        <Mini label="Active Pickups" value={activePickups} tint="#3b82f6" icon="orders" />
        <Mini label="Active Deliveries" value={activeDeliveries} tint="#0ea5e9" icon="map" />
        <Mini label="Laundromats" value={data.laundromats.length} tint="#8b5cf6" icon="provider" />
        <Mini label="Active Orders" value={data.orders.length} tint="#4f46e5" icon="orders" />
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <MapContainer center={center} zoom={12} style={{ height: 560, width: '100%' }} scrollWheelZoom>
          <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <FitBounds points={points} />

          {data.laundromats.filter((l) => l.latitude != null).map((l) => (
            <Marker key={`p${l.id}`} position={[l.latitude, l.longitude]} icon={square('#8b5cf6')}>
              <Popup>
                <b>{l.name}</b><br />{l.address || ''}<br />
                <span style={{ color: l.acceptingOrders ? '#059669' : '#d97706' }}>{l.acceptingOrders ? 'Accepting orders' : 'Paused'}</span>{l.isVerified ? ' · Verified' : ''}
              </Popup>
            </Marker>
          ))}

          {data.riders.filter((r) => r.latitude != null).map((r) => (
            <Marker key={`r${r.id}`} position={[r.latitude, r.longitude]} icon={dot(RIDER_COLOR[r.status] || '#6b7280')}>
              <Popup>
                <b>{r.name}</b> · {r.status}<br />{r.phone || ''}<br />{r.totalPickups} pickups
              </Popup>
            </Marker>
          ))}

          {data.orders.filter((o) => o.pickupLatitude != null && PICKUP_LEG.includes(o.status)).map((o) => (
            <Marker key={`o${o.id}`} position={[o.pickupLatitude, o.pickupLongitude]} icon={dot('#f59e0b')}>
              <Popup>
                <b>{o.requestNumber}</b><br />{o.user?.name}<br />{(o.status || '').replace(/_/g, ' ')}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Active orders list */}
      <div className="card card-pad" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>Active Orders ({data.orders.length})</div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Order</th><th>Customer</th><th>Laundromat</th><th>Rider</th><th>Status</th><th>Amount</th></tr></thead>
            <tbody>
              {data.orders.slice(0, 30).map((o) => (
                <tr key={o.id}>
                  <td style={{ fontWeight: 700 }}>{o.requestNumber}</td>
                  <td>{o.user?.name}</td>
                  <td>{o.provider?.name || '—'}</td>
                  <td>{o.deliveryRider?.name || o.assignedRider?.name || '—'}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="mono">{money(o.amountDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function Mini({ label, value, tint, icon }) {
  return (
    <div className="kpi" style={{ padding: 14 }}>
      <div className="row" style={{ gap: 10 }}>
        <div className="k-ico" style={{ width: 34, height: 34, marginBottom: 0, background: `${tint}22`, color: tint }}><Icon name={icon} size={16} /></div>
        <div><div className="k-value" style={{ fontSize: 22 }}>{value}</div><div className="k-label">{label}</div></div>
      </div>
    </div>
  );
}
