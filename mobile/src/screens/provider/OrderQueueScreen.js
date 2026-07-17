import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { providerAPI } from '../../api/client';
import { formatCurrency, formatDate, formatDateTime, formatStatus, getStatusColor } from '../../utils/helpers';
import StatusTimeline from '../../components/StatusTimeline';
import EmptyState from '../../components/EmptyState';
import { SkeletonCard } from '../../components/Skeleton';
import Avatar from '../../components/Avatar';
import { metaFor } from '../../utils/orderStatus';
import { subscribeToOrderFeed } from '../../services/realtime';

// ── Tab definitions ──
const TABS = [
  { key: 'pending',    label: 'Pending',     icon: 'time-outline',      color: '#f59e0b', emptyMsg: 'No pending orders' },
  { key: 'inprogress', label: 'In Progress', icon: 'sync-outline',      color: '#3b82f6', emptyMsg: 'No orders in progress' },
  { key: 'completed',  label: 'Completed',   icon: 'checkmark-done-outline', color: '#10b981', emptyMsg: 'No completed orders yet' },
  { key: 'cancelled',  label: 'Cancelled',   icon: 'close-circle-outline', color: '#ef4444', emptyMsg: 'No cancelled orders' },
];

export default function OrderQueueScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('pending');
  const [orders, setOrders] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, inprogress: 0, completed: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [advancing, setAdvancing] = useState(null); // orderId being advanced

  // Load counts from dashboard
  async function loadCounts() {
    try {
      const res = await providerAPI.getDashboard();
      const s = res.data.stats;
      setCounts({
        pending: s.pendingCount || 0,
        inprogress: s.inProgressCount || 0,
        completed: s.completedCount || 0,
        cancelled: s.cancelledCount || 0,
      });
    } catch (e) {
      // silent
    }
  }

  // Load queue for active tab
  async function loadQueue(p = 1, reset = false) {
    try {
      const res = await providerAPI.getQueue(activeTab, { page: p });
      const items = res.data.requests || [];
      if (reset || p === 1) setOrders(items);
      else setOrders((prev) => [...prev, ...items]);
      setPage(p);
      setTotalPages(res.data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Queue load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Reload on tab change or screen focus
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadCounts();
      loadQueue(1, true);
    }, [activeTab])
  );

  // Live: refresh counts + current queue whenever any of this provider's
  // orders changes (rider delivery steps, payments, verifications).
  useFocusEffect(
    useCallback(() => {
      const unsub = subscribeToOrderFeed(() => {
        loadCounts();
        loadQueue(1, true);
      });
      return () => unsub && unsub();
    }, [activeTab])
  );

  function onRefresh() {
    setRefreshing(true);
    loadCounts();
    loadQueue(1, true);
  }

  // ── Advance order to next status ──
  async function handleAdvance(orderId) {
    setAdvancing(orderId);
    try {
      const res = await providerAPI.advanceOrder(orderId);
      Alert.alert('Success', res.data.message);
      loadCounts();
      loadQueue(1, true);
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to advance order.');
    } finally {
      setAdvancing(null);
    }
  }

  // ── Render a queue card ──
  function renderOrderCard({ item }) {
    const isAdvancing = advancing === item.id;
    // Weight not yet verified → the action is to verify (in the details screen).
    const needsVerify = item.status === 'at_laundromat';
    // Verified but unpaid → provider must wait for the customer to pay.
    const awaitingPayment = item.status === 'weight_verified' && item.paymentStatus !== 'paid';
    // Otherwise, the next forward step from the backend state machine.
    const next = (item.allowedActions || []).find((a) => a.to !== 'cancelled');
    const action = (!needsVerify && !awaitingPayment && next)
      ? { label: next.label, icon: metaFor(next.to).icon, color: metaFor(next.to).color } : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('OrderDetails', { id: item.id })}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Avatar name={`${item.user?.firstName} ${item.user?.lastName}`} size={36} />
            <View>
              <Text style={styles.cardReqNum}>{item.requestNumber}</Text>
              <Text style={styles.cardCustomer}>{item.user?.firstName} {item.user?.lastName}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusBadgeText}>{formatStatus(item.status)}</Text>
          </View>
        </View>

        {/* Order details */}
        <View style={styles.cardDetails}>
          <View style={styles.detailChip}>
            <Ionicons name="shirt-outline" size={14} color="#6b7280" />
            <Text style={styles.detailText}>{item.laundryType}</Text>
          </View>
          <View style={styles.detailChip}>
            <Ionicons name="scale-outline" size={14} color="#6b7280" />
            <Text style={styles.detailText}>{item.weightKg} kg</Text>
          </View>
          <View style={styles.detailChip}>
            <Ionicons name="cash-outline" size={14} color="#059669" />
            <Text style={[styles.detailText, { color: '#059669', fontWeight: '700' }]}>{formatCurrency(item.totalAmount)}</Text>
          </View>
        </View>

        {/* Compact timeline */}
        <StatusTimeline currentStatus={item.status} compact />

        {/* Date */}
        <Text style={styles.cardDate}>
          <Ionicons name="time-outline" size={12} color="#9ca3af" /> {formatDateTime(item.createdAt)}
        </Text>

        {/* Verify weight (opens details) */}
        {needsVerify && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.advanceBtn, { backgroundColor: '#8b5cf6' }]} onPress={() => navigation.navigate('OrderDetails', { id: item.id })}>
              <Ionicons name="scale-outline" size={18} color="#fff" />
              <Text style={styles.advanceBtnText}>Verify Laundry Weight</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Awaiting customer payment — provider cannot start washing */}
        {awaitingPayment && (
          <View style={[styles.actionRow, styles.awaitBanner]}>
            <Ionicons name="hourglass-outline" size={16} color="#92400e" />
            <Text style={styles.awaitBannerText}>Awaiting payment · {formatCurrency(item.finalAmount)}</Text>
          </View>
        )}

        {/* Advance to the next provider step (only when one exists) */}
        {action && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.advanceBtn, { backgroundColor: action.color }]}
              onPress={() => handleAdvance(item.id)}
              disabled={isAdvancing}
            >
              {isAdvancing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name={action.icon} size={18} color="#fff" />
                  <Text style={styles.advanceBtnText}>{action.label}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  const currentTab = TABS.find((t) => t.key === activeTab);

  return (
    <View style={styles.container}>
      {/* ── Tab bar ── */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = counts[tab.key] || 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && { borderBottomColor: tab.color, borderBottomWidth: 3 }]}
              onPress={() => { if (!isActive) { setActiveTab(tab.key); } }}
            >
              <View style={styles.tabInner}>
                <Ionicons name={tab.icon} size={18} color={isActive ? tab.color : '#9ca3af'} />
                <Text style={[styles.tabLabel, isActive && { color: tab.color, fontWeight: '700' }]}>
                  {tab.label}
                </Text>
              </View>
              {count > 0 && (
                <View style={[styles.tabBadge, { backgroundColor: tab.color }]}>
                  <Text style={styles.tabBadgeText}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={{ flex: 1, paddingTop: 8 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderOrderCard}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[currentTab.color]} />}
          onEndReached={() => page < totalPages && loadQueue(page + 1)}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon={currentTab.icon}
              title={currentTab.emptyMsg}
              subtitle={activeTab === 'incoming' ? 'New orders from customers will appear here automatically.' : activeTab === 'inprogress' ? 'Orders being processed will show here.' : 'Completed orders will be listed here.'}
              tint={currentTab.color}
            />
          }
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Tab bar
  tabBar: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tabLabel: { fontSize: 13, color: '#9ca3af', fontWeight: '500' },
  tabBadge: { minWidth: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Card
  card: { backgroundColor: '#fff', marginHorizontal: 14, marginTop: 10, borderRadius: 14, padding: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardReqNum: { fontSize: 16, fontWeight: '800', color: '#1f2937' },
  cardCustomer: { fontSize: 13, color: '#6b7280', marginTop: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  statusBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  // Details
  cardDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  detailChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, gap: 4 },
  detailText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },
  cardDate: { fontSize: 11, color: '#9ca3af', marginTop: 6 },

  // Actions
  actionRow: { flexDirection: 'row', marginTop: 12, gap: 10, alignItems: 'center' },
  advanceBtn: { flex: 1, flexDirection: 'row', borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', gap: 6 },
  advanceBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  awaitBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#fffbeb', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#fde68a' },
  awaitBannerText: { color: '#92400e', fontSize: 13, fontWeight: '700' },
  cancelBtn: { width: 42, height: 42, borderRadius: 10, borderWidth: 1.5, borderColor: '#fecaca', backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },

  // Empty
  emptyContainer: { alignItems: 'center', marginTop: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#9ca3af' },
});
