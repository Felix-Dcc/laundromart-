import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { pricingAPI } from '../../api/client';
import { formatCurrency, formatStatus, getStatusColor } from '../../utils/helpers';
import { SkeletonCard } from '../../components/Skeleton';

export default function AdminPricingScreen() {
  const [pricing, setPricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ serviceType: '', pricePerKg: '', description: '', status: 'active' });
  const [saving, setSaving] = useState(false);

  async function loadPricing() {
    try {
      const res = await pricingAPI.getAll();
      setPricing(res.data.pricing || []);
    } catch (error) {
      console.error('Pricing error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { setLoading(true); loadPricing(); }, []));

  function openAdd() {
    setEditId(null);
    setForm({ serviceType: '', pricePerKg: '', description: '', status: 'active' });
    setModalVisible(true);
  }

  function openEdit(item) {
    setEditId(item.id);
    setForm({
      serviceType: item.serviceType,
      pricePerKg: String(item.pricePerKg),
      description: item.description || '',
      status: item.status,
    });
    setModalVisible(true);
  }

  async function handleSave() {
    if (!form.serviceType.trim() || !form.pricePerKg) {
      Alert.alert('Error', 'Service type and price are required.');
      return;
    }
    const price = parseFloat(form.pricePerKg);
    if (price <= 0 || price > 1000) {
      Alert.alert('Error', 'Price must be between $0.01 and $1000.');
      return;
    }

    setSaving(true);
    try {
      const data = { serviceType: form.serviceType.trim(), pricePerKg: price, description: form.description.trim(), status: form.status };
      if (editId) {
        await pricingAPI.update(editId, data);
      } else {
        await pricingAPI.create(data);
      }
      Alert.alert('Success', editId ? 'Pricing updated!' : 'New service added!');
      setModalVisible(false);
      loadPricing();
    } catch (error) {
      const errors = error.response?.data?.errors || ['Failed to save pricing.'];
      Alert.alert('Error', errors.join('\n'));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(item) {
    Alert.alert('Delete', `Delete "${item.serviceType}"?`, [
      { text: 'No' },
      {
        text: 'Yes', style: 'destructive',
        onPress: async () => {
          try {
            await pricingAPI.delete(item.id);
            loadPricing();
          } catch (error) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to delete.');
          }
        },
      },
    ]);
  }

  function renderItem({ item }) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.serviceName}>{item.serviceType}</Text>
          <View style={[styles.badge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.badgeText}>{formatStatus(item.status)}</Text>
          </View>
        </View>
        <Text style={styles.price}>{formatCurrency(item.pricePerKg)}/kg</Text>
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}
        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
            <Ionicons name="pencil-outline" size={16} color="#1B7BF7" />
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
            <Ionicons name="trash-outline" size={16} color="#dc3545" />
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
        <Ionicons name="add-circle-outline" size={20} color="#fff" />
        <Text style={styles.addBtnText}>Add New Service</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={{ flex: 1, paddingTop: 8 }}><SkeletonCard /><SkeletonCard /></View>
      ) : (
        <FlatList
          data={pricing}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadPricing(); }} />}
          ListEmptyComponent={<View style={styles.emptyContainer}><Ionicons name="pricetag-outline" size={50} color="#adb5bd" /><Text style={styles.emptyText}>No pricing configured</Text></View>}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editId ? 'Edit Service' : 'Add New Service'}</Text>

            <Text style={styles.label}>Service Type</Text>
            <TextInput style={styles.modalInput} value={form.serviceType} onChangeText={(v) => setForm({ ...form, serviceType: v })} placeholder="e.g., Regular Wash" />

            <Text style={styles.label}>Price per KG</Text>
            <TextInput style={styles.modalInput} value={form.pricePerKg} onChangeText={(v) => setForm({ ...form, pricePerKg: v })} placeholder="0.00" keyboardType="decimal-pad" />

            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.modalInput, { minHeight: 60 }]} value={form.description} onChangeText={(v) => setForm({ ...form, description: v })} placeholder="Brief description..." multiline />

            <Text style={styles.label}>Status</Text>
            <View style={styles.statusRow}>
              {['active', 'inactive'].map((s) => (
                <TouchableOpacity key={s} style={[styles.statusChip, form.status === s && styles.statusChipActive]} onPress={() => setForm({ ...form, status: s })}>
                  <Text style={[styles.statusChipText, form.status === s && { color: '#fff' }]}>{formatStatus(s)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#6c757d' }]} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#dc3545' }]} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>{editId ? 'Update' : 'Add'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  addBtn: { flexDirection: 'row', backgroundColor: '#dc3545', marginHorizontal: 16, marginTop: 12, borderRadius: 8, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 8, padding: 14, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serviceName: { fontSize: 16, fontWeight: '700', color: '#212529' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  price: { fontSize: 20, fontWeight: 'bold', color: '#198754', marginTop: 4 },
  desc: { fontSize: 13, color: '#6c757d', marginTop: 4 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, gap: 16 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editText: { color: '#1B7BF7', fontSize: 13, fontWeight: '600' },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deleteText: { color: '#dc3545', fontSize: 13, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { color: '#6c757d', marginTop: 8, fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#212529', marginTop: 12, marginBottom: 4 },
  modalInput: { borderWidth: 1, borderColor: '#dee2e6', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, textAlignVertical: 'top' },
  statusRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  statusChip: { flex: 1, borderWidth: 1, borderColor: '#dee2e6', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  statusChipActive: { backgroundColor: '#198754', borderColor: '#198754' },
  statusChipText: { fontSize: 14, color: '#495057', fontWeight: '600' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  modalBtnText: { color: '#fff', fontWeight: '600' },
});
