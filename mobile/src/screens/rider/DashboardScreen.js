import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { riderAPI } from '../../api/client';
import { useRider } from '../../context/RiderContext';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { metaFor } from '../../utils/orderStatus';

// Delivery-leg statuses that mean the rider has an active delivery in progress.
const DELIVERY_PHASE = ['delivery_rider_assigned', 'rider_to_laundromat', 'collected_from_laundromat', 'out_for_delivery', 'rider_arrived_at_customer'];

export default function RiderDashboardScreen({ navigation }) {
  const { user } = useAuth();
  const { activeTask, activeTaskCount, maxActiveTasks, canAcceptMore, riderStatus, refresh, forceFetchActiveTask } = useRider();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rider, setRider] = useState(null);
  const [isOnline, setIsOnline] = useState(false);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [availableDeliveries, setAvailableDeliveries] = useState([]);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [limitReached, setLimitReached] = useState(false);
  const lastRiderStatusRef = useRef(riderStatus);

  const loadDataRef = useRef(null);
  loadDataRef.current = async () => {
    try {
      const statusResponse = await riderAPI.getStatus();
      const currentStatus = statusResponse.data.rider?.riderStatus;

      setRider(prev => {
        if (prev?.riderStatus !== currentStatus) return statusResponse.data.rider;
        return prev;
      });
      setIsOnline(prev => {
        const newIsOnline = currentStatus === 'online';
        return prev !== newIsOnline ? newIsOnline : prev;
      });

      if (lastRiderStatusRef.current !== currentStatus && currentStatus !== 'busy') {
        lastRiderStatusRef.current = currentStatus;
        await refresh();
      } else if (currentStatus === 'busy') {
        lastRiderStatusRef.current = currentStatus;
      }

      if (currentStatus === 'online') {
        try {
          const ordersResponse = await riderAPI.getAvailableOrders();
          setAvailableOrders(ordersResponse.data.orders || []);
          setLimitReached(!!ordersResponse.data.limitReached);
        } catch (error) {
          console.error('Load available orders error:', error);
          setAvailableOrders([]);
        }
        try {
          const delivResponse = await riderAPI.getAvailableDeliveries();
          setAvailableDeliveries(delivResponse.data.orders || []);
        } catch (error) {
          setAvailableDeliveries([]);
        }
      } else {
        setAvailableOrders(prev => prev.length > 0 ? [] : prev);
        setAvailableDeliveries(prev => prev.length > 0 ? [] : prev);
        setLimitReached(false);
      }

      // Detect an active delivery (return leg) so we can surface a banner.
      try {
        const activeRes = await riderAPI.getActiveOrder();
        const o = activeRes.data.order;
        setActiveDelivery(o && DELIVERY_PHASE.includes(o.status) ? o : null);
      } catch (error) {
        setActiveDelivery(null);
      }
    } catch (error) {
      console.error('Load data error:', error);
      if (error.response?.status !== 401 && !refreshing) {
        Alert.alert('Error', error.message || 'Failed to load data.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDataRef.current();
    const interval = setInterval(() => {
      if (riderStatus === 'online' || riderStatus === null) {
        loadDataRef.current();
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [riderStatus, refresh]);

  const handleToggleStatus = async () => {
    try {
      if (isOnline) {
        await riderAPI.goOffline();
        setIsOnline(false);
        setAvailableOrders([]);
        Alert.alert('Success', 'You are now offline.');
      } else {
        await riderAPI.goOnline();
        setIsOnline(true);
        await refresh();
        Alert.alert('Success', 'You are now online and available for pickups.');
      }
      loadDataRef.current();
    } catch (error) {
      console.error('Toggle status error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update status.');
    }
  };

  const handleAcceptOrder = async (orderId) => {
    Alert.alert('Accept Order', 'Are you sure you want to accept this order?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          try {
            await riderAPI.acceptOrder(orderId);
            await refresh();
            navigation.navigate('Tasks', { screen: 'ActiveTasks' });
            loadDataRef.current();
          } catch (error) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to accept order.');
          }
        },
      },
    ]);
  };

  const handleViewTasks = () => {
    navigation.navigate('Tasks', { screen: 'ActiveTasks' });
  };

  const openDelivery = (orderId) => {
    navigation.navigate('Tasks', { screen: 'DeliveryDetails', params: { orderId } });
  };

  const handleAcceptDelivery = (orderId) => {
    Alert.alert('Accept Delivery', 'Take this delivery back to the customer?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Accept',
        onPress: async () => {
          try {
            await riderAPI.acceptDelivery(orderId);
            loadDataRef.current();
            openDelivery(orderId);
          } catch (error) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to accept delivery.');
          }
        },
      },
    ]);
  };

  const handleDeclineDelivery = async (orderId) => {
    try {
      await riderAPI.declineDelivery(orderId);
      setAvailableDeliveries((prev) => prev.filter((o) => o.id !== orderId));
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to decline delivery.');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Skeleton width="100%" height={180} radius={0} />
        <View style={styles.statsRow}>
          <Skeleton width="47%" height={90} radius={14} />
          <Skeleton width="47%" height={90} radius={14} />
        </View>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDataRef.current(); }} />}
    >
      {/* Status Toggle Card */}
      <LinearGradient
        colors={isOnline ? ['#059669', '#10b981'] : ['#4b5563', '#374151']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          <View style={styles.heroUser}>
            <Avatar name={`${user?.firstName} ${user?.lastName}`} size={52} ring />
            <View>
              <Text style={styles.heroHi}>{user?.firstName} {user?.lastName}</Text>
              <View style={styles.statusPill}>
                <View style={[styles.statusDot, { backgroundColor: isOnline ? '#34d399' : '#9ca3af' }]} />
                <Text style={styles.statusPillText}>{isOnline ? 'Online' : 'Offline'}</Text>
              </View>
            </View>
          </View>
          <TouchableOpacity style={styles.toggleBtn} onPress={handleToggleStatus} activeOpacity={0.85}>
            <Text style={styles.toggleBtnText}>{isOnline ? 'Go Offline' : 'Go Online'}</Text>
          </TouchableOpacity>
        </View>

        {/* Stats inside hero */}
        <View style={styles.heroStatsRow}>
          <View style={styles.heroStat}>
            <Ionicons name="bicycle-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.heroStatNum}>{rider?.totalPickups || 0}</Text>
            <Text style={styles.heroStatLabel}>Pickups</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Ionicons name="cash-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.heroStatNum}>${parseFloat(rider?.totalEarnings || 0).toFixed(0)}</Text>
            <Text style={styles.heroStatLabel}>Earnings</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStat}>
            <Ionicons name="list-outline" size={18} color="rgba(255,255,255,0.8)" />
            <Text style={styles.heroStatNum}>{activeTaskCount}/{maxActiveTasks}</Text>
            <Text style={styles.heroStatLabel}>Active</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Active Tasks banner */}
      {activeTaskCount > 0 && (
        <TouchableOpacity style={styles.tasksBanner} onPress={handleViewTasks} activeOpacity={0.85}>
          <View style={styles.tasksBannerLeft}>
            <LinearGradient colors={['#3b82f6', '#2563eb']} style={styles.tasksBannerIcon}>
              <Ionicons name="list" size={18} color="#fff" />
            </LinearGradient>
            <View>
              <Text style={styles.tasksBannerTitle}>
                {activeTaskCount} active task{activeTaskCount !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.tasksBannerSub}>Tap to view your route</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#3b82f6" />
        </TouchableOpacity>
      )}

      {/* Active Delivery banner */}
      {activeDelivery && (
        <TouchableOpacity style={[styles.tasksBanner, { borderColor: '#bae6fd' }]} onPress={() => openDelivery(activeDelivery.id)} activeOpacity={0.85}>
          <View style={styles.tasksBannerLeft}>
            <LinearGradient colors={['#0ea5e9', '#0284c7']} style={styles.tasksBannerIcon}>
              <Ionicons name="cube" size={18} color="#fff" />
            </LinearGradient>
            <View>
              <Text style={styles.tasksBannerTitle}>Active delivery · #{activeDelivery.requestNumber}</Text>
              <Text style={styles.tasksBannerSub}>{metaFor(activeDelivery.status).label} — tap to continue</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#0ea5e9" />
        </TouchableOpacity>
      )}

      {/* Available Delivery Requests */}
      {isOnline && availableDeliveries.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="home-outline" size={18} color="#0ea5e9" />  Available Delivery Requests ({availableDeliveries.length})
          </Text>
          {availableDeliveries.map((order) => (
            <View key={order.id} style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: '#0ea5e9' }]}>
              <View style={styles.orderHeader}>
                <View style={styles.orderHeaderLeft}>
                  <Avatar name={order.user?.name} size={40} />
                  <View>
                    <Text style={styles.orderNumber}>Order #{order.requestNumber}</Text>
                    <Text style={styles.customerName}>{order.user?.name}</Text>
                  </View>
                </View>
                <View style={styles.earnPill}>
                  <Ionicons name="cash-outline" size={12} color="#059669" />
                  <Text style={styles.earnText}>GH₵{Number(order.estimatedEarnings || 0).toFixed(0)}</Text>
                </View>
              </View>

              {/* Pickup: laundromat → deliver: customer */}
              <View style={styles.routeRow}>
                <Ionicons name="storefront-outline" size={15} color="#0ea5e9" />
                <Text style={styles.routeText} numberOfLines={1}>Pick up: {order.provider?.name || 'Laundromat'}</Text>
              </View>
              <View style={styles.routeRow}>
                <Ionicons name="location-outline" size={15} color="#10b981" />
                <Text style={styles.routeText} numberOfLines={2}>Deliver to: {order.pickupAddress}</Text>
              </View>

              <View style={styles.orderMeta}>
                {order.deliveryDistanceKm != null && (
                  <View style={styles.metaChip}>
                    <Ionicons name="navigate-outline" size={13} color="#6b7280" />
                    <Text style={styles.metaText}>{order.deliveryDistanceKm} km trip</Text>
                  </View>
                )}
                {order.distanceKm != null && (
                  <View style={styles.metaChip}>
                    <Ionicons name="walk-outline" size={13} color="#6b7280" />
                    <Text style={styles.metaText}>{order.distanceKm} km to laundromat</Text>
                  </View>
                )}
              </View>

              <View style={styles.deliveryActions}>
                <TouchableOpacity style={styles.declineBtn} onPress={() => handleDeclineDelivery(order.id)} activeOpacity={0.85}>
                  <Text style={styles.declineText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.acceptDeliveryBtn} onPress={() => handleAcceptDelivery(order.id)} activeOpacity={0.85}>
                  <LinearGradient colors={['#0ea5e9', '#0284c7']} style={styles.acceptGradient}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                    <Text style={styles.acceptButtonText}>Accept Delivery</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Available Orders */}
      {isOnline && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="cube-outline" size={18} color="#3b82f6" />  Available Orders ({availableOrders.length})
          </Text>

          {limitReached ? (
            <EmptyState
              icon="checkmark-done-circle-outline"
              title="Task limit reached"
              subtitle={`Deliver a pickup to its laundromat before accepting more (${maxActiveTasks} max).`}
              tint="#f59e0b"
              style={{ paddingVertical: 32 }}
            />
          ) : availableOrders.length === 0 ? (
            <EmptyState
              icon="notifications-outline"
              title="No available orders"
              subtitle="New orders will appear here when customers place them."
              tint="#6b7280"
              style={{ paddingVertical: 32 }}
            />
          ) : (
            availableOrders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View style={styles.orderHeaderLeft}>
                    <Avatar name={`${order.user.firstName} ${order.user.lastName}`} size={40} />
                    <View>
                      <Text style={styles.orderNumber}>Order #{order.requestNumber}</Text>
                      <Text style={styles.customerName}>{order.user.firstName} {order.user.lastName}</Text>
                    </View>
                  </View>
                  {order.distanceKm !== null && (
                    <View style={styles.distancePill}>
                      <Ionicons name="location-sharp" size={12} color="#3b82f6" />
                      <Text style={styles.distanceText}>{order.distanceKm.toFixed(1)} km</Text>
                    </View>
                  )}
                </View>

                <View style={styles.addressRow}>
                  <Ionicons name="location" size={16} color="#6c757d" />
                  <Text style={styles.orderAddress} numberOfLines={2}>{order.pickupAddress}</Text>
                </View>

                <View style={styles.orderMeta}>
                  <View style={styles.metaChip}>
                    <Ionicons name="scale-outline" size={13} color="#6b7280" />
                    <Text style={styles.metaText}>{order.weightKg} kg</Text>
                  </View>
                  <View style={styles.metaChip}>
                    <Ionicons name="shirt-outline" size={13} color="#6b7280" />
                    <Text style={styles.metaText}>{order.laundryType}</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.acceptButton} onPress={() => handleAcceptOrder(order.id)} activeOpacity={0.85}>
                  <LinearGradient colors={['#10b981', '#059669']} style={styles.acceptGradient}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                    <Text style={styles.acceptButtonText}>Accept Order</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('Earnings', { screen: 'Earnings' })}>
          <LinearGradient colors={['#eff6ff', '#dbeafe']} style={styles.actionIcon}>
            <Ionicons name="cash" size={22} color="#3b82f6" />
          </LinearGradient>
          <Text style={styles.actionButtonText}>Earnings</Text>
        </TouchableOpacity>
        {activeTaskCount > 0 && (
          <TouchableOpacity style={styles.actionButton} onPress={handleViewTasks}>
            <LinearGradient colors={['#fef3c7', '#fde68a']} style={styles.actionIcon}>
              <Ionicons name="map" size={22} color="#f59e0b" />
            </LinearGradient>
            <Text style={styles.actionButtonText}>My Route</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  // Hero
  hero: { paddingTop: 50, paddingBottom: 18, paddingHorizontal: 18 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroUser: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  heroHi: { color: '#fff', fontSize: 18, fontWeight: '800' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10, marginTop: 4, alignSelf: 'flex-start' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  toggleBtn: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 },
  toggleBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  heroStatsRow: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, marginTop: 18, paddingVertical: 14, paddingHorizontal: 10 },
  heroStat: { flex: 1, alignItems: 'center', gap: 3 },
  heroStatNum: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)' },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Stats row (for skeleton)
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16 },

  // Tasks banner
  tasksBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 16, elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    borderWidth: 1.5, borderColor: '#dbeafe',
  },
  tasksBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tasksBannerIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tasksBannerTitle: { color: '#1f2937', fontSize: 15, fontWeight: '800' },
  tasksBannerSub: { color: '#6b7280', fontSize: 12, marginTop: 1 },

  // Section
  section: { marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginHorizontal: 16, marginTop: 16, marginBottom: 10 },

  // Order card
  orderCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: 14,
    padding: 16, elevation: 2,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  orderNumber: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  customerName: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  distancePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10, gap: 4 },
  distanceText: { fontSize: 13, fontWeight: '700', color: '#3b82f6' },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 10, gap: 6 },
  orderAddress: { fontSize: 13, color: '#6b7280', flex: 1 },
  orderMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, gap: 4 },
  metaText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },

  // Accept button
  acceptButton: { marginTop: 12, borderRadius: 12, overflow: 'hidden' },
  acceptGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13 },
  acceptButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Delivery request card
  earnPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10, gap: 4 },
  earnText: { fontSize: 13, fontWeight: '800', color: '#059669' },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 },
  routeText: { fontSize: 13, color: '#374151', flex: 1 },
  deliveryActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  declineBtn: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  declineText: { color: '#6b7280', fontWeight: '700', fontSize: 15 },
  acceptDeliveryBtn: { flex: 1, borderRadius: 12, overflow: 'hidden' },

  // Quick actions
  actionsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  actionButton: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, alignItems: 'center', gap: 8, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  actionIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { color: '#374151', fontSize: 13, fontWeight: '700' },
});
