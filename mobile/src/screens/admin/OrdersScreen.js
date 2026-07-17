import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { adminAPI } from '../../api/client';
import { formatCurrency, formatDate, formatStatus, getStatusColor } from '../../utils/helpers';
import { SkeletonCard } from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';

const STATUS_OPTIONS = ['', 'awaiting_rider', 'rider_assigned', 'picked_up', 'at_laundromat', 'washing', 'ready_for_delivery', 'out_for_delivery', 'completed', 'cancelled'];

export default function AdminOrdersScreen({ route, navigation }) {
  const initialStatus = route.params?.status || '';
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState(initialStatus);
  const [search, setSearch] = useState('');

  async function loadOrders(p = 1, reset = false) {
    try {
      const params = { page: p };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();
      const res = await adminAPI.getOrders(params);
      const items = res.data.requests || [];
      if (reset || p === 1) setRequests(items);
      else setRequests((prev) => [...prev, ...items]);
      setPage(p);
      setTotalPages(res.data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Admin orders error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { setLoading(true); loadOrders(1, true); }, [statusFilter]));

  function renderItem({ item }) {
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('OrderDetails', { id: item.id })}>
        <View style={styles.cardHeader}>
          <Text style={styles.reqNum}>{item.requestNumber}</Text>
          <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.badgeText}>{formatStatus(item.status)}</Text>
          </View>
        </View>
        <Text style={styles.customer}>{item.user?.firstName} {item.user?.lastName}</Text>
        <Text style={styles.customerEmail}>{item.user?.email}</Text>
        <Text style={styles.info}>{item.laundryType} • {item.weightKg}kg</Text>
        <View style={styles.cardRow}>
          <Text style={styles.amount}>{formatCurrency(item.totalAmount)}</Text>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput style={styles.searchInput} placeholder="Search orders..." value={search} onChangeText={setSearch} onSubmitEditing={() => { setLoading(true); loadOrders(1, true); }} />
        <TouchableOpacity style={styles.searchBtn} onPress={() => { setLoading(true); loadOrders(1, true); }}>
          <Ionicons name="search" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.chipRow}>
        {STATUS_OPTIONS.map((opt) => (
          <TouchableOpacity key={opt || 'all'} style={[styles.chip, statusFilter === opt && styles.chipActive]} onPress={() => setStatusFilter(opt)}>
            <Text style={[styles.chipText, statusFilter === opt && styles.chipTextActive]}>{opt ? formatStatus(opt) : 'All'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, paddingTop: 8 }}><SkeletonCard /><SkeletonCard /><SkeletonCard /></View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadOrders(1, true); }} />}
          onEndReached={() => page < totalPages && loadOrders(page + 1)}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<View style={styles.emptyContainer}><Ionicons name="inbox-outline" size={50} color="#adb5bd" /><Text style={styles.emptyText}>No orders found</Text></View>}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#dee2e6', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fff', fontSize: 14 },
  searchBtn: { backgroundColor: '#dc3545', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 8, gap: 6 },
  chip: { borderWidth: 1, borderColor: '#dee2e6', borderRadius: 16, paddingVertical: 4, paddingHorizontal: 12, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#dc3545', borderColor: '#dc3545' },
  chipText: { fontSize: 12, color: '#495057' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 8, padding: 14, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reqNum: { fontSize: 15, fontWeight: '700', color: '#dc3545' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  customer: { fontSize: 14, fontWeight: '600', color: '#212529', marginTop: 4 },
  customerEmail: { fontSize: 12, color: '#6c757d' },
  info: { fontSize: 13, color: '#495057', marginTop: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  amount: { fontSize: 14, fontWeight: '700', color: '#198754' },
  date: { fontSize: 12, color: '#6c757d' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#6c757d', marginTop: 8, fontSize: 16 },
});
