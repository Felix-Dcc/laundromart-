import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ordersAPI, providerAPI } from '../../api/client';
import {
  formatCurrency, formatDate, formatDateTime, formatTime,
  formatStatus, getStatusColor,
} from '../../utils/helpers';
import StatusTimeline from '../../components/StatusTimeline';
import ETACard from '../../components/ETACard';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';
import { subscribeToOrder } from '../../services/realtime';

export default function ProviderOrderDetailsScreen({ route, navigation }) {
  const { id } = route.params;
  const [request, setRequest] = useState(null);
  const [eta, setEta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [actualWeight, setActualWeight] = useState('');
  const [verifying, setVerifying] = useState(false);

  useEffect(() => { loadDetails(); }, [id]);

  // Live updates (rider delivery steps, payment) — no manual refresh.
  useEffect(() => {
    const unsub = subscribeToOrder(id, (d) => {
      if (d.order) { setRequest((prev) => ({ ...prev, ...d.order })); if (d.order.eta) setEta(d.order.eta); }
    });
    return () => unsub && unsub();
  }, [id]);

  async function handleVerify() {
    const w = parseFloat(actualWeight);
    if (!w || w <= 0 || w > 50) { Alert.alert('Weight', 'Enter an actual weight between 0.1 and 50 kg.'); return; }
    const preview = request.pricePerKg != null ? request.pricePerKg * w : null;
    Alert.alert(
      'Confirm Verification',
      `Actual weight: ${w} kg${preview != null ? `\nFinal total: ${formatCurrency(preview)}` : ''}\n\nThe customer will be notified to pay this amount. This cannot be changed after payment.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm', onPress: async () => {
            setVerifying(true);
            try {
              await providerAPI.verifyWeight(id, w);
              Alert.alert('Weight Verified', 'The customer has been notified to complete payment.');
              setActualWeight('');
              loadDetails();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.error || 'Failed to verify weight.');
            } finally { setVerifying(false); }
          },
        },
      ],
    );
  }

  async function loadDetails() {
    try {
      const res = await ordersAPI.getById(id);
      setRequest(res.data.request);
      if (res.data.eta) setEta(res.data.eta);
    } catch (error) {
      Alert.alert('Error', 'Failed to load order details.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus() {
    if (!newStatus) {
      Alert.alert('Error', 'Please select the next status.');
      return;
    }
    setUpdating(true);
    try {
      await providerAPI.setStatus(id, newStatus, adminNotes);
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

  // Provider's allowed forward steps come straight from the backend state
  // machine (already role-scoped). Exclude cancel from this quick picker.
  const providerActions = (request?.allowedActions || []).filter((a) => a.to !== 'cancelled');

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

  const isPaid = request.paymentStatus === 'paid';
  const needsVerify = request.status === 'at_laundromat';
  const awaitingPayment = request.status === 'weight_verified' && !isPaid;
  // Hide the generic status picker while verifying weight or awaiting payment.
  const canUpdate = providerActions.length > 0 && !needsVerify && !awaitingPayment;
  const weightPreview = request.pricePerKg != null && parseFloat(actualWeight) > 0
    ? request.pricePerKg * parseFloat(actualWeight) : null;

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <View>
          <Text style={styles.reqNum}>#{request.requestNumber}</Text>
          <View style={[styles.badge, { backgroundColor: getStatusColor(request.status) }]}>
            <Text style={styles.badgeText}>{formatStatus(request.status)}</Text>
          </View>
        </View>
        {canUpdate && (
          <TouchableOpacity style={styles.updateBtn} onPress={() => setModalVisible(true)}>
            <Ionicons name="arrow-up-circle-outline" size={20} color="#fff" />
            <Text style={styles.updateBtnText}>Update</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Customer Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer</Text>
        <Text style={styles.infoValueBold}>{request.user?.firstName} {request.user?.lastName}</Text>
        <Text style={styles.infoSub}>{request.user?.email}</Text>
        <Text style={styles.infoSub}>{request.user?.phone}</Text>
      </View>

      {/* ★ Verify Laundry — shown right after the laundry arrives */}
      {needsVerify && (
        <View style={[styles.card, styles.verifyCard]}>
          <View style={styles.verifyHeader}>
            <Ionicons name="scale-outline" size={20} color="#8b5cf6" />
            <Text style={styles.verifyTitle}>Verify Laundry Weight</Text>
          </View>
          <Text style={styles.verifyHint}>Weigh the laundry and enter the actual weight. The final price is calculated automatically.</Text>

          <View style={styles.verifyGrid}>
            <View style={styles.verifyCell}>
              <Text style={styles.verifyCellLabel}>Estimated Weight</Text>
              <Text style={styles.verifyCellValue}>{request.estimatedWeightKg} kg</Text>
            </View>
            <View style={styles.verifyCell}>
              <Text style={styles.verifyCellLabel}>Estimated Total</Text>
              <Text style={styles.verifyCellValue}>{formatCurrency(request.estimatedAmount)}</Text>
            </View>
          </View>

          <Text style={styles.label}>Actual Weight (kg)</Text>
          <View style={styles.weightInputRow}>
            <TextInput
              style={styles.weightInput}
              placeholder="0.0"
              value={actualWeight}
              onChangeText={setActualWeight}
              keyboardType="decimal-pad"
            />
            <Text style={styles.weightUnit}>kg</Text>
          </View>

          {request.pricePerKg != null && (
            <Text style={styles.formula}>Formula: {formatCurrency(request.pricePerKg)}/kg × {actualWeight || '0'} kg</Text>
          )}

          {weightPreview != null && (
            <View style={styles.finalPreview}>
              <Text style={styles.finalPreviewLabel}>Final Total</Text>
              <Text style={styles.finalPreviewValue}>{formatCurrency(weightPreview)}</Text>
              <Text style={[styles.finalDiff, { color: weightPreview - Number(request.estimatedAmount) >= 0 ? '#dc2626' : '#059669' }]}>
                {weightPreview - Number(request.estimatedAmount) >= 0 ? '+' : ''}{formatCurrency(weightPreview - Number(request.estimatedAmount))} vs estimate
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify} disabled={verifying}>
            {verifying ? <ActivityIndicator color="#fff" /> : (
              <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.verifyBtnText}>Confirm & Verify Weight</Text></>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ★ Awaiting payment — provider cannot wash until the customer pays */}
      {awaitingPayment && (
        <View style={[styles.card, styles.awaitCard]}>
          <View style={styles.verifyHeader}>
            <Ionicons name="hourglass-outline" size={20} color="#d97706" />
            <Text style={[styles.verifyTitle, { color: '#92400e' }]}>Awaiting Customer Payment</Text>
          </View>
          <Text style={styles.awaitHint}>Final total {formatCurrency(request.finalAmount)} — washing can begin once the customer completes payment.</Text>
        </View>
      )}

      {/* ★ Pricing breakdown (once verified) */}
      {request.weightVerified && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pricing Breakdown</Text>
          <InfoRow label="Estimated Weight" value={`${request.estimatedWeightKg} kg`} />
          <InfoRow label="Actual Weight" value={`${request.actualWeightKg} kg`} />
          <InfoRow label="Estimated Total" value={formatCurrency(request.estimatedAmount)} />
          <InfoRow label="Final Total" value={formatCurrency(request.finalAmount)} valueStyle={{ color: '#059669', fontWeight: '800' }} />
          {request.priceDifference != null && (
            <InfoRow label="Difference" value={`${request.priceDifference >= 0 ? '+' : ''}${formatCurrency(request.priceDifference)}`}
              valueStyle={{ color: request.priceDifference >= 0 ? '#dc2626' : '#059669', fontWeight: '700' }} />
          )}
          <InfoRow label="Payment" value={formatStatus(request.paymentStatus)} valueStyle={{ color: isPaid ? '#059669' : '#d97706', fontWeight: '700' }} />
        </View>
      )}

      {/* ★ SMART Status Timeline */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Order Progress</Text>
        <StatusTimeline
          currentStatus={request.status}
          statusHistory={request.statusHistory || []}
        />
      </View>

      {/* ★ ETA Card */}
      {eta && (
        <View style={styles.card}>
          <ETACard eta={eta} status={request.status} />
        </View>
      )}

      {/* Order Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Order Details</Text>
        <InfoRow label="Service" value={request.laundryType} />
        <InfoRow label="Estimated Weight" value={`${request.estimatedWeightKg} kg`} />
        <InfoRow label="Estimated Total" value={formatCurrency(request.estimatedAmount)} valueStyle={{ color: '#6b7280', fontWeight: '700' }} />
        <InfoRow label="Pickup" value={`${formatDate(request.pickupDate)} at ${formatTime(request.pickupTime)}`} />
        <InfoRow label="Pickup Address" value={request.pickupAddress} />
        <InfoRow label="Delivery Address" value={request.deliveryAddress} />
        {request.specialInstructions && <InfoRow label="Instructions" value={request.specialInstructions} />}
      </View>

      <View style={{ height: 30 }} />

      {/* Status Update Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Order Status</Text>
            <Text style={styles.modalSubtitle}>#{request.requestNumber}</Text>

            <Text style={styles.label}>Next Status</Text>
            {providerActions.map((opt) => (
              <TouchableOpacity key={opt.to} style={[styles.statusOption, newStatus === opt.to && styles.statusOptionActive]} onPress={() => setNewStatus(opt.to)}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(opt.to) }]} />
                <Text style={[styles.statusOptionText, newStatus === opt.to && { color: '#fff', fontWeight: '700' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput style={[styles.modalInput, { minHeight: 60 }]} value={adminNotes} onChangeText={setAdminNotes} multiline placeholder="Add notes..." />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelModalBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmModalBtn} onPress={handleUpdateStatus} disabled={updating}>
                {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmModalText}>Update</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function InfoRow({ label, value, valueStyle }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueStyle]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 2 },
  reqNum: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 6, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  updateBtn: { flexDirection: 'row', backgroundColor: '#198754', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', gap: 6 },
  updateBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  card: { backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 12 },
  infoLabel: { fontSize: 12, color: '#6b7280' },
  infoValue: { fontSize: 15, color: '#1f2937' },
  infoValueBold: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  infoSub: { fontSize: 14, color: '#6b7280', marginTop: 2 },

  // Verify Laundry
  verifyCard: { borderWidth: 1.5, borderColor: '#ddd6fe' },
  verifyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  verifyTitle: { fontSize: 16, fontWeight: '800', color: '#6d28d9' },
  verifyHint: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  verifyGrid: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  verifyCell: { flex: 1, backgroundColor: '#f5f3ff', borderRadius: 10, padding: 12 },
  verifyCellLabel: { fontSize: 11, color: '#8b5cf6', fontWeight: '700' },
  verifyCellValue: { fontSize: 16, fontWeight: '800', color: '#4c1d95', marginTop: 3 },
  weightInputRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: '#ddd6fe', borderRadius: 11, paddingHorizontal: 14, paddingVertical: 4, marginTop: 4 },
  weightInput: { flex: 1, fontSize: 22, fontWeight: '800', color: '#1f2937', paddingVertical: 8 },
  weightUnit: { fontSize: 16, color: '#8b5cf6', fontWeight: '800' },
  formula: { fontSize: 12, color: '#6b7280', marginTop: 8 },
  finalPreview: { alignItems: 'center', backgroundColor: '#ecfdf5', borderRadius: 12, padding: 14, marginTop: 12 },
  finalPreviewLabel: { fontSize: 12, color: '#059669', fontWeight: '700' },
  finalPreviewValue: { fontSize: 28, fontWeight: '900', color: '#065f46', marginTop: 2 },
  finalDiff: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#8b5cf6', borderRadius: 12, paddingVertical: 15, marginTop: 14 },
  verifyBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  awaitCard: { borderWidth: 1.5, borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  awaitHint: { fontSize: 14, color: '#92400e' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  modalSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#1f2937', marginTop: 12, marginBottom: 6 },
  statusOption: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 6, gap: 10 },
  statusOptionActive: { backgroundColor: '#198754', borderColor: '#198754' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusOptionText: { fontSize: 15, color: '#374151' },
  modalInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 },
  cancelModalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#6b7280' },
  cancelModalText: { color: '#fff', fontWeight: '600' },
  confirmModalBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#198754' },
  confirmModalText: { color: '#fff', fontWeight: '600' },
});
