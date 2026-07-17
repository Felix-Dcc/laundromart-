import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking, Platform,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { ordersAPI, riderAPI } from '../../api/client';
import { subscribeToOrder } from '../../services/realtime';
import { addTrackedOrder, removeTrackedOrder, getLatestRiderLocation, subscribeRiderTracking } from '../../services/riderTracking';
import { fetchDirections } from '../../utils/directions';
import { openInGoogleMaps } from '../../utils/location';
import { useAuth } from '../../context/AuthContext';
import { metaFor } from '../../utils/orderStatus';
import { Skeleton } from '../../components/Skeleton';

// Each delivery status → the next action + which place the rider is heading to.
const FLOW = {
  delivery_rider_assigned:   { label: 'On My Way to Laundromat', fn: (id) => riderAPI.markToLaundromat(id),      dest: 'laundromat' },
  rider_to_laundromat:       { label: 'Pick Up Laundry',         fn: (id) => riderAPI.markCollected(id),         dest: 'laundromat' },
  collected_from_laundromat: { label: 'On My Way to Customer',   fn: (id) => riderAPI.markOutForDelivery(id),    dest: 'customer' },
  out_for_delivery:          { label: "I've Arrived",            fn: (id) => riderAPI.markArrivedAtCustomer(id), dest: 'customer' },
  rider_arrived_at_customer: { label: 'Deliver Laundry',         fn: (id) => riderAPI.markDeliveredToCustomer(id), dest: 'customer', done: true },
};

