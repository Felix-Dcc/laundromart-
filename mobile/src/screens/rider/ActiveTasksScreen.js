import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking, Platform, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { riderAPI } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { getLatestRiderLocation } from '../../services/riderTracking';
import { fetchRoute } from '../../utils/directions';
import { formatTime } from '../../utils/helpers';
import EmptyState from '../../components/EmptyState';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';

const STATUS = {
  rider_assigned:   { label: 'Assigned',    color: '#3b82f6', bg: '#dbeafe' },
  rider_on_the_way: { label: 'On The Way',  color: '#3b82f6', bg: '#dbeafe' },
  rider_arrived:    { label: 'Arrived',     color: '#f59e0b', bg: '#fef3c7' },
  picked_up:        { label: 'Picked Up',   color: '#8b5cf6', bg: '#ede9fe' },
};

// In-memory cache of the last good route — shown if the network drops while the
// rider is on the move (offline support).
let lastGoodRoute = null;

// Numbered pickup marker (memoized — only re-renders when its inputs change).
const StopMarker = memo(function StopMarker({ coordinate, index, title, description, recommended }) {
  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} title={title} description={description} tracksViewChanges={false}>
      <View style={[styles.numMarker, recommended && styles.numMarkerRec]}>
        <Text style={styles.numMarkerText}>{index}</Text>
      </View>
    </Marker>
  );
}, (p, n) => p.index === n.index && p.recommended === n.recommended &&
  p.coordinate.latitude === n.coordinate.latitude && p.coordinate.longitude === n.coordinate.longitude);

