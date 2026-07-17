import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { paymentsAPI } from '../../api/client';
import { formatCurrency, formatDateTime } from '../../utils/helpers';
import { SkeletonCard } from '../../components/Skeleton';

const STATUS_FILTERS = ['', 'paid', 'pending', 'failed', 'refunded'];

const STATUS_STYLE = {
  paid: { bg: '#d1fae5', fg: '#065f46', label: 'Paid' },
  pending: { bg: '#fef3c7', fg: '#92400e', label: 'Pending' },
  failed: { bg: '#fee2e2', fg: '#991b1b', label: 'Failed' },
  refunded: { bg: '#e0e7ff', fg: '#3730a3', label: 'Refunded' },
};

const METHOD_LABEL = (t) => (t.method === 'card' ? 'Card' : `MoMo · ${t.channel || ''}`);

export default function AdminTransactionsScreen() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [refundingRef, setRefundingRef] = useState(null);

  const load = useCallback(async (p = 1, reset = false) => {
    try {
      const params = { page: p };
      if (status) params.status = status;
      const res = await paymentsAPI.list(params);
      const items = res.data.transactions || [];
      setTransactions((prev) => (reset || p === 1 ? items : [...prev, ...items]));
      setPage(p);
      setTotalPages(res.data.pagination?.totalPages || 1);
    } catch (e) {
      console.error('Transactions load error:', e?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useFocusEffect(useCallback(() => { setLoading(true); load(1, true); }, [load]));

  function confirmRefund(txn) {
    Alert.alert(
      'Issue Refund',
      `Refund ${formatCurrency(txn.amount)} for order #${txn.order?.requestNumber}? This cannot be undone.`,
      [
        { text: 'Cancel' },
        {
          text: 'Refund',
          style: 'destructive',
          onPress: async () => {
            setRefundingRef(txn.reference);
            try {
              await paymentsAPI.refund(txn.reference);
              // Optimistically reflect the new state.
              setTransactions((prev) => prev.map((t) =>
                t.reference === txn.reference ? { ...t, status: 'refunded', refundedAt: new Date().toISOString() } : t));
              Alert.alert('Refunded', 'The payment has been refunded.');
            } catch (e) {
              Alert.alert('Refund failed', e.response?.data?.error || e.message || 'Could not issue refund.');
            } finally {
              setRefundingRef(null);
            }
          },
        },
      ],
    );
  }

  function renderItem({ item }) {
    const s = STATUS_STYLE[item.status] || { bg: '#e5e7eb', fg: '#374151', label: item.status };
    const isRefunding = refundingRef === item.reference;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.amount}>{formatCurrency(item.amount)} <Text style={styles.currency}>{item.currency}</Text></Text>
            <Text style={styles.order}>Order #{item.order?.requestNumber || '—'}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
            <Text style={[styles.statusText, { color: s.fg }]}>{s.label}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Ionicons name={item.method === 'card' ? 'card-outline' : 'phone-portrait-outline'} size={14} color="#6b7280" />
          <Text style={styles.meta}>{METHOD_LABEL(item)}</Text>
          <Text style={styles.dot}>·</Text>
          <Ionicons name="person-outline" size={14} color="#6b7280" />
          <Text style={styles.meta} numberOfLines={1}>
            {item.user ? `${item.user.firstName} ${item.user.lastName}` : 'Unknown'}
          </Text>
        </View>

        <Text style={styles.ref} numberOfLines={1}>{item.reference}</Text>
        <Text style={styles.date}>{formatDateTime(item.paidAt || item.createdAt)}</Text>

        {item.status === 'paid' && (
          <TouchableOpacity style={styles.refundBtn} onPress={() => confirmRefund(item)} disabled={isRefunding}>
            {isRefunding ? <ActivityIndicator size="small" color="#dc3545" /> : (
              <>
                <Ionicons name="return-down-back-outline" size={16} color="#dc3545" />
                <Text style={styles.refundText}>Refund</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Status filter */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f || 'all'}
            style={[styles.chip, status === f && styles.chipActive]}
            onPress={() => setStatus(f)}
          >
            <Text style={[styles.chipText, status === f && styles.chipTextActive]}>
              {f ? (STATUS_STYLE[f]?.label || f) : 'All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, paddingTop: 8 }}><SkeletonCard /><SkeletonCard /><SkeletonCard /></View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(t) => String(t.id)}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(1, true); }} colors={['#dc3545']} />}
          onEndReached={() => { if (page < totalPages) load(page + 1); }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="card-outline" size={52} color="#d1d5db" />
              <Text style={styles.emptyText}>No transactions{status ? ` (${status})` : ''} yet</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  chip: { borderWidth: 1, borderColor: '#dee2e6', borderRadius: 16, paddingVertical: 5, paddingHorizontal: 14, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#dc3545', borderColor: '#dc3545' },
  chipText: { fontSize: 12, color: '#495057', fontWeight: '600' },
  chipTextActive: { color: '#fff' },

  card: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 10, borderRadius: 12, padding: 14, elevation: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  amount: { fontSize: 18, fontWeight: '800', color: '#111827' },
  currency: { fontSize: 12, fontWeight: '600', color: '#9ca3af' },
  order: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 10 },
  statusText: { fontSize: 11, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  meta: { fontSize: 12, color: '#4b5563', fontWeight: '500' },
  dot: { color: '#d1d5db', marginHorizontal: 2 },
  ref: { fontSize: 11, color: '#9ca3af', marginTop: 8 },
  date: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  refundBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 9, borderRadius: 9, borderWidth: 1.5, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  refundText: { color: '#dc3545', fontWeight: '700', fontSize: 14 },
  empty: { alignItems: 'center', marginTop: 70, gap: 10 },
  emptyText: { fontSize: 15, color: '#9ca3af', fontWeight: '600' },
});