export default function DeliveryDetailsScreen({ route, navigation }) {
  const { orderId } = route.params || {};
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [riderLoc, setRiderLoc] = useState(() => getLatestRiderLocation());
  const [routeCoords, setRouteCoords] = useState([]);
  const mapRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await ordersAPI.getById(orderId);
      setOrder(res.data.request);
    } catch (e) {
      Alert.alert('Error', 'Failed to load delivery.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Broadcast this rider's location to the customer for the whole delivery,
  // and subscribe to live status changes (no manual refresh).
  useEffect(() => {
    if (!orderId) return;
    addTrackedOrder(orderId, user?.id);
    const unsubLoc = subscribeRiderTracking((loc) => { if (loc) setRiderLoc(loc); });
    const unsubOrder = subscribeToOrder(orderId, (data) => {
      if (data.order) setOrder((prev) => ({ ...prev, ...data.order }));
    });
    return () => {
      removeTrackedOrder(orderId);
      unsubLoc();
      unsubOrder();
    };
  }, [orderId, user?.id]);

  const laundromat = order && order.laundromatLatitude != null
    ? { latitude: order.laundromatLatitude, longitude: order.laundromatLongitude } : null;
  const customer = order && order.pickupLatitude != null
    ? { latitude: order.pickupLatitude, longitude: order.pickupLongitude } : null;
  const flow = order ? FLOW[order.status] : null;
  const destination = flow?.dest === 'customer' ? customer : laundromat;

  // Fetch a road route from the rider to the current destination.
  useEffect(() => {
    let alive = true;
    if (riderLoc && destination) {
      fetchDirections(riderLoc, destination)
        .then((d) => { if (alive && d?.coordinates?.length) setRouteCoords(d.coordinates); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, [riderLoc?.latitude, riderLoc?.longitude, destination?.latitude, destination?.longitude]);

  async function advance() {
    if (!flow) return;
    setWorking(true);
    try {
      await flow.fn(orderId);
      if (flow.done) {
        Alert.alert('Delivered', 'Laundry delivered to the customer. Order complete!', [{ text: 'Done', onPress: () => navigation.goBack() }]);
        return;
      }
      await load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not update status.');
    } finally {
      setWorking(false);
    }
  }

  function navigateTo() {
    if (destination) openInGoogleMaps(destination.latitude, destination.longitude);
  }
  function call(phone) { if (phone) Linking.openURL(`tel:${phone}`); }

  if (loading) {
    return (
      <View style={styles.container}>
        <Skeleton width="100%" height={220} radius={0} />
        <View style={{ padding: 16 }}>
          <Skeleton width="100%" height={120} radius={12} />
          <Skeleton width="100%" height={56} radius={12} style={{ marginTop: 12 }} />
        </View>
      </View>
    );
  }
  if (!order) return null;

  const meta = metaFor(order.status);
  const isComplete = order.status === 'completed';
  const headingCustomer = flow?.dest === 'customer';

  return (
    <ScrollView style={styles.container}>
      {/* Live map */}
      {(riderLoc || destination) && (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={{
            latitude: (riderLoc?.latitude ?? destination?.latitude),
            longitude: (riderLoc?.longitude ?? destination?.longitude),
            latitudeDelta: 0.05, longitudeDelta: 0.05,
          }}
        >
          {laundromat && <Marker coordinate={laundromat} title={order.provider?.name || 'Laundromat'} pinColor="#0ea5e9" />}
          {customer && <Marker coordinate={customer} title={order.user?.name || 'Customer'} pinColor="#10b981" />}
          {riderLoc && (
            <Marker coordinate={riderLoc} title="You" anchor={{ x: 0.5, y: 0.5 }}>
              <View style={styles.riderMarker}><Ionicons name="bicycle" size={16} color="#fff" /></View>
            </Marker>
          )}
          {routeCoords.length > 1 && <Polyline coordinates={routeCoords} strokeWidth={4} strokeColor="#0ea5e9" />}
        </MapView>
      )}

      {/* Status banner */}
      <View style={[styles.statusBanner, { backgroundColor: meta.bgColor }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
        <Text style={[styles.statusBannerText, { color: meta.color }]}>{meta.label}</Text>
      </View>

      {/* Delivery info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Delivery #{order.requestNumber}</Text>
        <Row icon="person-outline" label="Customer" value={order.user?.name} />
        <Row icon="call-outline" label="Customer Phone" value={order.user?.phone} />
        <Row icon="storefront-outline" label="Laundromat" value={order.provider?.name} />
        <Row icon="business-outline" label="Pickup (Laundromat)" value={order.provider?.address} />
        <Row icon="location-outline" label="Deliver To" value={order.deliveryAddress || order.pickupAddress} />
        {order.eta && <Row icon="time-outline" label="ETA" value={`~${order.eta.remainingMinutes} min`} />}
      </View>

      {/* Navigate + Call */}
      <View style={styles.quickRow}>
        <TouchableOpacity style={[styles.quickBtn, { backgroundColor: '#0ea5e9' }]} onPress={navigateTo}>
          <Ionicons name="navigate" size={18} color="#fff" />
          <Text style={styles.quickText}>{headingCustomer ? 'Navigate to Customer' : 'Navigate to Laundromat'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.quickBtn, { backgroundColor: '#10b981' }]}
          onPress={() => call(headingCustomer ? order.user?.phone : order.provider?.phone)}
        >
          <Ionicons name="call" size={18} color="#fff" />
          <Text style={styles.quickText}>{headingCustomer ? 'Call Customer' : 'Call Provider'}</Text>
        </TouchableOpacity>
      </View>

      {/* Primary action */}
      {flow && !isComplete && (
        <TouchableOpacity style={styles.primaryBtn} onPress={advance} disabled={working}>
          {working ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
              <Text style={styles.primaryText}>{flow.label}</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {isComplete && (
        <View style={styles.doneBanner}>
          <Ionicons name="checkmark-circle" size={20} color="#059669" />
          <Text style={styles.doneText}>Delivered — order completed</Text>
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function Row({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={16} color="#6b7280" />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  map: { width: '100%', height: 240 },
  riderMarker: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  statusBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 16, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  statusBannerText: { fontSize: 15, fontWeight: '800' },
  card: { backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 1, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowLabel: { fontSize: 12, color: '#6b7280' },
  rowValue: { fontSize: 15, color: '#1f2937', fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 16 },
  quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 13 },
  quickText: { color: '#fff', fontWeight: '700', fontSize: 13, textAlign: 'center' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0ea5e9', marginHorizontal: 16, marginTop: 12, borderRadius: 12, paddingVertical: 16, elevation: 2 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  doneBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ecfdf5', marginHorizontal: 16, marginTop: 12, borderRadius: 12, paddingVertical: 16, borderWidth: 1, borderColor: '#a7f3d0' },
  doneText: { color: '#065f46', fontWeight: '800', fontSize: 15 },
});
