import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Linking, Platform, AppState,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { riderAPI } from '../../api/client';
import { useRider } from '../../context/RiderContext';
import { startRiderTracking, subscribeRiderTracking, getLatestRiderLocation } from '../../services/riderTracking';
import { fetchDirections } from '../../utils/directions';
import { formatDistance, formatETA, openInGoogleMaps } from '../../utils/location';

export default function RiderNavigationScreen({ route, navigation }) {
  const { activeTasks, activeTask, refresh } = useRider();
  // Navigate to a specific task (multi-task) or fall back to the first one.
  const task = (route.params?.orderId && activeTasks.find((t) => t.id === route.params.orderId)) || activeTask;
  const order = task ? {
    id: task.id,
    status: task.status,
    pickupAddress: task.pickupAddress,
    pickupLatitude: task.pickupLatitude,
    pickupLongitude: task.pickupLongitude,
    deliveryAddress: task.provider?.address || task.pickupAddress,
    user: task.customer ? {
      firstName: (task.customer.name || '').split(' ')[0] || 'Customer',
      lastName: (task.customer.name || '').split(' ').slice(1).join(' '),
      phone: task.customer.phone,
    } : null,
    assignedProvider: task.provider && task.provider.latitude != null
      ? { latitude: task.provider.latitude, longitude: task.provider.longitude }
      : null,
  } : null;

  const [riderLocation, setRiderLocation] = useState(() => {
    const l = getLatestRiderLocation();
    return l ? { latitude: l.latitude, longitude: l.longitude } : null;
  });
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(!getLatestRiderLocation());
  const mapRef = useRef(null);

  const destination = getDestination(order);

  // Subscribe to the centralized tracker (RiderContext keeps it running for all
  // active tasks — this screen only reads the latest fix).
  useEffect(() => {
    let mounted = true;
    // Fast first paint from device if the tracker hasn't produced a fix yet.
    if (!getLatestRiderLocation()) {
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest })
        .then((loc) => {
          if (mounted) {
            setRiderLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            setLoading(false);
          }
        })
        .catch(() => { if (mounted) setLoading(false); });
    }

    const unsub = subscribeRiderTracking((loc) => {
      if (!mounted || !loc) return;
      setRiderLocation({ latitude: loc.latitude, longitude: loc.longitude });
      setLoading(false);
    });

    return () => { mounted = false; unsub(); };
  }, [order?.id]);

  useEffect(() => {
    if (riderLocation && destination) {
      loadRoute(riderLocation, destination);
    }
  }, [riderLocation?.latitude, riderLocation?.longitude, destination?.latitude, destination?.longitude]);

  // ── Arrival geofence: prompt when within ~30m of the customer's pickup ──
  const arrivalPromptedRef = useRef(false);
  useEffect(() => {
    if (!riderLocation || !order) return;
    if (!['rider_assigned', 'rider_on_the_way'].includes(order.status)) return; // only before arrival
    if (order.pickupLatitude == null || order.pickupLongitude == null) return;

    const meters = haversineMeters(riderLocation, { latitude: order.pickupLatitude, longitude: order.pickupLongitude });
    if (meters <= 30 && !arrivalPromptedRef.current) {
      arrivalPromptedRef.current = true;
      Alert.alert(
        "You've reached the customer",
        "You appear to be at the pickup location. Confirm your arrival?",
        [
          { text: 'Not yet', style: 'cancel', onPress: () => { setTimeout(() => { arrivalPromptedRef.current = false; }, 30000); } },
          {
            text: 'Confirm Arrival',
            onPress: async () => {
              try {
                await riderAPI.markArrived(order.id);
                refresh();
              } catch (e) {
                arrivalPromptedRef.current = false;
                Alert.alert('Error', e.response?.data?.error || 'Failed to confirm arrival.');
              }
            },
          },
        ],
      );
    }
  }, [riderLocation?.latitude, riderLocation?.longitude, order?.status]);

  async function loadRoute(origin, dest) {
    try {
      const data = await fetchDirections(origin, dest);
      setRouteData(data);
    } catch (error) {
      console.error('Route loading error:', error);
    }
  }

  const fitRoute = useCallback(() => {
    if (!mapRef.current || !riderLocation || !destination) return;
    mapRef.current.fitToCoordinates(
      [riderLocation, destination],
      { edgePadding: { top: 100, right: 60, bottom: 200, left: 60 }, animated: true }
    );
  }, [riderLocation, destination]);

  const handleOpenGoogleMaps = () => {
    if (!destination) return;
    openInGoogleMaps(destination.latitude, destination.longitude);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1B7BF7" />
        <Text style={styles.loadingText}>Getting your location...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="navigate-outline" size={56} color="#d1d5db" />
        <Text style={styles.emptyTitle}>No Active Order</Text>
        <Text style={styles.emptyDesc}>Accept an order to start navigation</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPickupPhase = ['rider_assigned', 'rider_on_the_way', 'rider_arrived'].includes(order.status);

  return (
    <View style={styles.container}>
      {riderLocation && (
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={{
            latitude: (riderLocation.latitude + (destination?.latitude || riderLocation.latitude)) / 2,
            longitude: (riderLocation.longitude + (destination?.longitude || riderLocation.longitude)) / 2,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsCompass
          onMapReady={fitRoute}
        >
          {/* Rider marker */}
          <Marker
            coordinate={riderLocation}
            title="You"
            description="Your current location"
          >
            <View style={styles.riderMarker}>
              <Ionicons name="bicycle" size={20} color="#fff" />
            </View>
          </Marker>

          {/* Destination marker */}
          {destination && (
            <Marker
              coordinate={destination}
              title={isPickupPhase ? 'Pickup Location' : 'Laundromat'}
              description={isPickupPhase ? order.pickupAddress : order.deliveryAddress}
              pinColor={isPickupPhase ? '#f59e0b' : '#10b981'}
            />
          )}

          {/* Route polyline */}
          {routeData && routeData.coordinates.length > 1 && (
            <Polyline
              coordinates={routeData.coordinates}
              strokeWidth={4}
              strokeColor="#3b82f6"
              lineDashPattern={routeData.coordinates.length === 2 ? [10, 8] : undefined}
            />
          )}
        </MapView>
      )}

      {/* Info panel */}
      <View style={styles.infoPanel}>
        {/* Phase indicator */}
        <View style={styles.phaseRow}>
          <View style={[styles.phaseDot, { backgroundColor: isPickupPhase ? '#f59e0b' : '#10b981' }]} />
          <Text style={styles.phaseText}>
            {isPickupPhase ? 'Heading to Pickup' : 'Heading to Laundromat'}
          </Text>
        </View>

        {/* ETA and distance */}
        {routeData && (
          <View style={styles.etaRow}>
            <View style={styles.etaItem}>
              <Ionicons name="time-outline" size={20} color="#3b82f6" />
              <View>
                <Text style={styles.etaValue}>{routeData.duration}</Text>
                <Text style={styles.etaLabel}>ETA</Text>
              </View>
            </View>
            <View style={styles.etaDivider} />
            <View style={styles.etaItem}>
              <Ionicons name="speedometer-outline" size={20} color="#8b5cf6" />
              <View>
                <Text style={styles.etaValue}>{routeData.distance}</Text>
                <Text style={styles.etaLabel}>Distance</Text>
              </View>
            </View>
          </View>
        )}

        {/* Destination address */}
        <View style={styles.destRow}>
          <Ionicons name="location" size={16} color={isPickupPhase ? '#f59e0b' : '#10b981'} />
          <Text style={styles.destText} numberOfLines={2}>
            {isPickupPhase ? order.pickupAddress : order.deliveryAddress}
          </Text>
        </View>

        {/* Customer info during pickup */}
        {isPickupPhase && order.user && (
          <View style={styles.customerRow}>
            <Ionicons name="person-outline" size={14} color="#6b7280" />
            <Text style={styles.customerText}>
              {order.user.firstName} {order.user.lastName}
            </Text>
            <TouchableOpacity onPress={() => Linking.openURL(`tel:${order.user.phone}`)}>
              <Ionicons name="call" size={16} color="#10b981" />
            </TouchableOpacity>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.googleMapsBtn} onPress={handleOpenGoogleMaps}>
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={styles.googleMapsBtnText}>Open in Google Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.recenterBtn} onPress={fitRoute}>
            <Ionicons name="locate-outline" size={20} color="#3b82f6" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function getDestination(order) {
  if (!order) return null;
  const isPickup = ['rider_assigned', 'rider_on_the_way', 'rider_arrived'].includes(order.status);
  if (isPickup && order.pickupLatitude && order.pickupLongitude) {
    return { latitude: order.pickupLatitude, longitude: order.pickupLongitude };
  }
  if (!isPickup && order.deliveryLatitude && order.deliveryLongitude) {
    return { latitude: order.deliveryLatitude, longitude: order.deliveryLongitude };
  }
  if (!isPickup && order.assignedProvider?.latitude && order.assignedProvider?.longitude) {
    return { latitude: order.assignedProvider.latitude, longitude: order.assignedProvider.longitude };
  }
  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa', padding: 24, gap: 12 },
  loadingText: { fontSize: 14, color: '#6b7280', marginTop: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#374151' },
  emptyDesc: { fontSize: 14, color: '#9ca3af' },
  backBtn: { backgroundColor: '#1B7BF7', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24, marginTop: 8 },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  map: { flex: 1 },

  riderMarker: {
    backgroundColor: '#3b82f6', borderRadius: 20, width: 36, height: 36,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },

  infoPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: -4 }, elevation: 10,
  },

  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  phaseDot: { width: 10, height: 10, borderRadius: 5 },
  phaseText: { fontSize: 15, fontWeight: '700', color: '#1f2937' },

  etaRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 12 },
  etaItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  etaDivider: { width: 1, height: 30, backgroundColor: '#e5e7eb' },
  etaValue: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  etaLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },

  destRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  destText: { flex: 1, fontSize: 13, color: '#4b5563', lineHeight: 18 },

  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, paddingTop: 4 },
  customerText: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '500' },

  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  googleMapsBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', gap: 8 },
  googleMapsBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  recenterBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#dbeafe' },
});
