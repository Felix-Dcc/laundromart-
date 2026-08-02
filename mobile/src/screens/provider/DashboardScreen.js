import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ImageBackground,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { providerAPI } from '../../api/client';
import { formatCurrency, formatDate, formatStatus, getStatusColor } from '../../utils/helpers';
import StatusTimeline from '../../components/StatusTimeline';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';
import { IMAGES } from '../../theme/images';
import { subscribeToOrderFeed } from '../../services/realtime';

export default function ProviderDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadDashboard() {
    try {
      const res = await providerAPI.getDashboard();
      setData(res.data);
    } catch (error) {
      console.error('Provider dashboard error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { loadDashboard(); }, []));

  // Live: refresh the dashboard on any order change (rider steps, payments).
  useFocusEffect(useCallback(() => {
    const unsub = subscribeToOrderFeed(() => loadDashboard());
    return () => unsub && unsub();
  }, []));

  if (loading && !data) {
    return (
      <View style={styles.container}>
        <View style={styles.heroSkeleton} />
        <View style={styles.queueRow}>
          {[0, 1, 2].map((i) => <Skeleton key={i} width="31%" height={80} radius={12} />)}
        </View>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const stats = data?.stats || {};
  // Defaults keep the card rendering on older builds whose API response
  // predates the business metrics.
  const business = data?.business || { ordersToday: 0, revenueToday: 0, revenueWeek: 0, revenueMonth: 0, avgRating: 0, reviewCount: 0 };
  const queues = data?.queues || {};
  const businessName = user?.businessName || `${user?.firstName}'s Laundry`;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDashboard(); }} />}>
      {/* Hero welcome card */}
      <ImageBackground source={{ uri: IMAGES.promo }} style={styles.hero} imageStyle={styles.heroImg}>
        <LinearGradient colors={['rgba(25,135,84,0.82)', 'rgba(16,100,60,0.95)']} style={StyleSheet.absoluteFill} />
        <View style={styles.heroTop}>
          <View style={styles.heroUser}>
            <Avatar name={`${user?.firstName} ${user?.lastName}`} size={48} ring />
            <View>
              <Text style={styles.heroHi}>Welcome back!</Text>
              <Text style={styles.heroName}>{businessName}</Text>
            </View>
          </View>
          <View style={styles.heroIcons}>
            <TouchableOpacity onPress={logout} style={styles.heroIconBtn}>
              <Ionicons name="log-out-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatNum}>{(stats.incomingCount || 0) + (stats.inProgressCount || 0)}</Text>
            <Text style={styles.heroStatLabel}>Active Orders</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatNum}>{stats.completedCount || 0}</Text>
            <Text style={styles.heroStatLabel}>Completed</Text>
          </View>
        </View>
      </ImageBackground>

      {/* Earnings — this laundromat's own revenue */}
      <View style={styles.revenueCard}>
        <View style={styles.revenueHead}>
          <Ionicons name="cash-outline" size={16} color="#059669" />
          <Text style={styles.revenueTitle}>Earnings</Text>
          {business.avgRating > 0 && (
            <Text style={styles.revenueRating}>★ {business.avgRating.toFixed(1)} ({business.reviewCount})</Text>
          )}
        </View>
        <View style={styles.revenueRow}>
          <View style={styles.revenueCell}>
            <Text style={styles.revenueValue}>{formatCurrency(business.revenueToday)}</Text>
            <Text style={styles.revenueLabel}>Today</Text>
          </View>
          <View style={styles.revenueDivider} />
          <View style={styles.revenueCell}>
            <Text style={styles.revenueValue}>{formatCurrency(business.revenueWeek)}</Text>
            <Text style={styles.revenueLabel}>7 days</Text>
          </View>
          <View style={styles.revenueDivider} />
          <View style={styles.revenueCell}>
            <Text style={styles.revenueValue}>{formatCurrency(business.revenueMonth)}</Text>
            <Text style={styles.revenueLabel}>This month</Text>
          </View>
        </View>
        <Text style={styles.revenueFoot}>
          {business.ordersToday} order{business.ordersToday === 1 ? '' : 's'} placed today
        </Text>
      </View>

      {/* Queue summary cards */}
      <View style={styles.queueRow}>
        <TouchableOpacity style={[styles.queueCard, { borderTopColor: '#f59e0b' }]} onPress={() => navigation.navigate('Orders', { screen: 'OrderQueue' })}>
          <LinearGradient colors={['#fffbeb', '#fef3c7']} style={styles.queueIconWrap}>
            <Ionicons name="time-outline" size={20} color="#f59e0b" />
          </LinearGradient>
          <Text style={styles.queueNum}>{stats.pendingCount || 0}</Text>
          <Text style={styles.queueLabel}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.queueCard, { borderTopColor: '#3b82f6' }]} onPress={() => navigation.navigate('Orders', { screen: 'OrderQueue' })}>
          <LinearGradient colors={['#eff6ff', '#dbeafe']} style={styles.queueIconWrap}>
            <Ionicons name="sync-outline" size={20} color="#3b82f6" />
          </LinearGradient>
          <Text style={styles.queueNum}>{stats.inProgressCount || 0}</Text>
          <Text style={styles.queueLabel}>In Progress</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.queueCard, { borderTopColor: '#10b981' }]} onPress={() => navigation.navigate('Orders', { screen: 'OrderQueue' })}>
          <LinearGradient colors={['#ecfdf5', '#d1fae5']} style={styles.queueIconWrap}>
            <Ionicons name="checkmark-done-outline" size={20} color="#10b981" />
          </LinearGradient>
          <Text style={styles.queueNum}>{stats.completedCount || 0}</Text>
          <Text style={styles.queueLabel}>Completed</Text>
        </TouchableOpacity>
      </View>

      {/* Quick action */}
      <TouchableOpacity style={styles.queueBtn} onPress={() => navigation.navigate('Orders', { screen: 'OrderQueue' })}>
        <Ionicons name="layers-outline" size={22} color="#fff" />
        <Text style={styles.queueBtnText}>Open Order Queue</Text>
        <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>

      {/* ★ Verify Laundry — orders that just arrived and need weighing */}
      <Text style={styles.sectionTitle}>
        <Ionicons name="scale-outline" size={18} color="#8b5cf6" />  Verify Laundry {stats.awaitingVerifyCount ? `(${stats.awaitingVerifyCount})` : ''}
      </Text>
      {queues.toVerify?.length > 0 ? queues.toVerify.map((order) => (
        <TouchableOpacity key={order.id} style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: '#8b5cf6' }]} onPress={() => navigation.navigate('Orders', { screen: 'OrderDetails', params: { id: order.id } })}>
          <View style={styles.orderHeader}>
            <View style={styles.orderHeaderLeft}>
              <Avatar name={`${order.user?.firstName} ${order.user?.lastName}`} size={36} />
              <View>
                <Text style={styles.orderNum}>{order.requestNumber}</Text>
                <Text style={styles.orderCustomer}>{order.user?.firstName} {order.user?.lastName}</Text>
              </View>
            </View>
            <View style={styles.verifyPill}>
              <Ionicons name="scale-outline" size={12} color="#6d28d9" />
              <Text style={styles.verifyPillText}>Verify</Text>
            </View>
          </View>
          <View style={styles.orderMeta}>
            <View style={styles.orderChip}>
              <Ionicons name="shirt-outline" size={13} color="#6b7280" />
              <Text style={styles.orderChipText}>{order.laundryType}</Text>
            </View>
            <View style={styles.orderChip}>
              <Ionicons name="scale-outline" size={13} color="#6b7280" />
              <Text style={styles.orderChipText}>Est. {order.estimatedWeightKg} kg</Text>
            </View>
            <View style={styles.orderChip}>
              <Ionicons name="cash-outline" size={13} color="#059669" />
              <Text style={[styles.orderChipText, { color: '#059669', fontWeight: '700' }]}>{formatCurrency(order.estimatedAmount)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      )) : (
        <EmptyState
          icon="checkmark-circle-outline"
          title="Nothing to verify"
          subtitle="Orders that arrive at your laundromat will appear here for weight verification."
          tint="#10b981"
          style={{ paddingVertical: 32 }}
        />
      )}

      {/* In-progress preview */}
      <Text style={styles.sectionTitle}>
        <Ionicons name="sync-outline" size={18} color="#3b82f6" />  In Progress
      </Text>
      {queues.inProgress?.length > 0 ? queues.inProgress.map((order) => (
        <TouchableOpacity key={order.id} style={styles.orderCard} onPress={() => navigation.navigate('Orders', { screen: 'OrderDetails', params: { id: order.id } })}>
          <View style={styles.orderHeader}>
            <View style={styles.orderHeaderLeft}>
              <Avatar name={`${order.user?.firstName} ${order.user?.lastName}`} size={36} />
              <View>
                <Text style={styles.orderNum}>{order.requestNumber}</Text>
                <Text style={styles.orderCustomer}>{order.user?.firstName} {order.user?.lastName}</Text>
              </View>
            </View>
            <View style={[styles.badge, { backgroundColor: getStatusColor(order.status) }]}>
              <Text style={styles.badgeText}>{formatStatus(order.status)}</Text>
            </View>
          </View>
          <StatusTimeline currentStatus={order.status} compact />
        </TouchableOpacity>
      )) : (
        <EmptyState
          icon="water-outline"
          title="No orders in progress"
          subtitle="Orders being washed or processed will appear here."
          tint="#3b82f6"
          style={{ paddingVertical: 32 }}
        />
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  // Hero
  hero: { paddingTop: 50, paddingBottom: 18, paddingHorizontal: 18, overflow: 'hidden' },
  heroImg: { resizeMode: 'cover' },
  heroSkeleton: { height: 170, backgroundColor: '#d1fae5' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroUser: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroHi: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '500' },
  heroName: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 1 },
  heroIcons: { flexDirection: 'row', gap: 8 },
  heroIconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  heroStatsRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, marginTop: 18, paddingVertical: 14, paddingHorizontal: 20 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatNum: { fontSize: 26, fontWeight: '800', color: '#fff' },
  heroStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },

  // Queue cards
  revenueCard: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 14, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#eef2f7', elevation: 1, shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  revenueHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  revenueTitle: { fontSize: 14, fontWeight: '800', color: '#111827', flex: 1 },
  revenueRating: { fontSize: 12, fontWeight: '700', color: '#f59e0b' },
  revenueRow: { flexDirection: 'row', alignItems: 'center' },
  revenueCell: { flex: 1, alignItems: 'center' },
  revenueDivider: { width: 1, height: 32, backgroundColor: '#f1f5f9' },
  revenueValue: { fontSize: 16, fontWeight: '800', color: '#059669' },
  revenueLabel: { fontSize: 11.5, color: '#6b7280', marginTop: 2 },
  revenueFoot: { fontSize: 12, color: '#6b7280', textAlign: 'center', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },

  queueRow: { flexDirection: 'row', paddingHorizontal: 10, gap: 8, marginTop: 16 },
  queueCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', borderTopWidth: 3, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  queueIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  queueNum: { fontSize: 26, fontWeight: '800', color: '#1f2937' },
  queueLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600', marginTop: 2 },

  queueBtn: { flexDirection: 'row', backgroundColor: '#198754', marginHorizontal: 14, marginTop: 14, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', gap: 8 },
  queueBtnText: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginHorizontal: 14, marginTop: 20, marginBottom: 8 },

  // Order cards
  orderCard: { backgroundColor: '#fff', marginHorizontal: 14, marginBottom: 8, borderRadius: 14, padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderNum: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  verifyPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f5f3ff', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10 },
  verifyPillText: { color: '#6d28d9', fontSize: 11, fontWeight: '800' },
  orderCustomer: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  orderMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, marginBottom: 4 },
  orderChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, gap: 4 },
  orderChipText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },
  orderInfo: { fontSize: 12, color: '#4b5563', marginTop: 2 },
});
