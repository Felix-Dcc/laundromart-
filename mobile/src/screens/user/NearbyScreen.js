import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Linking, Platform, Animated,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { nearbyAPI } from '../../api/client';
import StarRating from '../../components/StarRating';
import FavoriteHeart from '../../components/FavoriteHeart';
import { useFavorites } from '../../context/FavoritesContext';
import EmptyState from '../../components/EmptyState';
import { SkeletonCard } from '../../components/Skeleton';
import Avatar from '../../components/Avatar';
import { providerLogo } from '../../theme/images';

const RADIUS_OPTIONS = [5, 10, 20, 50];

export default function NearbyScreen({ navigation }) {
  const [location, setLocation] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [permDenied, setPermDenied] = useState(false);
  const [radius, setRadius] = useState(20);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const { isFavorite, toggleFavorite, favoriteIds } = useFavorites();

  // Search filter + favorites-first ordering (then by distance).
  const visibleProviders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? providers.filter((p) =>
          (p.businessName || '').toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q))
      : providers;
    return [...filtered].sort((a, b) => {
      const fa = favoriteIds.has(a.id) ? 0 : 1;
      const fb = favoriteIds.has(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9);
    });
  }, [providers, search, favoriteIds]);

  useEffect(() => {
    requestLocation();
  }, []);

  useEffect(() => {
    if (location) fetchNearby();
  }, [location, radius]);

  // ─── Location permission ───
  async function requestLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermDenied(true);
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    } catch (error) {
      console.error('Location error:', error);
      setPermDenied(true);
      setLoading(false);
    }
  }

  // ─── Fetch providers from backend ───
  async function fetchNearby() {
    setLoading(true);
    try {
      const res = await nearbyAPI.getProviders(location.lat, location.lng, radius);
      setProviders(res.data.providers || []);
    } catch (error) {
      console.error('Nearby fetch error:', error);
      Alert.alert('Error', 'Failed to load nearby laundromats.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Permission denied view ───
  if (permDenied) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.permCard}>
          <View style={styles.permIconWrap}>
            <Ionicons name="location-outline" size={48} color="#ef4444" />
          </View>
          <Text style={styles.permTitle}>Location Required</Text>
          <Text style={styles.permDesc}>
            We need your location to find laundromats near you. Please enable location access in your device settings.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={() => Linking.openSettings()}>
            <Ionicons name="settings-outline" size={18} color="#fff" />
            <Text style={styles.permBtnText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setPermDenied(false); setLoading(true); requestLocation(); }}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Main view ───
  return (
    <View style={styles.container}>
      {/* Header summary */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="navigate-outline" size={18} color="#3b82f6" />
          <Text style={styles.headerText}>
            {visibleProviders.length} laundromat{visibleProviders.length !== 1 ? 's' : ''}
          </Text>
        </View>
        {location && (
          <TouchableOpacity onPress={fetchNearby} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={18} color="#6b7280" />
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search laundromats"
          placeholderTextColor="#9ca3af"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {/* Radius selector */}
      <View style={styles.radiusRow}>
        <Text style={styles.radiusLabel}>Radius:</Text>
        {RADIUS_OPTIONS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.radiusChip, radius === r && styles.radiusChipActive]}
            onPress={() => setRadius(r)}
          >
            <Text style={[styles.radiusChipText, radius === r && styles.radiusChipTextActive]}>
              {r} km
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Provider list */}
      {loading ? (
        <View style={{ flex: 1, paddingTop: 8 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={visibleProviders}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item, index }) => (
            <ProviderCard
              item={item}
              index={index}
              isSelected={selectedId === item.id}
              isFav={favoriteIds.has(item.id)}
              onToggleFavorite={() => toggleFavorite(item)}
              onPress={() => setSelectedId(selectedId === item.id ? null : item.id)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="storefront-outline"
              title="No laundromats found"
              subtitle={search ? 'Try a different search term' : 'Try increasing the search radius to find more laundromats nearby.'}
              tint="#3b82f6"
            />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────
// Provider Card component
// ─────────────────────────────────────────
function ProviderCard({ item, index, isSelected, isFav, onToggleFavorite, onPress }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      delay: index * 80,
      useNativeDriver: true,
    }).start();
  }, []);

  // Color by ranking
  const rankColors = ['#f59e0b', '#6b7280', '#b45309'];
  const rankColor = index < 3 ? rankColors[index] : '#d1d5db';

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      <TouchableOpacity style={[styles.card, isSelected && styles.cardSelected, isFav && styles.cardFav]} onPress={onPress} activeOpacity={0.7}>
        {/* Top row */}
        <View style={styles.cardTop}>
          <View style={styles.cardTopLeft}>
            {/* Provider logo avatar */}
            <Avatar name={item.businessName} uri={providerLogo(item.id)} size={44} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.businessName} numberOfLines={1}>{item.businessName}</Text>
                {item.favoriteCount > 0 && (
                  <View style={styles.favCountPill}>
                    <Ionicons name="heart" size={10} color="#ef4444" />
                    <Text style={styles.favCountPillText}>{item.favoriteCount}</Text>
                  </View>
                )}
              </View>
              <StarRating rating={item.avgRating || 0} size={14} showLabel count={item.reviewCount} />
            </View>
          </View>
          {/* Heart + distance */}
          <View style={styles.cardTopRight}>
            <FavoriteHeart active={isFav} onToggle={onToggleFavorite} size={20} />
            {item.distanceKm != null && (
              <View style={styles.distancePill}>
                <Ionicons name="location-sharp" size={12} color="#3b82f6" />
                <Text style={styles.distanceText}>{item.distanceKm} km</Text>
              </View>
            )}
          </View>
        </View>

        {/* Info chips */}
        <View style={styles.chipRow}>
          <View style={styles.infoChip}>
            <Ionicons name="time-outline" size={14} color="#8b5cf6" />
            <Text style={styles.chipText}>~{item.estimatedPickupMin} min pickup</Text>
          </View>
          <View style={styles.infoChip}>
            <Ionicons name="calendar-outline" size={14} color="#10b981" />
            <Text style={styles.chipText}>{item.businessHours}</Text>
          </View>
        </View>

        {/* Expanded details */}
        {isSelected && (
          <View style={styles.expandedSection}>
            <View style={styles.divider} />
            <View style={styles.detailRow}>
              <Ionicons name="location-outline" size={16} color="#6b7280" />
              <Text style={styles.detailText}>{item.address}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="call-outline" size={16} color="#6b7280" />
              <Text style={styles.detailText}>{item.phone}</Text>
            </View>
            <View style={styles.detailRow}>
              <Ionicons name="mail-outline" size={16} color="#6b7280" />
              <Text style={styles.detailText}>{item.email}</Text>
            </View>

            {/* Action buttons */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() => Linking.openURL(`tel:${item.phone}`)}
              >
                <Ionicons name="call" size={16} color="#fff" />
                <Text style={styles.callBtnText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dirBtn}
                onPress={() => {
                  const url = Platform.select({
                    ios: `maps:0,0?q=${item.latitude},${item.longitude}`,
                    android: `geo:0,0?q=${item.latitude},${item.longitude}(${item.businessName})`,
                  });
                  Linking.openURL(url);
                }}
              >
                <Ionicons name="navigate" size={16} color="#fff" />
                <Text style={styles.dirBtnText}>Directions</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centerContainer: { flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', padding: 24 },

  // Permission denied
  permCard: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center', width: '100%', elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  permIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  permTitle: { fontSize: 20, fontWeight: '800', color: '#1f2937', marginBottom: 8 },
  permDesc: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  permBtn: { flexDirection: 'row', backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', gap: 8 },
  permBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  retryBtn: { marginTop: 12, paddingVertical: 10 },
  retryBtnText: { color: '#3b82f6', fontSize: 14, fontWeight: '600' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  refreshBtn: { padding: 6 },

  // Radius
  radiusRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  radiusLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  radiusChip: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 20, paddingVertical: 5, paddingHorizontal: 14, backgroundColor: '#fff' },
  radiusChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  radiusChipText: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  radiusChipTextActive: { color: '#fff' },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#6b7280' },

  // Empty
  emptyContainer: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#9ca3af' },
  emptyDesc: { fontSize: 14, color: '#d1d5db' },

  // Search
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput: { flex: 1, fontSize: 14, color: '#1f2937', padding: 0 },

  // Card
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 14, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, borderWidth: 1.5, borderColor: 'transparent' },
  cardSelected: { borderColor: '#3b82f6' },
  cardFav: { borderColor: '#fde68a', backgroundColor: '#fffdf7', elevation: 5, shadowOpacity: 0.12, shadowRadius: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTopLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  cardTopRight: { alignItems: 'flex-end', gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  favCountPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#fef2f2', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  favCountPillText: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
  rankBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  businessName: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  ownerName: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  distancePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10, gap: 4 },
  distanceText: { fontSize: 13, fontWeight: '700', color: '#3b82f6' },

  // Info chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, gap: 8 },
  infoChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10, gap: 5 },
  chipText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },

  // Expanded
  expandedSection: { marginTop: 12 },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  detailText: { fontSize: 13, color: '#374151', flex: 1 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  callBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#10b981', borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 6 },
  callBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  dirBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 6 },
  dirBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});
