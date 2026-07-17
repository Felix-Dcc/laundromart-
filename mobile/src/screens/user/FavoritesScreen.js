import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import StarRating from '../../components/StarRating';
import FavoriteHeart from '../../components/FavoriteHeart';
import { useFavorites } from '../../context/FavoritesContext';
import { haversineKm, formatDistance } from '../../utils/location';
import { isOpenNow } from '../../components/MapMarkerCallout';
import EmptyState from '../../components/EmptyState';

export default function FavoritesScreen({ navigation }) {
  const { favorites, toggleFavorite } = useFavorites();
  const [search, setSearch] = useState('');
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch (e) { /* ignore */ }
    })();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter((f) =>
      (f.businessName || '').toLowerCase().includes(q) ||
      (f.address || '').toLowerCase().includes(q));
  }, [favorites, search]);

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search your favorites"
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

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <FavoriteRow
            item={item}
            coords={coords}
            onRemove={() => toggleFavorite(item)}
            onOpen={() => navigation.navigate('Nearby', { screen: 'FindNearby' })}
            onNewRequest={() => navigation.navigate('Orders', { screen: 'NewRequest', params: { provider: item } })}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="heart-outline"
            title={search ? 'No matching favorites' : 'No favorites yet'}
            subtitle={search ? 'Try a different search' : "You haven't added any favorite laundromats yet. Find nearby laundromats to add your favorites."}
            tint="#ef4444"
            actionLabel={search ? undefined : 'Find Laundromats'}
            onAction={search ? undefined : () => navigation.navigate('Nearby', { screen: 'FindNearby' })}
          />
        }
      />
    </View>
  );
}

function FavoriteRow({ item, coords, onRemove, onOpen, onNewRequest }) {
  const openStatus = isOpenNow(item.businessHours);
  const initial = (item.businessName || '?').trim().charAt(0).toUpperCase();
  const distanceKm = coords && item.latitude != null && item.longitude != null
    ? haversineKm(coords.latitude, coords.longitude, item.latitude, item.longitude)
    : item.distanceKm ?? null;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.logo}>
          <Ionicons name="storefront" size={20} color="#fff" />
          <View style={styles.logoBadge}><Text style={styles.logoBadgeText}>{initial}</Text></View>
        </View>

        <TouchableOpacity style={{ flex: 1 }} activeOpacity={0.7} onPress={onOpen}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{item.businessName}</Text>
            {openStatus !== null && (
              <View style={[styles.openBadge, { backgroundColor: openStatus ? '#d1fae5' : '#fee2e2' }]}>
                <Text style={[styles.openText, { color: openStatus ? '#065f46' : '#991b1b' }]}>
                  {openStatus ? 'Open' : 'Closed'}
                </Text>
              </View>
            )}
          </View>
          <StarRating rating={item.avgRating || 0} size={13} showLabel count={item.reviewCount} />
          <View style={styles.metaRow}>
            {distanceKm != null && (
              <View style={styles.metaChip}>
                <Ionicons name="location-sharp" size={12} color="#3b82f6" />
                <Text style={styles.metaText}>{formatDistance(distanceKm)}</Text>
              </View>
            )}
            {item.favoriteCount > 0 && (
              <View style={styles.metaChip}>
                <Ionicons name="heart" size={11} color="#ef4444" />
                <Text style={styles.metaText}>{item.favoriteCount} favorited</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        <FavoriteHeart active onToggle={onRemove} size={22} />
      </View>

      <Text style={styles.address} numberOfLines={1}>{item.address}</Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => Linking.openURL(`tel:${item.phone}`)}>
          <Ionicons name="call" size={16} color="#10b981" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${item.latitude},${item.longitude}`)}
        >
          <Ionicons name="navigate" size={16} color="#3b82f6" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={onOpen}>
          <Ionicons name="map-outline" size={16} color="#8b5cf6" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.newReqBtn} onPress={onNewRequest} activeOpacity={0.85}>
          <Ionicons name="basket" size={15} color="#fff" />
          <Text style={styles.newReqText}>New Request</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, margin: 16, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: '#e5e7eb' },
  searchInput: { flex: 1, fontSize: 14, color: '#1f2937', padding: 0 },

  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 14, padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, borderWidth: 1.5, borderColor: '#fde68a' },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  logo: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' },
  logoBadge: { position: 'absolute', bottom: -3, right: -3, backgroundColor: '#fff', borderRadius: 9, width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3b82f6' },
  logoBadgeText: { fontSize: 10, fontWeight: '800', color: '#3b82f6' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: '#1f2937', flexShrink: 1 },
  openBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  openText: { fontSize: 9, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  address: { fontSize: 12, color: '#6b7280', marginTop: 10 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  iconBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  newReqBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#10b981', borderRadius: 10, paddingVertical: 11 },
  newReqText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  empty: { alignItems: 'center', marginTop: 90, gap: 8, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#9ca3af' },
  emptyDesc: { fontSize: 14, color: '#cbd5e1', textAlign: 'center' },
});