export default function ActiveTasksScreen({ navigation }) {
  const { user } = useAuth();
  const [data, setData] = useState(lastGoodRoute || { tasks: [], optimizedOrder: [], totalDistanceKm: 0, estDurationMin: 0 });
  const [routeGeo, setRouteGeo] = useState(null);
  const [loading, setLoading] = useState(!lastGoodRoute);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [working, setWorking] = useState(null);
  const lastOrderKey = useRef('');

  const load = useCallback(async () => {
    try {
      const res = await riderAPI.getTasks();
      const next = res.data;
      lastGoodRoute = next;
      setData(next);
      setOffline(false);

      // Recompute the drawn route only when the stop sequence actually changes.
      const riderLoc = next.riderLocation || getLatestRiderLocation();
      const orderedPickups = next.optimizedOrder
        .map((id) => next.tasks.find((t) => t.id === id))
        .filter((t) => t && t.pickupLatitude != null && t.pickupLongitude != null)
        .map((t) => ({ latitude: t.pickupLatitude, longitude: t.pickupLongitude }));
      const key = JSON.stringify(next.optimizedOrder) + (riderLoc ? `${riderLoc.latitude.toFixed(4)},${riderLoc.longitude.toFixed(4)}` : '');
      if (riderLoc && orderedPickups.length && key !== lastOrderKey.current) {
        lastOrderKey.current = key;
        const geo = await fetchRoute(riderLoc, orderedPickups);
        setRouteGeo(geo);
      }
    } catch (e) {
      // Offline / transient — keep showing the cached route.
      if (lastGoodRoute) { setData(lastGoodRoute); setOffline(true); }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload on focus + light poll so the route auto-recalculates as tasks change.
  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]));

  const { tasks, optimizedOrder, totalDistanceKm, estDurationMin, recommendedNextId, maxActiveTasks } = data;
  const riderLoc = data.riderLocation || getLatestRiderLocation();
  const orderedTasks = optimizedOrder.map((id) => tasks.find((t) => t.id === id)).filter(Boolean);

  // Prefer the (traffic-aware) Directions totals when available.
  const distanceLabel = routeGeo && !routeGeo.fallback ? routeGeo.distanceText : `${totalDistanceKm} km`;
  const durationLabel = routeGeo && !routeGeo.fallback ? routeGeo.durationText : `${estDurationMin} min`;

  const initialRegion = riderLoc
    ? { latitude: riderLoc.latitude, longitude: riderLoc.longitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }
    : orderedTasks[0]?.pickupLatitude
      ? { latitude: orderedTasks[0].pickupLatitude, longitude: orderedTasks[0].pickupLongitude, latitudeDelta: 0.06, longitudeDelta: 0.06 }
      : null;

  const routeCoords = routeGeo?.coordinates?.length
    ? routeGeo.coordinates
    : [
        ...(riderLoc ? [{ latitude: riderLoc.latitude, longitude: riderLoc.longitude }] : []),
        ...orderedTasks.filter((t) => t.pickupLatitude != null).map((t) => ({ latitude: t.pickupLatitude, longitude: t.pickupLongitude })),
      ];

  async function runAction(task, fn) {
    setWorking(task.id);
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not update status.');
    } finally {
      setWorking(null);
    }
  }

  if (loading) return (
    <View style={styles.container}>
      <View style={{ padding: 16 }}>
        <Skeleton width="100%" height={200} radius={12} />
        <SkeletonCard style={{ marginHorizontal: 0 }} />
        <SkeletonCard style={{ marginHorizontal: 0 }} />
      </View>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {offline && (
        <View style={styles.offlineBar}>
          <Ionicons name="cloud-offline-outline" size={15} color="#92400e" />
          <Text style={styles.offlineText}>Offline — showing your last route. Syncing when back online…</Text>
        </View>
      )}

      {/* Summary header */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>Today's Route</Text>
            <Text style={styles.headerRider}>{user?.firstName} {user?.lastName}</Text>
          </View>
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeNum}>{tasks.length}</Text>
            <Text style={styles.activeBadgeLabel}>active</Text>
          </View>
        </View>
        <View style={styles.summaryRow}>
          <Summary icon="navigate-outline" value={distanceLabel} label="Distance" />
          <View style={styles.summaryDivider} />
          <Summary icon="time-outline" value={durationLabel} label="Est. Duration" />
          <View style={styles.summaryDivider} />
          <Summary icon="bicycle-outline" value={`${tasks.length}/${maxActiveTasks || 3}`} label="Pickups" />
        </View>
      </View>

      {tasks.length === 0 ? (
        <EmptyState
          icon="bicycle-outline"
          title="No stops on your route"
          subtitle="Accept pickups from the Dashboard to build today's route."
          tint="#3b82f6"
          actionLabel="Go to Dashboard"
          onAction={() => navigation.navigate('Dashboard')}
        />
      ) : (
        <>
          {/* Map */}
          {initialRegion && (
            <View style={styles.mapWrap}>
              <MapView style={styles.map} provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined} initialRegion={initialRegion} showsUserLocation>
                {riderLoc && (
                  <Marker coordinate={{ latitude: riderLoc.latitude, longitude: riderLoc.longitude }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
                    <View style={styles.riderMarker}><Ionicons name="bicycle" size={16} color="#fff" /></View>
                  </Marker>
                )}
                {orderedTasks.filter((t) => t.pickupLatitude != null).map((t, i) => (
                  <StopMarker
                    key={`p${t.id}`}
                    coordinate={{ latitude: t.pickupLatitude, longitude: t.pickupLongitude }}
                    index={i + 1}
                    title={`${i + 1}. ${t.customer?.name || 'Pickup'}`}
                    description={t.pickupAddress}
                    recommended={t.id === recommendedNextId}
                  />
                ))}
                {orderedTasks.filter((t) => t.provider?.latitude != null).map((t) => (
                  <Marker key={`l${t.id}`} coordinate={{ latitude: t.provider.latitude, longitude: t.provider.longitude }} pinColor="#f97316" title={t.provider.name} tracksViewChanges={false} />
                ))}
                {routeCoords.length > 1 && <Polyline coordinates={routeCoords} strokeColor="#3b82f6" strokeWidth={4} />}
              </MapView>
              <View style={styles.legend}>
                <Legend color="#3b82f6" label="Rider" />
                <Legend color="#22c55e" label="Pickup" />
                <Legend color="#f97316" label="Laundromat" />
              </View>
            </View>
          )}

          {/* Recommended next */}
          {recommendedNextId && (() => {
            const rec = orderedTasks.find((t) => t.id === recommendedNextId);
            if (!rec) return null;
            return (
              <View style={styles.recBanner}>
                <Ionicons name="star" size={16} color="#b45309" />
                <Text style={styles.recText}>
                  Recommended next: <Text style={{ fontWeight: '800' }}>{rec.customer?.name}</Text>
                  {rec.distanceKm != null ? ` · ${rec.distanceKm} km` : ''}
                </Text>
              </View>
            );
          })()}

          {/* Stops */}
          {orderedTasks.map((t, i) => (
            <StopCard
              key={t.id}
              task={t}
              index={i + 1}
              recommended={t.id === recommendedNextId}
              expanded={expandedId === t.id}
              working={working === t.id}
              onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
              onNavigate={() => navigation.navigate('RiderNavigation', { orderId: t.id })}
              onDetails={() => navigation.navigate('TaskDetails', { orderId: t.id })}
              onOnTheWay={() => runAction(t, () => riderAPI.markOnTheWay(t.id))}
              onArrived={() => runAction(t, () => riderAPI.markArrived(t.id))}
              onPickedUp={() => runAction(t, () => riderAPI.markPickedUp(t.id))}
              onDelivered={() => runAction(t, () => riderAPI.markAtLaundromat(t.id, t.provider?.latitude, t.provider?.longitude))}
            />
          ))}
        </>
      )}
      <View style={{ height: 28 }} />
    </ScrollView>
  );
}

