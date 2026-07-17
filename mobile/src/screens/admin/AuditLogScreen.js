import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminAPI } from '../../api/client';
import { formatDate, formatTime } from '../../utils/helpers';

const ACTION_TYPES = [
  { label: 'All Actions', value: '' },
  { label: 'Order Created', value: 'ORDER_CREATED' },
  { label: 'Status Changed', value: 'ORDER_STATUS_CHANGED' },
  { label: 'Order Cancelled', value: 'ORDER_CANCELLED' },
  { label: 'User Status Changed', value: 'USER_STATUS_CHANGED' },
  { label: 'Pricing Updated', value: 'PRICING_UPDATED' },
  { label: 'Review Submitted', value: 'REVIEW_SUBMITTED' },
];

const ENTITY_TYPES = [
  { label: 'All Entities', value: '' },
  { label: 'Order', value: 'order' },
  { label: 'User', value: 'user' },
  { label: 'Pricing', value: 'pricing' },
];

export default function AuditLogScreen() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Filters
  const [actionType, setActionType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadLogs(true);
  }, [actionType, entityType, userId, startDate, endDate]);

  const loadLogs = async (reset = false) => {
    try {
      if (reset) {
        setPage(1);
        setLoading(true);
      }

      const params = {
        page: reset ? 1 : page,
        limit: 50,
      };

      if (actionType) params.actionType = actionType;
      if (entityType) params.entityType = entityType;
      if (userId) params.userId = userId;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await adminAPI.getAuditLogs(params);
      const newLogs = res.data.logs || [];

      if (reset) {
        setLogs(newLogs);
      } else {
        setLogs((prev) => [...prev, ...newLogs]);
      }

      setHasMore(newLogs.length === 50);
      if (!reset) setPage((p) => p + 1);
    } catch (error) {
      console.error('Load audit logs error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadLogs(true);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      loadLogs(false);
    }
  };

  const clearFilters = () => {
    setActionType('');
    setEntityType('');
    setUserId('');
    setStartDate('');
    setEndDate('');
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'ORDER_CREATED':
        return { name: 'add-circle-outline', color: '#10b981' };
      case 'ORDER_STATUS_CHANGED':
        return { name: 'swap-horizontal-outline', color: '#3b82f6' };
      case 'ORDER_CANCELLED':
        return { name: 'close-circle-outline', color: '#ef4444' };
      case 'USER_STATUS_CHANGED':
        return { name: 'person-outline', color: '#f59e0b' };
      case 'PRICING_UPDATED':
        return { name: 'cash-outline', color: '#8b5cf6' };
      case 'REVIEW_SUBMITTED':
        return { name: 'star-outline', color: '#ec4899' };
      default:
        return { name: 'document-text-outline', color: '#6b7280' };
    }
  };

  const renderLogItem = ({ item }) => {
    const icon = getActionIcon(item.actionType);
    const userName = item.user
      ? `${item.user.firstName} ${item.user.lastName}`
      : `User #${item.userId}`;

    return (
      <View style={styles.logCard}>
        <View style={styles.logHeader}>
          <View style={[styles.iconCircle, { backgroundColor: icon.color + '20' }]}>
            <Ionicons name={icon.name} size={20} color={icon.color} />
          </View>
          <View style={styles.logHeaderText}>
            <Text style={styles.actionType}>{item.actionType.replace(/_/g, ' ')}</Text>
            <Text style={styles.userName}>{userName}</Text>
          </View>
          <Text style={styles.timestamp}>
            {formatDate(item.createdAt)} {formatTime(item.createdAt)}
          </Text>
        </View>

        <Text style={styles.description}>{item.description}</Text>

        {item.entityType && (
          <View style={styles.entityInfo}>
            <Text style={styles.entityText}>
              {item.entityType.charAt(0).toUpperCase() + item.entityType.slice(1)}
              {item.entityId ? ` #${item.entityId}` : ''}
            </Text>
          </View>
        )}

        {item.metadata && (
          <View style={styles.metadata}>
            <Text style={styles.metadataLabel}>Details:</Text>
            <Text style={styles.metadataText}>
              {JSON.stringify(item.metadata, null, 2).substring(0, 150)}
              {JSON.stringify(item.metadata).length > 150 ? '...' : ''}
            </Text>
          </View>
        )}

        {item.ipAddress && (
          <Text style={styles.ipAddress}>IP: {item.ipAddress}</Text>
        )}
      </View>
    );
  };

  const activeFiltersCount = [actionType, entityType, userId, startDate, endDate].filter(Boolean).length;

  return (
    <View style={styles.container}>
      {/* Header with filter button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Audit Logs</Text>
        <TouchableOpacity
          style={[styles.filterButton, activeFiltersCount > 0 && styles.filterButtonActive]}
          onPress={() => setFilterModalVisible(true)}
        >
          <Ionicons name="filter-outline" size={20} color={activeFiltersCount > 0 ? '#fff' : '#6b7280'} />
          {activeFiltersCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeFiltersCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter Modal */}
      <Modal
        visible={filterModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter Audit Logs</Text>
              <TouchableOpacity onPress={() => setFilterModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Action Type */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Action Type</Text>
                <View style={styles.chipContainer}>
                  {ACTION_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.chip,
                        actionType === type.value && styles.chipActive,
                      ]}
                      onPress={() => setActionType(type.value)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          actionType === type.value && styles.chipTextActive,
                        ]}
                      >
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Entity Type */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Entity Type</Text>
                <View style={styles.chipContainer}>
                  {ENTITY_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.chip,
                        entityType === type.value && styles.chipActive,
                      ]}
                      onPress={() => setEntityType(type.value)}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          entityType === type.value && styles.chipTextActive,
                        ]}
                      >
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* User ID */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>User ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter user ID"
                  value={userId}
                  onChangeText={setUserId}
                  keyboardType="numeric"
                />
              </View>

              {/* Date Range */}
              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>Start Date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={startDate}
                  onChangeText={setStartDate}
                />
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>End Date</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  value={endDate}
                  onChangeText={setEndDate}
                />
              </View>

              {/* Clear Filters */}
              <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear All Filters</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => setFilterModalVisible(false)}
              >
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Logs List */}
      {loading && logs.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#dc3545" />
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="document-text-outline" size={64} color="#d1d5db" />
          <Text style={styles.emptyText}>No audit logs found</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          renderItem={renderLogItem}
          keyExtractor={(item) => item.id.toString()}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            hasMore && !loading ? (
              <View style={styles.loadMore}>
                <ActivityIndicator size="small" color="#dc3545" />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#111827' },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  filterButtonActive: { backgroundColor: '#dc3545' },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#fff',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#dc3545' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 16, color: '#9ca3af', marginTop: 8 },
  logCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  logHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logHeaderText: { flex: 1 },
  actionType: { fontSize: 14, fontWeight: '600', color: '#111827', textTransform: 'capitalize' },
  userName: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  timestamp: { fontSize: 11, color: '#9ca3af' },
  description: { fontSize: 14, color: '#374151', marginBottom: 8, lineHeight: 20 },
  entityInfo: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  entityText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  metadata: { marginTop: 8, padding: 8, backgroundColor: '#f9fafb', borderRadius: 6 },
  metadataLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
  metadataText: { fontSize: 11, color: '#374151', fontFamily: 'monospace' },
  ipAddress: { fontSize: 10, color: '#9ca3af', marginTop: 8 },
  loadMore: { padding: 16, alignItems: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  modalBody: { padding: 20 },
  filterSection: { marginBottom: 24 },
  filterLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#dc3545', borderColor: '#dc3545' },
  chipText: { fontSize: 13, color: '#6b7280' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  clearButton: {
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    marginTop: 8,
  },
  clearButtonText: { fontSize: 14, color: '#6b7280', fontWeight: '500' },
  modalFooter: { padding: 20, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  applyButton: {
    backgroundColor: '#dc3545',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
