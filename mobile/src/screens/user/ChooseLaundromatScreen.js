import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Linking, RefreshControl, Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { nearbyAPI } from '../../api/client';
import { useFavorites } from '../../context/FavoritesContext';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { SkeletonCard } from '../../components/Skeleton';
import { providerLogo } from '../../theme/images';

const TABS = [
  { key: 'nearby', label: 'Nearby', icon: 'location-outline' },
  { key: 'favorites', label: 'Favorites', icon: 'heart-outline' },
];

// Open / Closed / Not Accepting badge from the availability flags.
function statusOf(p) {
  if (p.isOpen === false || p.open === false) return { label: 'Closed', color: '#ef4444', bg: '#fee2e2' };
  if (p.acceptingOrders === false) return { label: 'Not Accepting', color: '#f59e0b', bg: '#fef3c7' };
  return { label: 'Open', color: '#10b981', bg: '#d1fae5' };
}
function unavailableReason(p) {
  if (p.isOpen === false || p.open === false) return 'Currently Closed';
  if (p.acceptingOrders === false) return 'Not Accepting Orders';
  return 'Temporarily Unavailable';
}

export default function ChooseLaundromatScreen({ navigation }) {
  const { favorites } = useFavorites();
  const [tab, setTab] = useState('nearby');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [providers, setProviders] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      let lat = null; let lng = null;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = loc.coords.latitude; lng = loc.coords.longitude;
        } catch (e) { /* fall through — no distance */ }
      }
      const res = await nearbyAPI.getAllLaundromats(lat, lng);
      setProviders(res.data.providers || []);
    } catch (e) {
      setProviders([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => {
    const base = tab === 'favorites' ? favorites : providers;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((p) =>
      (p.businessName || '').toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q));
  }, [tab, providers, favorites, search]);

  function select(p) {
    // Attach the chosen laundromat to the order and open the redesigned form.
    navigation.navigate('NewRequest', { provider: p });
  }
  function call(phone) { if (phone) Linking.openURL(`tel:${phone}`); }
  function directions(p) {
    if (p.latitude != null && p.longitude != null) {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`);
    }
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Choose a Laundromat</Text>
        <Text style={styles.subtitle}>Every order goes to a specific laundromat</Text>
        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="#9ca3af" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or area"
            placeholderTextColor="#9ca3af"
            value={search}
            onChangeText={setSearch}
          />
          {!!search && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Ionicons name={t.icon} size={16} color={tab === t.key ? '#1B7BF7' : '#6b7280'} />
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.mapBtn} onPress={() => navigation.navigate('Nearby', { screen: 'FindNearby' })}>
            <Ionicons name="map-outline" size={16} color="#fff" />
            <Text style={styles.mapBtnText}>Map</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingVertical: 12 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : list.length === 0 ? (
          <EmptyState
            icon={tab === 'favorites' ? 'heart-outline' : 'storefront-outline'}
            title={tab === 'favorites' ? 'No favorites yet' : 'No laundromats found'}
            subtitle={tab === 'favorites' ? 'Add laundromats to favorites to see them here.' : (search ? 'Try a different search.' : 'No laundromats are available right now.')}
            tint="#1B7BF7"
          />
        ) : (
          list.map((p) => {
            const st = statusOf(p);
            const selectable = p.available !== false;
            return (
              <View key={p.id} style={styles.card}>
                {/* Top: logo + name + status */}
                <View style={styles.cardTop}>
                  <Avatar name={p.businessName} uri={providerLogo(p.id)} size={52} style={{ borderRadius: 14 }} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>{p.businessName}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                        <View style={[styles.statusDot, { backgroundColor: st.color }]} />
                        <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                    <View style={styles.metaRow}>
                      <Ionicons name="star" size={13} color="#f59e0b" />
                      <Text style={styles.metaText}>
                        {p.avgRating > 0 ? p.avgRating.toFixed(1) : 'New'}
                        {p.reviewCount > 0 ? ` (${p.reviewCount})` : ''}
                      </Text>
                      {p.distanceKm != null && (
                        <>
                          <Text style={styles.dotSep}>·</Text>
                          <Ionicons name="location-sharp" size={13} color="#3b82f6" />
                          <Text style={[styles.metaText, { color: '#3b82f6' }]}>{p.distanceKm} km</Text>
                        </>
                      )}
                      {p.estimatedPickupMin != null && (
                        <>
                          <Text style={styles.dotSep}>·</Text>
                          <Ionicons name="bicycle-outline" size={13} color="#8b5cf6" />
                          <Text style={styles.metaText}>~{p.estimatedPickupMin} min</Text>
                        </>
                      )}
                    </View>
                  </View>
                </View>

                {/* Address + hours */}
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={14} color="#6b7280" />
                  <Text style={styles.infoText} numberOfLines={2}>{p.address}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={14} color="#6b7280" />
                  <Text style={styles.infoText}>{p.businessHours}</Text>
                </View>

                {/* Actions */}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => call(p.phone)}>
                    <Ionicons name="call-outline" size={18} color="#059669" />
                    <Text style={[styles.iconBtnText, { color: '#059669' }]}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => directions(p)}>
                    <Ionicons name="navigate-outline" size={18} color="#2563eb" />
                    <Text style={[styles.iconBtnText, { color: '#2563eb' }]}>Directions</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectBtn, !selectable && styles.selectBtnDisabled]}
                    onPress={() => selectable && select(p)}
                    disabled={!selectable}
                    activeOpacity={0.85}
                  >
                    <Ionicons name={selectable ? 'checkmark-circle' : 'lock-closed'} size={18} color="#fff" />
                    <Text style={styles.selectBtnText}>{selectable ? 'Select' : unavailableReason(p)}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#fff', paddingTop: 12, paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title: { fontSize: 22, fontWeight: '800', color: '#1f2937' },
  subtitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  searchInput: { flex: 1, fontSize: 15, color: '#1f2937', padding: 0 },
  tabRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#f3f4f6' },
  tabActive: { backgroundColor: '#e7f1ff' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  tabTextActive: { color: '#1B7BF7' },
  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#1B7BF7', marginLeft: 'auto' },
  mapBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  card: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 16, padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: '#1f2937' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5, flexWrap: 'wrap' },
  metaText: { fontSize: 13, color: '#4b5563', fontWeight: '600' },
  dotSep: { color: '#d1d5db', marginHorizontal: 2 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  infoText: { flex: 1, fontSize: 13, color: '#6b7280' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 11, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#eef2f7' },
  iconBtnText: { fontSize: 13, fontWeight: '700' },
  selectBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 11, backgroundColor: '#1B7BF7' },
  selectBtnDisabled: { backgroundColor: '#9ca3af' },
  selectBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
