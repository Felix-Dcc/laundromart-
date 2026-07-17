import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { riderAPI } from '../../api/client';
import { formatCurrency } from '../../utils/helpers';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';

export default function EarningsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [earnings, setEarnings] = useState(null);

  useEffect(() => { loadEarnings(); }, []);

  const loadEarnings = async () => {
    try {
      const response = await riderAPI.getEarnings();
      setEarnings(response.data);
    } catch (error) {
      console.error('Load earnings error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.statsRow}>
          <Skeleton width="48%" height={100} radius={14} />
          <Skeleton width="48%" height={100} radius={14} />
        </View>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const total = parseFloat(earnings?.lifetimeStats?.totalEarnings || 0);
  const pickups = earnings?.lifetimeStats?.totalPickups || 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadEarnings(); }} />}
    >
      {/* Stat Cards */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <LinearGradient colors={['#ecfdf5', '#d1fae5']} style={styles.statIconWrap}>
            <Ionicons name="cash-outline" size={22} color="#10b981" />
          </LinearGradient>
          <Text style={styles.statValue}>{formatCurrency(total)}</Text>
          <Text style={styles.statLabel}>Total Earnings</Text>
        </View>
        <View style={styles.statCard}>
          <LinearGradient colors={['#eff6ff', '#dbeafe']} style={styles.statIconWrap}>
            <Ionicons name="bicycle-outline" size={22} color="#3b82f6" />
          </LinearGradient>
          <Text style={styles.statValue}>{pickups}</Text>
          <Text style={styles.statLabel}>Total Pickups</Text>
        </View>
      </View>

      {/* Completed Pickups */}
      <Text style={styles.sectionTitle}>Completed Pickups ({earnings?.totalCount || 0})</Text>

      {earnings?.completedPickups?.length > 0 ? (
        earnings.completedPickups.map((pickup) => (
          <View key={pickup.id} style={styles.pickupCard}>
            <View style={styles.pickupTop}>
              <Avatar name={`${pickup.order.user.firstName} ${pickup.order.user.lastName}`} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pickupNum}>Order #{pickup.order.requestNumber}</Text>
                <Text style={styles.pickupCustomer}>{pickup.order.user.firstName} {pickup.order.user.lastName}</Text>
              </View>
              <Text style={styles.pickupEarnings}>+{formatCurrency(parseFloat(pickup.riderEarnings))}</Text>
            </View>
            <View style={styles.pickupMeta}>
              {pickup.distanceKm != null && (
                <View style={styles.metaChip}>
                  <Ionicons name="navigate-outline" size={12} color="#6b7280" />
                  <Text style={styles.metaText}>{pickup.distanceKm.toFixed(1)} km</Text>
                </View>
              )}
              {pickup.deliveredAt && (
                <View style={styles.metaChip}>
                  <Ionicons name="time-outline" size={12} color="#6b7280" />
                  <Text style={styles.metaText}>
                    {new Date(pickup.deliveredAt).toLocaleDateString()} {new Date(pickup.deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              )}
            </View>
          </View>
        ))
      ) : (
        <EmptyState
          icon="cash-outline"
          title="No completed pickups yet"
          subtitle="Your completed pickups and earnings will appear here."
          tint="#10b981"
        />
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center',
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  statIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1f2937' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2, fontWeight: '600' },

  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#212529', marginHorizontal: 16, marginTop: 20, marginBottom: 10 },

  pickupCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 14,
    elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  pickupTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickupNum: { fontSize: 14, fontWeight: '700', color: '#212529' },
  pickupCustomer: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  pickupEarnings: { fontSize: 16, fontWeight: '800', color: '#10b981' },

  pickupMeta: { flexDirection: 'row', gap: 12, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: '#6b7280' },
});
