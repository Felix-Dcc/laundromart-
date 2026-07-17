import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ordersAPI, adminAPI } from '../../api/client';
import {
  formatCurrency, formatDate, formatDateTime, formatTime,
  formatStatus, getStatusColor,
} from '../../utils/helpers';
import StatusTimeline from '../../components/StatusTimeline';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';

// Pickup-leg statuses where reassigning a rider is meaningful.
const REASSIGNABLE = ['rider_assigned', 'rider_on_the_way', 'rider_arrived'];

export default function AdminOrderDetailsScreen({ route, navigation }) {
  const { id } = route.params;
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [riderModal, setRiderModal] = useState(false);
  const [riders, setRiders] = useState([]);

  useEffect(() => { loadDetails(); }, [id]);

  async function loadDetails() {
    try {
      const res = await ordersAPI.getById(id);
      setRequest(res.data.request);
    } catch (error) {
      Alert.alert('Error', 'Failed to load order details.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus() {
    if (!newStatus) {
      Alert.alert('Error', 'Please select a new status.');
      return;
    }
    setUpdating(true);
    try {
      await adminAPI.updateOrderStatus(id, { newStatus, adminNotes });
      Alert.alert('Success', 'Status updated successfully.');
      setModalVisible(false);
      setNewStatus('');
      setAdminNotes('');
      loadDetails();
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to update status.');
    } finally {
      setUpdating(false);
    }
  }

  async function openReassign() {
    try {
      const res = await adminAPI.getRiders();
      setRiders(res.data.riders || []);
      setRiderModal(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to load riders.');
    }
  }

  async function doReassign(riderId) {
    try {
      await adminAPI.reassignRider(id, riderId);
      setRiderModal(false);
      Alert.alert('Success', 'Rider reassigned.');
      loadDetails();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to reassign rider.');
    }
  }

  // Admin/superadmin allowed status changes come from the backend state machine.
  const statusActions = request?.allowedActions || [];
  const canReassign = request && REASSIGNABLE.includes(request.status);

  if (loading) return (
    <View style={styles.container}>
      <View style={{ padding: 16 }}>
        <Skeleton width="100%" height={60} radius={12} />
        <Skeleton width="100%" height={200} radius={12} style={{ marginTop: 12 }} />
        <SkeletonCard style={{ marginHorizontal: 0 }} />
      </View>
    </View>
  );
  if (!request) return null;

  const canUpdate = statusActions.length > 0;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerCard}>
        <View>
          <Text style={styles.reqNum}>#{request.requestNumber}</Text>
          <View style={[styles.badge, { backgroundColor: getStatusColor(request.status) }]}>
            <Text style={styles.badgeText}>{formatStatus(request.status)}</Text>
          </View>
        </View>
        {canUpdate && (
          <TouchableOpacity style={styles.updateBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="create-outline" size={20} color="#fff" />
            <Text style={styles.updateBtnText}>Manage</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Assigned parties + reassign */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Assignment</Text>
        <InfoRow label="Pickup Rider" value={request.assignedRider?.name || 'Unassigned'} />
        <InfoRow label="Delivery Rider" value={request.deliveryRider?.name || 'Unassigned'} />
        <InfoRow label="Laundromat" value={request.provider?.name || 'Unassigned'} />
        {canReassign && (
          <TouchableOpacity style={styles.reassignBtn} onPress={openReassign}>
            <Ionicons name="swap-horizontal-outline" size={18} color="#dc3545" />
            <Text style={styles.reassignText}>Reassign Rider</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Customer */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer</Text>
        <Text style={styles.infoValueBold}>{request.user?.firstName} {request.user?.lastName}</Text>
        <Text style={styles.infoSub}>{request.user?.email} · {request.user?.phone}</Text>
      </View>

      {/* ★ SMART Status Timeline */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Order Progress</Text>
        <StatusTimeline
          currentStatus={request.status}
          statusHistory={request.statusHistory || []}
        />
      </View>

      {/* Order Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Order Details</Text>
        <InfoRow label="Service" value={request.laundryType} />
        <InfoRow label="Weight" value={`${request.weightKg} kg`} />
        <InfoRow label="Amount" value={formatCurrency(request.totalAmount)} />
        <InfoRow label="Payment" value={formatStatus(request.paymentStatus)} />
        <InfoRow label="Pickup" value={`${formatDate(request.pickupDate)} ${formatTime(request.pickupTime)}`} />
        <InfoRow label="Pickup Address" value={request.pickupAddress} />
        <InfoRow label="Delivery Address" value={request.deliveryAddress} />
        {request.specialInstructions && <InfoRow label="Instructions" value={request.specialInstructions} />}
        {request.adminNotes && <InfoRow label="Admin Notes" value={request.adminNotes} />}
      </View>

      <View style={{ height: 30 }} />

      {/* Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Status</Text>
            <Text style={styles.label}>New Status</Text>
            {statusActions.map((opt) => (
              <TouchableOpacity key={opt.to} style={[styles.statusOpt, newStatus === opt.to && styles.statusOptActive]} onPress={() => setNewStatus(opt.to)}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(opt.to) }]} />
                <Text style={[styles.statusOptText, newStatus === opt.to && { color: '#fff', fontWeight: '700' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput style={[styles.modalInput, { minHeight: 60 }]} value={adminNotes} onChangeText={setAdminNotes} multiline placeholder="Add notes..." />
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#6b7280' }]} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#dc3545' }]} onPress={handleUpdateStatus} disabled={updating}>
                {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalBtnText}>Update</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reassign rider modal */}
      <Modal visible={riderModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Reassign Rider</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {riders.length === 0 && <Text style={styles.infoSub}>No active riders available.</Text>}
              {riders.map((r) => (
                <TouchableOpacity key={r.id} style={styles.statusOpt} onPress={() => doReassign(r.id)}>
                  <Ionicons name="bicycle-outline" size={18} color="#dc3545" />
                  <Text style={styles.statusOptText}>{r.firstName} {r.lastName} · {r.riderStatus} · {r.totalPickups} pickups</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#6b7280' }]} onPress={() => setRiderModal(false)}>
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function InfoRow({ label, value }) {
  return <View style={{ marginBottom: 8 }}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 2 },
  reqNum: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 6, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  updateBtn: { flexDirection: 'row', backgroundColor: '#dc3545', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', gap: 6 },
  updateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 12 },
  infoLabel: { fontSize: 12, color: '#6b7280' },
  infoValue: { fontSize: 14, color: '#1f2937' },
  infoValueBold: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  infoSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  reassignBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#dc3545' },
  reassignText: { color: '#dc3545', fontWeight: '700', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#1f2937', marginTop: 12, marginBottom: 6 },
  statusOpt: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6, gap: 10 },
  statusOptActive: { backgroundColor: '#dc3545', borderColor: '#dc3545' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptText: { fontSize: 14, color: '#374151' },
  modalInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  modalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  modalBtnText: { color: '#fff', fontWeight: '600' },
});
