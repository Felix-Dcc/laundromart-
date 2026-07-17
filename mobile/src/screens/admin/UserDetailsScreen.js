import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminAPI } from '../../api/client';
import { formatCurrency, formatDate, formatDateTime, formatStatus, getStatusColor } from '../../utils/helpers';
import Avatar from '../../components/Avatar';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';

export default function AdminUserDetailsScreen({ route, navigation }) {
  const { id } = route.params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadUser(); }, [id]);

  async function loadUser() {
    try {
      const res = await adminAPI.getUserById(id);
      setData(res.data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load user details.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus() {
    const action = data.user.status === 'active' ? 'deactivate' : 'activate';
    Alert.alert('Confirm', `Are you sure you want to ${action} this user?`, [
      { text: 'No' },
      {
        text: 'Yes',
        onPress: async () => {
          try {
            await adminAPI.toggleUserStatus(id);
            loadUser();
          } catch (error) {
            Alert.alert('Error', 'Failed to update status.');
          }
        },
      },
    ]);
  }

  if (loading) return (
    <View style={styles.container}>
      <View style={{ padding: 16, alignItems: 'center' }}>
        <Skeleton width={80} height={80} radius={40} />
        <Skeleton width={160} height={18} style={{ marginTop: 12 }} />
        <Skeleton width="100%" height={200} radius={12} style={{ marginTop: 16 }} />
      </View>
    </View>
  );
  if (!data) return null;

  const { user, stats, recentRequests } = data;

  return (
    <ScrollView style={styles.container}>
      {/* User Info */}
      <View style={styles.card}>
        <View style={styles.userHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user.firstName[0]}{user.lastName[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user.firstName} {user.lastName}</Text>
            <Text style={styles.userInfo}>{user.email}</Text>
            <Text style={styles.userInfo}>{user.phone}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: getStatusColor(user.status) }]}>
            <Text style={styles.badgeText}>{formatStatus(user.status)}</Text>
          </View>
        </View>
        <Text style={[styles.label, { marginTop: 12 }]}>Address</Text>
        <Text style={styles.value}>{user.address}</Text>
        <Text style={styles.label}>Member Since</Text>
        <Text style={styles.value}>{formatDate(user.createdAt)}</Text>
      </View>

      {/* Stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Order Statistics</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: '#1B7BF7' }]}>{stats.totalRequests || 0}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: '#198754' }]}>{formatCurrency(stats.totalSpent || 0)}</Text>
            <Text style={styles.statLabel}>Spent</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: '#0dcaf0' }]}>{formatCurrency(stats.avgOrderValue || 0)}</Text>
            <Text style={styles.statLabel}>Avg Order</Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Actions</Text>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: user.status === 'active' ? '#ffc107' : '#198754' }]}
          onPress={toggleStatus}
        >
          <Ionicons name={user.status === 'active' ? 'pause-outline' : 'play-outline'} size={20} color="#fff" />
          <Text style={styles.actionBtnText}>{user.status === 'active' ? 'Deactivate' : 'Activate'} User</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Orders */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent Orders</Text>
        {recentRequests?.length > 0 ? (
          recentRequests.map((req) => (
            <TouchableOpacity key={req.id} style={styles.orderItem} onPress={() => navigation.navigate('OrderDetails', { id: req.id })}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderNum}>{req.requestNumber}</Text>
                <View style={[styles.badge, { backgroundColor: getStatusColor(req.status) }]}>
                  <Text style={styles.badgeText}>{formatStatus(req.status)}</Text>
                </View>
              </View>
              <Text style={styles.orderInfo}>{req.laundryType} • {formatCurrency(req.totalAmount)} • {formatDate(req.createdAt)}</Text>
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>No orders yet</Text>
        )}
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 10, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#212529', marginBottom: 12 },
  userHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#dc3545', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  userName: { fontSize: 18, fontWeight: '700', color: '#212529' },
  userInfo: { fontSize: 13, color: '#6c757d' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  label: { fontSize: 12, color: '#6c757d', marginTop: 8 },
  value: { fontSize: 14, color: '#212529', marginBottom: 4 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statItem: { flex: 1, alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: 8, padding: 12 },
  statNum: { fontSize: 17, fontWeight: 'bold' },
  statLabel: { fontSize: 11, color: '#6c757d', marginTop: 2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingVertical: 12, gap: 8 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  orderItem: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingVertical: 10 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNum: { fontSize: 14, fontWeight: '700', color: '#dc3545' },
  orderInfo: { fontSize: 12, color: '#6c757d', marginTop: 4 },
  emptyText: { color: '#6c757d', textAlign: 'center', paddingVertical: 16 },
});
