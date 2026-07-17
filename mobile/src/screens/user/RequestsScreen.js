import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ordersAPI } from '../../api/client';
import { formatCurrency, formatDate, formatStatus, getStatusColor, formatTime } from '../../utils/helpers';
import StatusTimeline from '../../components/StatusTimeline';
import EmptyState from '../../components/EmptyState';
import { SkeletonCard } from '../../components/Skeleton';

const STATUS_OPTIONS = ['', 'awaiting_rider', 'picked_up', 'washing', 'ready_for_delivery', 'out_for_delivery', 'completed', 'cancelled'];

export default function RequestsScreen({ navigation }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  async function loadRequests(p = 1, reset = false) {
    try {
      const params = { page: p };
      if (statusFilter) params.status = statusFilter;
      if (search.trim()) params.search = search.trim();

      const res = await ordersAPI.list(params);
      const newRequests = res.data.requests || [];

      if (reset || p === 1) {
        setRequests(newRequests);
      } else {
        setRequests((prev) => [...prev, ...newRequests]);
      }

      setPage(p);
      setTotalPages(res.data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Requests error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { setLoading(true); loadRequests(1, true); }, [statusFilter]));

  function onRefresh() { setRefreshing(true); loadRequests(1, true); }
  function onLoadMore() { if (page < totalPages) loadRequests(page + 1); }
  function onSearch() { setLoading(true); loadRequests(1, true); }

  function handleCancel(id) {
    Alert.alert('Cancel Request', 'Are you sure you want to cancel this request?', [
      { text: 'No' },
      {
        text: 'Yes, Cancel', style: 'destructive',
        onPress: async () => {
          try {
            await ordersAPI.cancel(id);
            Alert.alert('Success', 'Request cancelled successfully.');
            loadRequests(1, true);
          } catch (error) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to cancel.');
          }
        },
      },
    ]);
  }

  function renderItem({ item }) {
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('RequestDetails', { id: item.id })}>
        <View style={styles.cardHeader}>
          <Text style={styles.reqNum}>{item.requestNumber}</Text>
          <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.badgeText}>{formatStatus(item.status)}</Text>
          </View>
        </View>
        {item.provider?.name && (
          <View style={styles.providerRow}>
            <Ionicons name="storefront" size={13} color="#2563eb" />
            <Text style={styles.providerName} numberOfLines={1}>{item.provider.name}</Text>
          </View>
        )}
        <Text style={styles.cardInfo}>{item.laundryType} • {item.weightKg} kg</Text>
        <StatusTimeline currentStatus={item.status} compact />
        <View style={styles.cardRow}>
          <Text style={styles.cardAmount}>{formatCurrency(item.totalAmount)}</Text>
          <Text style={styles.cardDate}>{formatDate(item.pickupDate)} {formatTime(item.pickupTime)}</Text>
        </View>
        {(item.allowedActions || []).some((a) => a.to === 'cancelled') && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => handleCancel(item.id)}>
            <Ionicons name="close-circle-outline" size={16} color="#dc3545" />
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput style={styles.searchInput} placeholder="Search..." value={search} onChangeText={setSearch} onSubmitEditing={onSearch} />
        <TouchableOpacity style={styles.searchBtn} onPress={onSearch}>
          <Ionicons name="search" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Status Filter */}
      <ScrollableChips options={STATUS_OPTIONS} selected={statusFilter} onSelect={setStatusFilter} />

      {/* New Request Button */}
      <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('ChooseLaundromat')}>
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <Text style={styles.newBtnText}>New Request</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={{ flex: 1, paddingTop: 8 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <EmptyState
              icon="cube-outline"
              title="No orders found"
              subtitle="Your laundry orders will appear here once you place a request."
              actionLabel="New Request"
              onAction={() => navigation.navigate('ChooseLaundromat')}
            />
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

function ScrollableChips({ options, selected, onSelect }) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => (
        <TouchableOpacity key={opt || 'all'} style={[styles.chip, selected === opt && styles.chipActive]} onPress={() => onSelect(opt)}>
          <Text style={[styles.chipText, selected === opt && styles.chipTextActive]}>{opt ? formatStatus(opt) : 'All'}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: '#dee2e6', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fff', fontSize: 14 },
  searchBtn: { backgroundColor: '#1B7BF7', borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 8, gap: 6 },
  chip: { borderWidth: 1, borderColor: '#dee2e6', borderRadius: 16, paddingVertical: 4, paddingHorizontal: 12, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#1B7BF7', borderColor: '#1B7BF7' },
  chipText: { fontSize: 12, color: '#495057' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  newBtn: { flexDirection: 'row', backgroundColor: '#1B7BF7', marginHorizontal: 16, marginTop: 10, borderRadius: 8, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 6 },
  newBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 8, padding: 14, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reqNum: { fontSize: 15, fontWeight: '700', color: '#1B7BF7' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  providerName: { fontSize: 13, fontWeight: '700', color: '#2563eb', flex: 1 },
  cardInfo: { fontSize: 13, color: '#495057', marginTop: 4 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  cardAmount: { fontSize: 14, fontWeight: '700', color: '#198754' },
  cardDate: { fontSize: 12, color: '#6c757d' },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 8, gap: 4 },
  cancelText: { color: '#dc3545', fontSize: 13, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#6c757d', marginTop: 8, fontSize: 16 },
});
