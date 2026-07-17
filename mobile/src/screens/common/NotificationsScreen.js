import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { notificationsAPI } from '../../api/client';
import { formatDateTime } from '../../utils/helpers';
import EmptyState from '../../components/EmptyState';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';

const TYPE_ICONS = {
  info: { name: 'information-circle-outline', color: '#0dcaf0' },
  success: { name: 'checkmark-circle-outline', color: '#198754' },
  warning: { name: 'warning-outline', color: '#ffc107' },
  error: { name: 'close-circle-outline', color: '#dc3545' },
};

const FILTERS = [
  { key: 'all', label: 'All', params: {} },
  { key: 'unread', label: 'Unread', params: { read: 'unread' } },
  { key: 'success', label: 'Updates', params: { type: 'success' } },
  { key: 'warning', label: 'Alerts', params: { type: 'warning' } },
  { key: 'info', label: 'Info', params: { type: 'info' } },
];

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState('all');

  async function loadNotifications(p = 1, reset = false) {
    try {
      const f = FILTERS.find((x) => x.key === filter) || FILTERS[0];
      const res = await notificationsAPI.list({ page: p, ...f.params });
      const items = res.data.notifications || [];
      if (reset || p === 1) {
        setNotifications(items);
      } else {
        setNotifications((prev) => [...prev, ...items]);
      }
      setUnreadCount(res.data.unreadCount || 0);
      setPage(p);
      setTotalPages(res.data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Notifications error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { setLoading(true); loadNotifications(1, true); }, [filter]));

  async function markRead(id) {
    try {
      await notificationsAPI.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (error) {
      console.error('Mark read error:', error);
    }
  }

  async function markAllRead() {
    try {
      await notificationsAPI.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Mark all read error:', error);
    }
  }

  function renderItem({ item }) {
    const icon = TYPE_ICONS[item.type] || TYPE_ICONS.info;
    return (
      <TouchableOpacity
        style={[styles.notifCard, !item.isRead && styles.unreadCard]}
        onPress={() => !item.isRead && markRead(item.id)}
      >
        <Ionicons name={icon.name} size={24} color={icon.color} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <View style={styles.notifHeader}>
            <Text style={[styles.notifTitle, !item.isRead && { fontWeight: '700' }]}>{item.title}</Text>
            {!item.isRead && <View style={styles.newBadge}><Text style={styles.newBadgeText}>New</Text></View>}
          </View>
          <Text style={styles.notifMsg}>{item.message}</Text>
          <Text style={styles.notifDate}>{formatDateTime(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top bar: settings + mark all */}
      <View style={styles.topBar}>
        {unreadCount > 0 ? (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Ionicons name="checkmark-done-outline" size={18} color="#1B7BF7" />
            <Text style={styles.markAllText}>Mark All Read ({unreadCount})</Text>
          </TouchableOpacity>
        ) : <View />}
        <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation?.navigate('NotificationSettings')}>
          <Ionicons name="options-outline" size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.chip, filter === f.key && styles.chipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, padding: 16 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadNotifications(1, true); }} />}
          onEndReached={() => page < totalPages && loadNotifications(page + 1)}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-off-outline"
              title="No notifications"
              subtitle="You're all caught up! Notifications about your orders and updates will appear here."
            />
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 6 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 6 },
  markAllText: { color: '#1B7BF7', fontWeight: '600', fontSize: 14 },
  settingsBtn: { padding: 10 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 8 },
  chip: { borderWidth: 1, borderColor: '#dee2e6', borderRadius: 16, paddingVertical: 5, paddingHorizontal: 13, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#1B7BF7', borderColor: '#1B7BF7' },
  chipText: { fontSize: 12, color: '#495057', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  notifCard: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 8, borderRadius: 8, padding: 14, elevation: 1 },
  unreadCard: { backgroundColor: '#f0f7ff', borderLeftWidth: 3, borderLeftColor: '#1B7BF7' },
  notifHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifTitle: { fontSize: 14, color: '#212529' },
  newBadge: { backgroundColor: '#1B7BF7', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8 },
  newBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  notifMsg: { fontSize: 13, color: '#6c757d', marginTop: 4 },
  notifDate: { fontSize: 11, color: '#adb5bd', marginTop: 4 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#6c757d', marginTop: 8, fontSize: 16 },
});
