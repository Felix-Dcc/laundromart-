import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import StarRating from './StarRating';
import { isOpenNow } from './MapMarkerCallout';
import { haversineKm, formatDistance } from '../utils/location';

/**
 * Reusable "Laundry Provider" card shown across the order lifecycle
 * (confirmation, details, tracking). Soft elevation, rounded corners,
 * logo placeholder, rating, open/closed, optional distance, and
 * Call + Directions actions. Renders nothing when no provider is linked.
 */
export default function ProviderInfoCard({
  provider,
  coords,
  title = 'Laundry Provider',
  style,
  compact = false,
}) {
  if (!provider) return null;

  const openStatus = isOpenNow(provider.businessHours);
  const initial = (provider.name || '?').trim().charAt(0).toUpperCase();
  const distanceKm =
    coords && provider.latitude != null && provider.longitude != null
      ? haversineKm(coords.latitude, coords.longitude, provider.latitude, provider.longitude)
      : null;

  const openDirections = () => {
    if (provider.latitude != null && provider.longitude != null) {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${provider.latitude},${provider.longitude}`);
    }
  };

  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}

      <View style={styles.row}>
        {/* Logo / placeholder */}
        <LinearGradient
          colors={['#60a5fa', '#2563eb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logo}
        >
          <Ionicons name="storefront" size={22} color="#fff" />
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>{initial}</Text>
          </View>
        </LinearGradient>

        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>{provider.name}</Text>
            {openStatus !== null && (
              <View style={[styles.openBadge, { backgroundColor: openStatus ? '#d1fae5' : '#fee2e2' }]}>
                <View style={[styles.openDot, { backgroundColor: openStatus ? '#10b981' : '#ef4444' }]} />
                <Text style={[styles.openText, { color: openStatus ? '#065f46' : '#991b1b' }]}>
                  {openStatus ? 'Open' : 'Closed'}
                </Text>
              </View>
            )}
          </View>

          <StarRating rating={provider.rating || 0} size={13} showLabel count={provider.reviewCount} />

          <View style={styles.metaRow}>
            {!!provider.address && (
              <View style={styles.metaChip}>
                <Ionicons name="location-outline" size={13} color="#6b7280" />
                <Text style={styles.metaText} numberOfLines={1}>{provider.address}</Text>
              </View>
            )}
          </View>

          {distanceKm != null && (
            <View style={styles.metaChip}>
              <Ionicons name="navigate-outline" size={13} color="#3b82f6" />
              <Text style={[styles.metaText, { color: '#3b82f6', fontWeight: '700' }]}>
                {formatDistance(distanceKm)} away
              </Text>
            </View>
          )}
        </View>
      </View>

      {!compact && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.callBtn]}
            onPress={() => provider.phone && Linking.openURL(`tel:${provider.phone}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="call" size={16} color="#fff" />
            <Text style={styles.actionText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.dirBtn]}
            onPress={openDirections}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={16} color="#fff" />
            <Text style={styles.actionText}>Directions</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#dbeafe',
    elevation: 3,
    shadowColor: '#1e3a8a',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  title: { fontSize: 12, fontWeight: '800', color: '#3b82f6', letterSpacing: 0.5, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  logo: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  logoBadge: {
    position: 'absolute', bottom: -4, right: -4,
    backgroundColor: '#fff', borderRadius: 9, width: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#2563eb',
  },
  logoBadgeText: { fontSize: 10, fontWeight: '800', color: '#2563eb' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '800', color: '#1f2937', flexShrink: 1 },
  openBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openText: { fontSize: 10, fontWeight: '700' },
  metaRow: { marginTop: 4 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  metaText: { fontSize: 12, color: '#6b7280', flex: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 11 },
  callBtn: { backgroundColor: '#10b981' },
  dirBtn: { backgroundColor: '#3b82f6' },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
