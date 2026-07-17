import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function isOpenNow(businessHours) {
  if (!businessHours) return null;
  try {
    const match = businessHours.match(/(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;
    const toMinutes = (h, m, period) => {
      let hour = parseInt(h, 10);
      if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
      if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
      return hour * 60 + parseInt(m, 10);
    };
    const open = toMinutes(match[1], match[2], match[3]);
    const close = toMinutes(match[4], match[5], match[6]);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return nowMin >= open && nowMin < close;
  } catch {
    return null;
  }
}

export default function MapMarkerCallout({ provider }) {
  const openStatus = isOpenNow(provider.businessHours);

  return (
    <View style={styles.container}>
      <Text style={styles.name} numberOfLines={1}>{provider.businessName}</Text>

      <View style={styles.row}>
        <Ionicons name="star" size={12} color="#f59e0b" />
        <Text style={styles.rating}>
          {provider.avgRating > 0 ? provider.avgRating.toFixed(1) : 'New'}
          {provider.reviewCount > 0 && ` (${provider.reviewCount})`}
        </Text>
      </View>

      {provider.distanceKm != null && (
        <View style={styles.row}>
          <Ionicons name="location-sharp" size={12} color="#3b82f6" />
          <Text style={styles.distance}>{provider.distanceKm} km away</Text>
        </View>
      )}

      {provider.estimatedPickupMin != null && (
        <View style={styles.row}>
          <Ionicons name="bicycle-outline" size={12} color="#8b5cf6" />
          <Text style={styles.hours}>~{provider.estimatedPickupMin} min pickup</Text>
        </View>
      )}

      {provider.services && provider.services.length > 0 && (
        <View style={styles.servicesRow}>
          <Ionicons name="pricetag-outline" size={11} color="#6b7280" />
          <Text style={styles.services} numberOfLines={1}>
            {provider.services.slice(0, 3).join(' · ')}
          </Text>
        </View>
      )}

      <View style={styles.row}>
        <Ionicons name="time-outline" size={12} color="#6b7280" />
        <Text style={styles.hours}>{provider.businessHours}</Text>
      </View>

      {openStatus !== null && (
        <View style={[styles.statusBadge, openStatus ? styles.openBadge : styles.closedBadge]}>
          <View style={[styles.statusDot, { backgroundColor: openStatus ? '#10b981' : '#ef4444' }]} />
          <Text style={[styles.statusText, { color: openStatus ? '#065f46' : '#991b1b' }]}>
            {openStatus ? 'Open' : 'Closed'}
          </Text>
        </View>
      )}

      <Text style={styles.tap}>Tap for details</Text>
    </View>
  );
}

export { isOpenNow };

const styles = StyleSheet.create({
  container: {
    minWidth: 180,
    maxWidth: 240,
    padding: 10,
  },
  name: { fontSize: 14, fontWeight: '700', color: '#1f2937', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  rating: { fontSize: 12, color: '#4b5563' },
  distance: { fontSize: 12, color: '#3b82f6', fontWeight: '600' },
  hours: { fontSize: 11, color: '#6b7280' },
  servicesRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  services: { fontSize: 10, color: '#6b7280', flex: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    gap: 4,
    marginTop: 2,
    marginBottom: 2,
  },
  openBadge: { backgroundColor: '#d1fae5' },
  closedBadge: { backgroundColor: '#fee2e2' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },
  tap: { fontSize: 10, color: '#9ca3af', marginTop: 4, textAlign: 'center' },
});