function StopCard({ task, index, recommended, expanded, working, onToggle, onNavigate, onDetails, onOnTheWay, onArrived, onPickedUp, onDelivered }) {
  const s = STATUS[task.status] || { label: task.status, color: '#6b7280', bg: '#f3f4f6' };
  return (
    <View style={[styles.card, recommended && styles.cardRec]}>
      {recommended && (
        <View style={styles.recTag}><Ionicons name="star" size={11} color="#fff" /><Text style={styles.recTagText}>NEXT</Text></View>
      )}
      <TouchableOpacity style={styles.cardHeader} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.seqBadge}><Text style={styles.seqText}>{index}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stopLabel}>STOP {index}</Text>
          <Text style={styles.customer}>👤 {task.customer?.name || 'Customer'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}><Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text></View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#9ca3af" style={{ marginLeft: 6 }} />
      </TouchableOpacity>

      <Row icon="location-outline" text={task.pickupAddress} />
      {!!task.provider?.name && <Row icon="storefront-outline" text={`Destination: ${task.provider.name}`} color="#2563eb" />}
      <View style={styles.metaRow}>
        {task.distanceKm != null && <Chip icon="navigate-outline" text={`${task.distanceKm} km`} color="#3b82f6" />}
        {task.etaMin != null && <Chip icon="time-outline" text={`~${task.etaMin} min`} color="#8b5cf6" />}
      </View>

      {expanded && (
        <View style={styles.expanded}>
          <Detail label="Order #" value={task.requestNumber} />
          {!!task.customer?.phone && <Detail label="Phone" value={task.customer.phone} />}
          <Detail label="Service" value={`${task.laundryType} · ${task.weightKg} kg`} />
          {!!task.pickupTime && <Detail label="Pickup time" value={formatTime(task.pickupTime)} />}
          {!!task.notes && <Detail label="Notes" value={task.notes} />}
          {!!task.provider?.address && <Detail label="Laundromat" value={task.provider.address} />}
        </View>
      )}

      {/* Primary actions */}
      <View style={styles.actions}>
        <ActionBtn icon="navigate" label="Navigate" color="#3b82f6" onPress={onNavigate} />
        <ActionBtn icon="call" label="Call" color="#10b981" onPress={() => task.customer?.phone && Linking.openURL(`tel:${task.customer.phone}`)} />
        <ActionBtn icon="information-circle-outline" label="Details" color="#6b7280" onPress={onDetails} />
      </View>

      {/* Status actions — follow the pickup-leg order */}
      <View style={styles.statusActions}>
        <StatusBtn label="On My Way" enabled={task.status === 'rider_assigned'} working={working} onPress={onOnTheWay} />
        <StatusBtn label="Arrived" enabled={task.status === 'rider_on_the_way'} working={working} onPress={onArrived} />
        <StatusBtn label="Picked Up" enabled={task.status === 'rider_arrived'} working={working} onPress={onPickedUp} />
        <StatusBtn label="At Laundromat" enabled={task.status === 'picked_up'} working={working} onPress={onDelivered} />
      </View>
    </View>
  );
}

