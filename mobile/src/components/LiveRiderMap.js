import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, Linking,
} from 'react-native';
import MapView, {
  Marker, MarkerAnimated, AnimatedRegion, Polyline, PROVIDER_GOOGLE,
} from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { connectSocket, subscribeToRiderLocation } from '../services/realtime';
import { fetchDirections } from '../utils/directions';
import { formatDistance } from '../utils/location';
import { ordersAPI } from '../api/client';

const ANIMATE_MS = 1000;        // marker glide duration between fixes
const ROUTE_MIN_MOVE_M = 30;    // refetch route after this much rider movement
const ROUTE_MIN_INTERVAL_MS = 5000;
const STALE_MS = 12000;         // no fix for this long → "updating…" failsafe

function haversineM(a, b) {
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

export default function LiveRiderMap({ orderId, userLocation, pickupAddress, laundromatLocation, riderPhone, style }) {
  const [hasRider, setHasRider] = useState(false);
  const [heading, setHeading] = useState(0);
  const [routeCoords, setRouteCoords] = useState([]);
  const [eta, setEta] = useState(null);
  const [distance, setDistance] = useState(null);
  const [distanceValue, setDistanceValue] = useState(null);
  const [connected, setConnected] = useState(false);
  const [stale, setStale] = useState(false);
  const [following, setFollowing] = useState(true);

  const mapRef = useRef(null);
  const riderCoord = useRef(null);        // AnimatedRegion (native, no re-render)
  const riderPlainRef = useRef(null);      // plain {lat,lng} for math
  const regionRef = useRef(null);          // current viewport
  const followingRef = useRef(true);
  const lastUpdateRef = useRef(0);
  const lastRouteRef = useRef({ origin: null, t: 0 });

  useEffect(() => { followingRef.current = following; }, [following]);

  // ── Apply a new rider fix: glide the marker natively, no map re-render ──
  const applyRiderFix = useCallback((coord, hdg) => {
    lastUpdateRef.current = Date.now();
    setStale(false);
    setConnected(true);
    if (hdg != null && hdg >= 0) setHeading(hdg);

    if (!riderCoord.current) {
      riderCoord.current = new AnimatedRegion({
        latitude: coord.latitude,
        longitude: coord.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
      riderPlainRef.current = coord;
      setHasRider(true);
    } else {
      riderPlainRef.current = coord;
      riderCoord.current
        .timing({ latitude: coord.latitude, longitude: coord.longitude, duration: ANIMATE_MS, useNativeDriver: false })
        .start();
    }

    maybeRefetchRoute(coord);
    if (followingRef.current) keepRiderVisible(coord);
  }, [userLocation]);

  // ── Subscribe to live updates + seed from last-known location ──
  useEffect(() => {
    if (!orderId) return;
    let unsub = null;
    let mounted = true;

    // Seed instantly with the rider's last known DB position.
    ordersAPI.getRiderLocation(orderId)
      .then((res) => {
        const rl = res.data?.riderLocation;
        if (mounted && rl && !riderCoord.current) {
          applyRiderFix({ latitude: rl.latitude, longitude: rl.longitude }, null);
        }
      })
      .catch(() => {});

    connectSocket().then(() => {
      if (!mounted) return;
      unsub = subscribeToRiderLocation(orderId, (data) => {
        applyRiderFix({ latitude: data.latitude, longitude: data.longitude }, data.heading);
      });
    });

    // Failsafe watchdog: flag staleness but keep the last marker on screen.
    const watchdog = setInterval(() => {
      if (lastUpdateRef.current && Date.now() - lastUpdateRef.current > STALE_MS) {
        setStale(true);
      }
    }, 3000);

    return () => {
      mounted = false;
      if (unsub) unsub();
      clearInterval(watchdog);
    };
  }, [orderId, applyRiderFix]);

  // ── Route (rider → pickup) refetch, distance-gated ──
  function maybeRefetchRoute(coord) {
    if (!userLocation) return;
    const now = Date.now();
    const moved = haversineM(lastRouteRef.current.origin, coord);
    if (moved < ROUTE_MIN_MOVE_M && now - lastRouteRef.current.t < ROUTE_MIN_INTERVAL_MS) return;
    lastRouteRef.current = { origin: coord, t: now };

    fetchDirections(coord, userLocation).then((data) => {
      if (!data) return;
      setRouteCoords(data.coordinates || []);
      setEta(data.duration);
      setDistance(data.distance);
      setDistanceValue(data.distanceValue ?? null);
    }).catch(() => {});
  }

  // ── Camera: only move when rider drifts out of view (while following) ──
  function isInView(coord) {
    const r = regionRef.current;
    if (!r) return true;
    const latOk = Math.abs(coord.latitude - r.latitude) <= (r.latitudeDelta / 2) * 0.8;
    const lonOk = Math.abs(coord.longitude - r.longitude) <= (r.longitudeDelta / 2) * 0.8;
    return latOk && lonOk;
  }

  function keepRiderVisible(coord) {
    if (!mapRef.current) return;
    if (isInView(coord)) return; // don't constantly recenter / zoom
    mapRef.current.animateCamera({ center: coord }, { duration: 500 });
  }

  const recenter = useCallback(() => {
    if (!mapRef.current) return;
    const coords = [];
    if (riderPlainRef.current) coords.push(riderPlainRef.current);
    if (userLocation) coords.push(userLocation);
    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 90, right: 60, bottom: 90, left: 60 },
        animated: true,
      });
    } else if (riderPlainRef.current) {
      mapRef.current.animateCamera({ center: riderPlainRef.current, zoom: 15 }, { duration: 500 });
    }
  }, [userLocation]);

  const onFollowPress = useCallback(() => {
    setFollowing(true);
    followingRef.current = true;
    recenter();
  }, [recenter]);

  // Waiting state (no fix yet at all)
  if (!hasRider) {
    return (
      <View style={[styles.waitingContainer, style]}>
        <View style={styles.waitingInner}>
          <ActivityIndicator size="small" color="#3b82f6" />
          <Text style={styles.waitingText}>Locating your rider…</Text>
          <Text style={styles.waitingSub}>The rider's position will appear here shortly</Text>
        </View>
      </View>
    );
  }

  const statusText = distanceValue != null
    ? `Rider is ${formatDistance(distanceValue / 1000)} away${eta ? ` · arriving in ${eta}` : ''}`
    : 'Tracking your rider…';

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: riderPlainRef.current?.latitude || userLocation?.latitude,
          longitude: riderPlainRef.current?.longitude || userLocation?.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        }}
        showsUserLocation={!!userLocation}
        showsMyLocationButton={false}
        showsCompass
        onRegionChangeComplete={(r) => { regionRef.current = r; }}
        onPanDrag={() => { if (followingRef.current) { followingRef.current = false; setFollowing(false); } }}
        onMapReady={recenter}
      >
        {/* Rider marker — native-animated coordinate (60 FPS, no map re-render) */}
        {riderCoord.current && (
          <MarkerAnimated coordinate={riderCoord.current} anchor={{ x: 0.5, y: 0.5 }} flat>
            <View style={[styles.riderMarker, { transform: [{ rotate: `${heading}deg` }] }]}>
              <Ionicons name="navigate" size={18} color="#fff" />
            </View>
          </MarkerAnimated>
        )}

        {/* Pickup (user) marker */}
        {userLocation && (
          <Marker coordinate={userLocation} title="Pickup Location" description={pickupAddress} pinColor="#f59e0b" />
        )}

        {/* Laundromat marker (context) */}
        {laundromatLocation && (
          <Marker coordinate={laundromatLocation} title="Laundromat" pinColor="#10b981" />
        )}

        {/* Live route: rider → pickup */}
        {routeCoords.length > 1 && (
          <Polyline coordinates={routeCoords} strokeWidth={4} strokeColor="#3b82f6" />
        )}

        {/* Context leg: pickup → laundromat (dashed) */}
        {userLocation && laundromatLocation && (
          <Polyline
            coordinates={[userLocation, laundromatLocation]}
            strokeWidth={3}
            strokeColor="#10b981"
            lineDashPattern={[8, 8]}
          />
        )}
      </MapView>

      {/* Live status / ETA */}
      <View style={styles.statusBar}>
        <Ionicons name="bicycle" size={15} color="#3b82f6" />
        <Text style={styles.statusText} numberOfLines={1}>{statusText}</Text>
      </View>

      {/* Stale / reconnecting failsafe */}
      {stale && (
        <View style={styles.staleBanner}>
          <ActivityIndicator size="small" color="#92400e" />
          <Text style={styles.staleText}>Updating rider location…</Text>
        </View>
      )}

      {/* Distance pill */}
      {distance && (
        <View style={styles.distPill}>
          <Ionicons name="navigate-outline" size={13} color="#fff" />
          <Text style={styles.distText}>{distance} left</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {!!riderPhone && (
          <TouchableOpacity style={styles.callRiderBtn} onPress={() => Linking.openURL(`tel:${riderPhone}`)}>
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.callRiderText}>Call Rider</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.ctrlBtn, following && styles.ctrlBtnActive]} onPress={onFollowPress}>
          <Ionicons name="locate" size={18} color={following ? '#fff' : '#3b82f6'} />
          <Text style={[styles.ctrlText, following && { color: '#fff' }]}>Follow</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.recenterBtn} onPress={recenter}>
          <Ionicons name="scan-outline" size={18} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      {/* Connection dot */}
      <View style={[styles.statusDot, { backgroundColor: stale ? '#f59e0b' : connected ? '#10b981' : '#ef4444' }]}>
        <Text style={styles.statusDotText}>{stale ? 'STALE' : connected ? 'LIVE' : 'CONNECTING'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { height: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e5e7eb' },
  map: { flex: 1 },

  waitingContainer: { height: 200, borderRadius: 12, overflow: 'hidden', backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' },
  waitingInner: { alignItems: 'center', gap: 8, padding: 24 },
  waitingText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  waitingSub: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },

  riderMarker: {
    backgroundColor: '#3b82f6', borderRadius: 18, width: 34, height: 34,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },

  statusBar: {
    position: 'absolute', top: 10, left: 10, right: 90,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 10,
    paddingVertical: 7, paddingHorizontal: 10,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  statusText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#1f2937' },

  staleBanner: {
    position: 'absolute', top: 52, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fef3c7', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10,
  },
  staleText: { fontSize: 11.5, fontWeight: '700', color: '#92400e' },

  distPill: {
    position: 'absolute', bottom: 14, left: 10,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#3b82f6', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 11,
    elevation: 3,
  },
  distText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  controls: { position: 'absolute', bottom: 14, right: 10, gap: 8, alignItems: 'flex-end' },
  ctrlBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#fff', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  ctrlBtnActive: { backgroundColor: '#3b82f6' },
  callRiderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#10b981', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 12,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  callRiderText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  ctrlText: { fontSize: 12, fontWeight: '700', color: '#3b82f6' },
  recenterBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },

  statusDot: {
    position: 'absolute', top: 10, right: 10,
    borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8,
  },
  statusDotText: { fontSize: 10, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
});
