import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { adminAPI } from '../../api/client';
import { formatDate, formatStatus, getStatusColor } from '../../utils/helpers';
import Avatar from '../../components/Avatar';
import { SkeletonCard } from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';

export default function AdminUsersScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  async function loadUsers(p = 1, reset = false) {
    try {
      const params = { page: p };
      if (search.trim()) params.search = search.trim();
      if (statusFilter) params.status = statusFilter;
      const res = await adminAPI.getUsers(params);
      const items = res.data.users || [];
      if (reset || p === 1) setUsers(items);
      else setUsers((prev) => [...prev, ...items]);
      setPage(p);
      setTotalPages(res.data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Users error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { setLoading(true); loadUsers(1, true); }, [statusFilter]));

  async function toggleStatus(userId, currentStatus) {
    const action = currentStatus === 'active' ? 'deactivate' : 'activate';
    Alert.alert('Confirm', `Are you sure you want to ${action} this user?`, [
      { text: 'No' },
      {
        text: 'Yes',
        onPress: async () => {
          try {
            await adminAPI.toggleUserStatus(userId);
            loadUsers(1, true);
          } catch (error) {
            Alert.alert('Error', 'Failed to update user status.');
          }
        },
      },
    ]);
  }

  function renderItem({ item }) {
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('UserDetails', { id: item.id })}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{item.firstName[0]}{item.lastName[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{item.firstName} {item.lastName}</Text>
            <Text style={styles.userEmail}>{item.email}</Text>
            <Text style={styles.userPhone}>{item.phone}</Text>
          </View>
          <View>
            <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
              <Text style={styles.badgeText}>{formatStatus(item.status)}</Text>
            </View>
            <Text style={styles.userType}>{formatStatus(item.userType)}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardStat}>Orders: {item._count?.laundryRequests || 0}</Text>
          <Text style={styles.cardDate}>Joined: {formatDate(item.createdAt)}</Text>
          <TouchableOpacity
            style={[styles.toggleBtn, { backgroundColor: item.status === 'active' ? '#ffc107' : '#198754' }]}
            onPress={() => toggleStatus(item.id, item.status)}
          >
            <Text style={styles.toggleText}>{item.status === 'active' ? 'Deactivate' : 'Activate'}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput style={styles.searchInput} placeholder="Search users..." value={search} onChangeText={setSearch} onSubmitEditing={() => { setLoading(true); loadUsers(1, true); }} />
        <TouchableOpacity style={styles.searchBtn} onPress={() => { setLoading(true); loadUsers(1, true); }}>
          <Ionicons name="search" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.chipRow}>
        {['', 'active', 'inactive'].map((opt) => (
          <TouchableOpacity key={opt || 'all'} style={[styles.chip, statusFilter === opt && styles.chipActive]} onPress={() => setStatusFilter(opt)}>
            <Text style={[styles.chipText, statusFilter === opt && styles.chipTextActive]}>{opt ? formatStatus(opt) : 'All'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, paddingTop: 8 }}><SkeletonCard /><SkeletonCard /><SkeletonCard /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadUsers(1, true); }} />}
          onEndReached={() => page < totalPages && loadUsers(page + 1)}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={<View style={styles.emptyContainer}><Ionicons name="people-outline" size={50} color="#adb5bd" /><Text style={styles.emptyText}>No users found</Text></View>}
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
  chipRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, gap: 6 },
  chip: { borderWidth: 1, borderColor: '#dee2e6', borderRadius: 16, paddingVertical: 4, paddingHorizontal: 14, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#dc3545', borderColor: '#dc3545' },
  chipText: { fontSize: 13, color: '#495057' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 8, padding: 14, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#dc3545', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  userName: { fontSize: 15, fontWeight: '700', color: '#212529' },
  userEmail: { fontSize: 12, color: '#6c757d' },
  userPhone: { fontSize: 12, color: '#6c757d' },
  userType: { fontSize: 10, color: '#6c757d', textAlign: 'right', marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  cardStat: { fontSize: 12, color: '#495057', fontWeight: '600' },
  cardDate: { fontSize: 11, color: '#6c757d' },
  toggleBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  toggleText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#6c757d', marginTop: 8, fontSize: 16 },
});