function Summary({ icon, value, label }) {
  return (
    <View style={styles.summaryItem}>
      <Ionicons name={icon} size={18} color="#1B7BF7" />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}
function Row({ icon, text, color = '#6b7280' }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.rowText, color !== '#6b7280' && { color, fontWeight: '700' }]} numberOfLines={2}>{text}</Text>
    </View>
  );
}
function Chip({ icon, text, color }) {
  return <View style={styles.chip}><Ionicons name={icon} size={13} color={color} /><Text style={styles.chipText}>{text}</Text></View>;
}
function Detail({ label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}
function ActionBtn({ icon, label, color, onPress }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={18} color={color} /><Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}
function StatusBtn({ label, enabled, working, onPress }) {
  return (
    <TouchableOpacity style={[styles.statusBtn, !enabled && styles.statusBtnDisabled]} onPress={onPress} disabled={!enabled || !!working} activeOpacity={0.85}>
      {working && enabled ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.statusBtnText, !enabled && styles.statusBtnTextDisabled]}>{label}</Text>}
    </TouchableOpacity>
  );
}
function Legend({ color, label }) {
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },

  offlineBar: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef3c7', paddingVertical: 8, paddingHorizontal: 14 },
  offlineText: { fontSize: 12, color: '#92400e', fontWeight: '600', flex: 1 },

  headerCard: { backgroundColor: '#fff', margin: 16, marginBottom: 8, borderRadius: 16, padding: 18, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1f2937' },
  headerRider: { fontSize: 14, color: '#6b7280', marginTop: 2 },
  activeBadge: { backgroundColor: '#eff6ff', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 14, alignItems: 'center' },
  activeBadgeNum: { fontSize: 22, fontWeight: '800', color: '#1B7BF7' },
  activeBadgeLabel: { fontSize: 11, color: '#3b82f6', fontWeight: '600' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  summaryValue: { fontSize: 16, fontWeight: '800', color: '#1f2937' },
  summaryLabel: { fontSize: 11, color: '#9ca3af' },
  summaryDivider: { width: 1, height: 36, backgroundColor: '#f1f5f9' },

  mapWrap: { height: 250, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  map: { flex: 1 },
  riderMarker: { backgroundColor: '#3b82f6', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff' },
  numMarker: { backgroundColor: '#22c55e', width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff' },
  numMarkerRec: { backgroundColor: '#f59e0b' },
  numMarkerText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  legend: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', gap: 10, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#374151', fontWeight: '600' },

  recBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, marginHorizontal: 16, marginTop: 4, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14 },
  recText: { fontSize: 13, color: '#92400e', flex: 1 },

  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 14, padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardRec: { borderWidth: 1.5, borderColor: '#f59e0b' },
  recTag: { position: 'absolute', top: -8, right: 14, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f59e0b', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7 },
  recTagText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  seqBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1B7BF7', alignItems: 'center', justifyContent: 'center' },
  seqText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stopLabel: { fontSize: 11, fontWeight: '800', color: '#9ca3af', letterSpacing: 0.5 },
  customer: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginTop: 1 },
  statusBadge: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 9 },
  statusText: { fontSize: 11, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  rowText: { fontSize: 13, color: '#6b7280', flex: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  chipText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  expanded: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 6 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  detailLabel: { fontSize: 12, color: '#9ca3af' },
  detailValue: { fontSize: 13, color: '#374151', fontWeight: '600', flex: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 10 },
  actionBtn: { alignItems: 'center', gap: 3, flex: 1 },
  actionLabel: { fontSize: 12, fontWeight: '700' },
  statusActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  statusBtn: { flex: 1, backgroundColor: '#1B7BF7', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  statusBtnDisabled: { backgroundColor: '#e5e7eb' },
  statusBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  statusBtnTextDisabled: { color: '#9ca3af' },

  empty: { alignItems: 'center', marginTop: 50, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#9ca3af' },
  emptyDesc: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
});
