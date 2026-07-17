import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { analyticsAPI } from '../../api/client';
import { formatCurrency, formatStatus, getStatusColor } from '../../utils/helpers';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week',  label: '7 Days' },
  { key: 'month', label: 'Month' },
  { key: 'all',   label: 'All Time' },
];

const screenWidth = Dimensions.get('window').width;

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const [range, setRange] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const accentColor = user?.userType === 'admin' ? '#dc3545' : '#198754';

  async function loadAnalytics() {
    try {
      const res = await analyticsAPI.get(range);
      setData(res.data);
    } catch (error) {
      console.error('Analytics error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { setLoading(true); loadAnalytics(); }, [range]));

  if (loading) return (
    <View style={styles.container}>
      <View style={{ padding: 16 }}>
        <Skeleton width="100%" height={80} radius={12} />
        <Skeleton width="100%" height={120} radius={12} style={{ marginTop: 12 }} />
        <SkeletonCard style={{ marginHorizontal: 0 }} />
      </View>
    </View>
  );
  if (!data) return <View style={styles.center}><Text style={styles.errorText}>Failed to load analytics</Text></View>;

  const s = data.summary;
  const r = data.revenue;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAnalytics(); }} />}>

      {/* ── Time Range Selector ── */}
      <View style={styles.rangeRow}>
        {RANGES.map((rng) => (
          <TouchableOpacity
            key={rng.key}
            style={[styles.rangeChip, range === rng.key && { backgroundColor: accentColor, borderColor: accentColor }]}
            onPress={() => setRange(rng.key)}
          >
            <Text style={[styles.rangeText, range === rng.key && { color: '#fff', fontWeight: '700' }]}>{rng.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Summary Cards ── */}
      <View style={styles.cardGrid}>
        <StatCard icon="receipt-outline" label="Total Orders" value={s.totalOrders} color="#3b82f6" />
        <StatCard icon="checkmark-done-outline" label="Delivered" value={s.delivered} color="#10b981" />
        <StatCard icon="close-circle-outline" label="Cancelled" value={s.cancelled} color="#ef4444" />
        <StatCard icon="time-outline" label="Pending" value={s.pending} color="#f59e0b" />
      </View>

      {/* ── Rates Bar ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Performance</Text>
        <RateBar label="Completion Rate" value={s.completionRate} color="#10b981" />
        <RateBar label="Cancellation Rate" value={s.cancellationRate} color="#ef4444" />
      </View>

      {/* ── Revenue ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Revenue</Text>
        <View style={styles.revenueRow}>
          <View style={styles.revenueItem}>
            <Text style={styles.revenueValue}>{formatCurrency(r.total)}</Text>
            <Text style={styles.revenueLabel}>Total Revenue</Text>
          </View>
          <View style={styles.revenueDivider} />
          <View style={styles.revenueItem}>
            <Text style={styles.revenueValue}>{formatCurrency(r.average)}</Text>
            <Text style={styles.revenueLabel}>Avg Order</Text>
          </View>
          <View style={styles.revenueDivider} />
          <View style={styles.revenueItem}>
            <Text style={styles.revenueValue}>{r.paidOrders}</Text>
            <Text style={styles.revenueLabel}>Paid Orders</Text>
          </View>
        </View>
      </View>

      {/* ── Daily Trend (Bar Chart) ── */}
      {data.dailyOrders.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Daily Orders</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chartContainer}>
              {data.dailyOrders.map((day, idx) => {
                const maxOrders = Math.max(...data.dailyOrders.map((d) => d.orders), 1);
                const barHeight = Math.max(4, (day.orders / maxOrders) * 120);
                const deliveredHeight = Math.max(0, (day.delivered / maxOrders) * 120);
                return (
                  <View key={idx} style={styles.barGroup}>
                    <Text style={styles.barValue}>{day.orders}</Text>
                    <View style={styles.barStack}>
                      <View style={[styles.bar, { height: barHeight, backgroundColor: '#dbeafe' }]}>
                        <View style={[styles.barFill, { height: deliveredHeight, backgroundColor: '#3b82f6' }]} />
                      </View>
                    </View>
                    <Text style={styles.barLabel}>{formatDayLabel(day.date)}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
              <Text style={styles.legendText}>Delivered</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#dbeafe' }]} />
              <Text style={styles.legendText}>Other</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Status Breakdown ── */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status Breakdown</Text>
        {data.statusBreakdown.map((item) => (
          <View key={item.status} style={styles.breakdownRow}>
            <View style={[styles.breakdownDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={styles.breakdownLabel}>{formatStatus(item.status)}</Text>
            <View style={styles.breakdownBarBg}>
              <View style={[styles.breakdownBarFill, { width: `${Math.max(5, (item.count / (s.totalOrders || 1)) * 100)}%`, backgroundColor: getStatusColor(item.status) }]} />
            </View>
            <Text style={styles.breakdownCount}>{item.count}</Text>
          </View>
        ))}
      </View>

      {/* ── Popular Services ── */}
      {data.serviceBreakdown.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Popular Services</Text>
          {data.serviceBreakdown.map((item, idx) => (
            <View key={item.service} style={styles.serviceRow}>
              <View style={[styles.serviceRank, { backgroundColor: idx === 0 ? '#f59e0b' : '#e5e7eb' }]}>
                <Text style={[styles.serviceRankText, idx === 0 && { color: '#fff' }]}>{idx + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceName}>{item.service}</Text>
                <Text style={styles.serviceRevenue}>{formatCurrency(item.revenue)} revenue</Text>
              </View>
              <Text style={styles.serviceCount}>{item.count} orders</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Admin-only: User Stats ── */}
      {data.userStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>User Stats</Text>
          <View style={styles.cardGrid}>
            <MiniStat label="Total Users" value={data.userStats.totalUsers} color="#3b82f6" />
            <MiniStat label="New Users" value={data.userStats.newUsers} color="#10b981" />
            <MiniStat label="Active Customers" value={data.userStats.activeCustomers} color="#8b5cf6" />
          </View>
        </View>
      )}

      {/* ── Provider-only: Review Stats ── */}
      {data.reviewStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Reviews</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={styles.ratingBig}>
              <Ionicons name="star" size={24} color="#f59e0b" />
              <Text style={styles.ratingBigText}>{data.reviewStats.avgRating || '–'}</Text>
            </View>
            <Text style={styles.ratingCount}>{data.reviewStats.totalReviews} reviews</Text>
          </View>
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

// ── Sub-components ──

function StatCard({ icon, label, value, color }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function RateBar({ label, value, color }) {
  return (
    <View style={styles.rateRow}>
      <Text style={styles.rateLabel}>{label}</Text>
      <View style={styles.rateBarBg}>
        <View style={[styles.rateBarFill, { width: `${Math.min(value, 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.rateValue, { color }]}>{value}%</Text>
    </View>
  );
}

function formatDayLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Styles ──
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#6b7280', fontSize: 16 },

  rangeRow: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4, gap: 8 },
  rangeChip: { flex: 1, borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: '#fff' },
  rangeText: { fontSize: 13, color: '#6b7280', fontWeight: '500' },

  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8, marginTop: 8 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 12, padding: 14, borderLeftWidth: 4, elevation: 1, alignItems: 'flex-start', gap: 2 },
  statValue: { fontSize: 26, fontWeight: '800', color: '#1f2937' },
  statLabel: { fontSize: 11, color: '#6b7280', fontWeight: '500' },

  card: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 12, borderRadius: 14, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 12 },

  revenueRow: { flexDirection: 'row', alignItems: 'center' },
  revenueItem: { flex: 1, alignItems: 'center' },
  revenueValue: { fontSize: 20, fontWeight: '800', color: '#059669' },
  revenueLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  revenueDivider: { width: 1, height: 36, backgroundColor: '#e5e7eb' },

  // Bar chart
  chartContainer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingVertical: 8, minWidth: screenWidth - 60 },
  barGroup: { flex: 1, alignItems: 'center', minWidth: 36 },
  barValue: { fontSize: 10, color: '#6b7280', fontWeight: '600', marginBottom: 2 },
  barStack: { width: 24, justifyContent: 'flex-end' },
  bar: { width: 24, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: 24, borderRadius: 0 },
  barLabel: { fontSize: 9, color: '#9ca3af', marginTop: 4, textAlign: 'center' },
  legendRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#6b7280' },

  // Status breakdown
  breakdownRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  breakdownDot: { width: 10, height: 10, borderRadius: 5 },
  breakdownLabel: { width: 80, fontSize: 13, color: '#374151', fontWeight: '500' },
  breakdownBarBg: { flex: 1, height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
  breakdownBarFill: { height: 8, borderRadius: 4 },
  breakdownCount: { width: 28, fontSize: 13, fontWeight: '700', color: '#374151', textAlign: 'right' },

  // Service breakdown
  serviceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  serviceRank: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  serviceRankText: { fontSize: 12, fontWeight: '800', color: '#374151' },
  serviceName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  serviceRevenue: { fontSize: 11, color: '#6b7280' },
  serviceCount: { fontSize: 13, fontWeight: '700', color: '#3b82f6' },

  // Rates
  rateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  rateLabel: { width: 110, fontSize: 13, color: '#374151' },
  rateBarBg: { flex: 1, height: 10, backgroundColor: '#f1f5f9', borderRadius: 5, overflow: 'hidden' },
  rateBarFill: { height: 10, borderRadius: 5 },
  rateValue: { width: 44, fontSize: 14, fontWeight: '700', textAlign: 'right' },

  // Mini stats
  miniStat: { flex: 1, minWidth: '30%', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 10, padding: 12 },
  miniStatValue: { fontSize: 22, fontWeight: '800' },
  miniStatLabel: { fontSize: 10, color: '#6b7280', marginTop: 2, textAlign: 'center' },

  // Review stats
  ratingBig: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ratingBigText: { fontSize: 32, fontWeight: '800', color: '#1f2937' },
  ratingCount: { fontSize: 14, color: '#6b7280' },
});
