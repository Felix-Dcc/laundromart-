import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ImageBackground,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { adminAPI } from '../../api/client';
import { formatCurrency, formatDate, formatStatus, getStatusColor } from '../../utils/helpers';
import Avatar from '../../components/Avatar';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';
import { IMAGES } from '../../theme/images';

export default function AdminDashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dispatch, setDispatch] = useState(null);
  const [savingDispatch, setSavingDispatch] = useState(false);

  async function loadDashboard() {
    try {
      const res = await adminAPI.getDashboard();
      setData(res.data);
    } catch (error) {
      console.error('Admin dashboard error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
    try {
      const s = await adminAPI.getDispatchSettings();
      setDispatch(s.data);
    } catch (e) { /* ignore */ }
  }

  async function patchDispatch(patch, bounds) {
    if (savingDispatch || !dispatch) return;
    for (const [k, b] of Object.entries(bounds || {})) {
      if (patch[k] != null && (patch[k] < b[0] || patch[k] > b[1])) return;
    }
    const prev = dispatch;
    setDispatch({ ...dispatch, ...patch });
    setSavingDispatch(true);
    try {
      const res = await adminAPI.updateDispatchSettings(patch);
      setDispatch((d) => ({ ...d, ...res.data }));
    } catch (e) {
      setDispatch(prev);
    } finally {
      setSavingDispatch(false);
    }
  }

  useFocusEffect(useCallback(() => { loadDashboard(); }, []));

  if (loading && !data) {
    return (
      <View style={styles.container}>
        <Skeleton width="100%" height={170} radius={0} />
        <View style={styles.statsRow}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} width="48%" height={70} radius={10} style={{ marginBottom: 8 }} />)}
        </View>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const stats = data?.stats || {};

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDashboard(); }} />}>
      {/* Hero */}
      <ImageBackground source={{ uri: IMAGES.homeBanner }} style={styles.hero} imageStyle={styles.heroImg}>
        <LinearGradient colors={['rgba(220,53,69,0.82)', 'rgba(180,30,50,0.95)']} style={StyleSheet.absoluteFill} />
        <View style={styles.heroTop}>
          <View style={styles.heroUser}>
            <Avatar name={`${user?.firstName} ${user?.lastName}`} size={48} ring />
            <View>
              <Text style={styles.heroHi}>Admin Dashboard</Text>
              <Text style={styles.heroSub}>Manage your operations</Text>
            </View>
          </View>
          <TouchableOpacity onPress={logout} style={styles.heroIconBtn}>
            <Ionicons name="log-out-outline" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}>
            <Text style={styles.heroStatNum}>{formatCurrency(stats.totalRevenue || 0)}</Text>
            <Text style={styles.heroStatLabel}>Revenue</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatNum}>{stats.totalRequests || 0}</Text>
            <Text style={styles.heroStatLabel}>Total Orders</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Text style={styles.heroStatNum}>{stats.totalUsers || 0}</Text>
            <Text style={styles.heroStatLabel}>Users</Text>
          </View>
        </View>
      </ImageBackground>

      {/* Primary Stats */}
      <View style={styles.statsRow}>
        <StatCard icon="time-outline" num={stats.pendingRequests || 0} label="Pending" color="#f59e0b" bgColors={['#fffbeb', '#fef3c7']} />
        <StatCard icon="sync-outline" num={stats.inProcessRequests || 0} label="Processing" color="#06b6d4" bgColors={['#ecfeff', '#cffafe']} />
        <StatCard icon="checkmark-done-outline" num={stats.completedRequests || 0} label="Completed" color="#10b981" bgColors={['#ecfdf5', '#d1fae5']} />
        <StatCard icon="people-outline" num={stats.activeUsers || 0} label="Active Users" color="#3b82f6" bgColors={['#eff6ff', '#dbeafe']} />
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        <ActionButton icon="time-outline" color="#f59e0b" bgColors={['#fffbeb', '#fef3c7']} label="Pending Orders" onPress={() => navigation.navigate('Orders', { screen: 'AllOrders', params: { status: 'pending' } })} />
        <ActionButton icon="list-outline" color="#3b82f6" bgColors={['#eff6ff', '#dbeafe']} label="All Orders" onPress={() => navigation.navigate('Orders', { screen: 'AllOrders' })} />
        <ActionButton icon="people-outline" color="#8b5cf6" bgColors={['#f5f3ff', '#ede9fe']} label="Users" onPress={() => navigation.navigate('Users', { screen: 'AllUsers' })} />
        <ActionButton icon="pricetag-outline" color="#10b981" bgColors={['#ecfdf5', '#d1fae5']} label="Pricing" onPress={() => navigation.navigate('More', { screen: 'Pricing' })} />
        <ActionButton icon="card-outline" color="#1B7BF7" bgColors={['#eff6ff', '#dbeafe']} label="Transactions" onPress={() => navigation.navigate('More', { screen: 'Transactions' })} />
        <ActionButton icon="document-text-outline" color="#6f42c1" bgColors={['#f5f3ff', '#ede9fe']} label="Audit Logs" onPress={() => navigation.navigate('More', { screen: 'AuditLogs' })} />
      </View>

      {/* Dispatch & Routing Settings */}
      <Text style={styles.sectionTitle}>Dispatch & Routing</Text>
      {dispatch && (
        <View style={styles.dispatchPanel}>
          <Stepper
            label="Max active tasks / rider"
            hint="Pickups a rider carries at once"
            value={dispatch.maxActiveTasks}
            onChange={(d) => patchDispatch({ maxActiveTasks: dispatch.maxActiveTasks + d }, { maxActiveTasks: [1, 10] })}
            saving={savingDispatch}
          />
          <View style={styles.divider} />
          <Stepper
            label="Max pickup radius"
            hint="Available orders within this distance"
            value={dispatch.maxPickupRadiusKm}
            unit="km"
            step={5}
            onChange={(d) => patchDispatch({ maxPickupRadiusKm: dispatch.maxPickupRadiusKm + d * 5 }, { maxPickupRadiusKm: [1, 200] })}
            saving={savingDispatch}
          />
          <View style={styles.divider} />
          <Stepper
            label="Route distance limit"
            hint="Max total route length"
            value={dispatch.distanceLimitKm}
            unit="km"
            step={10}
            onChange={(d) => patchDispatch({ distanceLimitKm: dispatch.distanceLimitKm + d * 10 }, { distanceLimitKm: [1, 500] })}
            saving={savingDispatch}
          />
          <View style={styles.divider} />
          <View style={styles.optRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dispatchLabel}>Optimization preference</Text>
              <Text style={styles.dispatchHint}>Shortest path priority</Text>
            </View>
            <View style={styles.toggle}>
              {['distance', 'duration'].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.toggleBtn, dispatch.routeOptimization === opt && styles.toggleBtnActive]}
                  onPress={() => patchDispatch({ routeOptimization: opt })}
                  disabled={savingDispatch}
                >
                  <Text style={[styles.toggleText, dispatch.routeOptimization === opt && styles.toggleTextActive]}>
                    {opt === 'distance' ? 'Distance' : 'Time'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Recent Orders */}
      <Text style={styles.sectionTitle}>Recent Orders</Text>
      {data?.recentRequests?.slice(0, 5).map((req) => (
        <TouchableOpacity key={req.id} style={styles.orderCard} onPress={() => navigation.navigate('Orders', { screen: 'OrderDetails', params: { id: req.id } })}>
          <View style={styles.orderHeader}>
            <Text style={styles.orderNum}>{req.requestNumber}</Text>
            <View style={[styles.badge, { backgroundColor: getStatusColor(req.status) }]}>
              <Text style={styles.badgeText}>{formatStatus(req.status)}</Text>
            </View>
          </View>
          <Text style={styles.orderCustomer}>{req.user?.firstName} {req.user?.lastName}</Text>
          <Text style={styles.orderInfo}>{req.laundryType} • {formatCurrency(req.totalAmount)}</Text>
        </TouchableOpacity>
      ))}

      {/* Recent Users */}
      <Text style={styles.sectionTitle}>Recent Users</Text>
      {data?.recentUsers?.map((u) => (
        <TouchableOpacity key={u.id} style={styles.userCard} onPress={() => navigation.navigate('Users', { screen: 'UserDetails', params: { id: u.id } })}>
          <Avatar name={`${u.firstName} ${u.lastName}`} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{u.firstName} {u.lastName}</Text>
            <Text style={styles.userEmail}>{u.email}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: getStatusColor(u.status) }]}>
            <Text style={styles.badgeText}>{formatStatus(u.status)}</Text>
          </View>
        </TouchableOpacity>
      ))}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function StatCard({ icon, num, label, color, bgColors }) {
  return (
    <View style={styles.statCard}>
      <LinearGradient colors={bgColors} style={styles.statIconWrap}>
        <Ionicons name={icon} size={18} color={color} />
      </LinearGradient>
      <Text style={styles.statNum}>{num}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionButton({ icon, color, bgColors, label, onPress }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} activeOpacity={0.7}>
      <LinearGradient colors={bgColors} style={styles.actionIconWrap}>
        <Ionicons name={icon} size={24} color={color} />
      </LinearGradient>
      <Text style={styles.actionText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Stepper({ label, hint, value, unit, step = 1, onChange, saving }) {
  return (
    <View style={styles.stepperRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.dispatchLabel}>{label}</Text>
        {!!hint && <Text style={styles.dispatchHint}>{hint}</Text>}
      </View>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(-1)} disabled={saving}>
          <Ionicons name="remove" size={20} color="#dc3545" />
        </TouchableOpacity>
        <Text style={styles.stepValue}>{value}{unit ? ` ${unit}` : ''}</Text>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(1)} disabled={saving}>
          <Ionicons name="add" size={20} color="#198754" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  // Hero
  hero: { paddingTop: 50, paddingBottom: 18, paddingHorizontal: 18, overflow: 'hidden' },
  heroImg: { resizeMode: 'cover' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroUser: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  heroHi: { color: '#fff', fontSize: 20, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  heroIconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  heroStatsRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, marginTop: 18, paddingVertical: 14, paddingHorizontal: 10 },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatNum: { fontSize: 20, fontWeight: '800', color: '#fff' },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.25)' },

  // Stats
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, paddingTop: 16 },
  statCard: { width: '47%', backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, marginBottom: 4 },
  statIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statNum: { fontSize: 22, fontWeight: '800', color: '#1f2937' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 2, fontWeight: '600' },

  // Actions
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#212529', marginHorizontal: 16, marginTop: 20, marginBottom: 10 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 10 },
  actionBtn: { width: '47%', backgroundColor: '#fff', borderRadius: 14, padding: 16, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  actionIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionText: { fontSize: 12, color: '#212529', fontWeight: '700', textAlign: 'center' },

  // Dispatch
  dispatchPanel: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { height: 1, backgroundColor: '#f1f5f9' },
  dispatchLabel: { fontSize: 14, fontWeight: '700', color: '#212529' },
  dispatchHint: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#dee2e6', alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 16, fontWeight: '800', color: '#212529', minWidth: 52, textAlign: 'center' },
  toggle: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 9, padding: 3 },
  toggleBtn: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 7 },
  toggleBtnActive: { backgroundColor: '#dc3545' },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  toggleTextActive: { color: '#fff' },

  // Orders
  orderCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 12, padding: 14, elevation: 1 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNum: { fontSize: 14, fontWeight: '700', color: '#dc3545' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  orderCustomer: { fontSize: 13, fontWeight: '600', color: '#212529', marginTop: 4 },
  orderInfo: { fontSize: 12, color: '#6c757d', marginTop: 2 },

  // Users
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 6, borderRadius: 12, padding: 12, elevation: 1, gap: 12 },
  userName: { fontSize: 14, fontWeight: '600', color: '#212529' },
  userEmail: { fontSize: 12, color: '#6c757d' },
});
