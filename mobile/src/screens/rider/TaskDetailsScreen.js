import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { riderAPI } from '../../api/client';
import { formatTime } from '../../utils/helpers';
import { metaFor } from '../../utils/orderStatus';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';

// Pickup-leg steps and the endpoint that advances FROM each one.
const PICKUP_FLOW = ['rider_assigned', 'rider_on_the_way', 'rider_arrived', 'picked_up', 'at_laundromat'];
const STEPS = PICKUP_FLOW.map((key) => ({ key, label: metaFor(key).label, icon: metaFor(key).icon }));

const NEXT = {
  rider_assigned:   { label: 'Start — On The Way', fn: (id) => riderAPI.markOnTheWay(id) },
  rider_on_the_way: { label: 'Mark Arrived',       fn: (id) => riderAPI.markArrived(id) },
  rider_arrived:    { label: 'Mark Picked Up',     fn: (id) => riderAPI.markPickedUp(id) },
  picked_up:        { label: 'Delivered to Laundromat', fn: (id, t) => riderAPI.markAtLaundromat(id, t.provider?.latitude, t.provider?.longitude), done: true },
};

export default function TaskDetailsScreen({ route, navigation }) {
  const { orderId } = route.params || {};
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await riderAPI.getTasks();
      const found = (res.data.tasks || []).find((t) => t.id === orderId);
      setTask(found || null);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function advance() {
    if (!task) return;
    const step = NEXT[task.status];
    if (!step) return;
    setWorking(true);
    try {
      await step.fn(orderId, task);
      if (step.done) {
        Alert.alert('Delivered', 'Task delivered to the laundromat.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
        return;
      }
      await load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Could not update status.');
    } finally {
      setWorking(false);
    }
  }

  if (loading) return (
    <View style={styles.container}>
      <View style={{ padding: 16 }}>
        <Skeleton width="100%" height={80} radius={12} />
        <Skeleton width="100%" height={180} radius={12} style={{ marginTop: 12 }} />
        <SkeletonCard style={{ marginHorizontal: 0 }} />
      </View>
    </View>
  );
  if (!task) {
    return (
      <View style={styles.center}>
        <Ionicons name="checkmark-circle-outline" size={56} color="#10b981" />
        <Text style={styles.doneTitle}>Task complete</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>Back to Tasks</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.key === task.status);
  const nextLabel = NEXT[task.status] ? NEXT[task.status].label : null;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.orderNum}>Order #{task.requestNumber}</Text>
        <Text style={styles.customer}>{task.customer?.name}</Text>
      </View>

      {/* Status stepper */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Task Progress</Text>
        {STEPS.map((s, i) => {
          const done = i < currentIdx;
          const cur = i === currentIdx;
          return (
            <View key={s.key} style={styles.stepRow}>
              <View style={[styles.stepDot, done && styles.stepDone, cur && styles.stepCur]}>
                <Ionicons name={done ? 'checkmark' : s.icon} size={14} color={done || cur ? '#fff' : '#9ca3af'} />
              </View>
              <Text style={[styles.stepLabel, cur && styles.stepLabelCur, i > currentIdx && styles.stepLabelPending]}>{s.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Details */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pickup</Text>
        <Detail icon="location-outline" text={task.pickupAddress} />
        {task.distanceKm != null && <Detail icon="navigate-outline" text={`${task.distanceKm} km away · ~${task.etaMin} min`} />}
        <Detail icon="shirt-outline" text={`${task.laundryType} · ${task.weightKg} kg`} />
        {!!task.pickupTime && <Detail icon="time-outline" text={`Pickup time ${formatTime(task.pickupTime)}`} />}
      </View>

      {!!task.provider?.name && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Deliver to laundromat</Text>
          <Detail icon="storefront-outline" text={task.provider.name} />
          {!!task.provider.address && <Detail icon="location-outline" text={task.provider.address} />}
        </View>
      )}

      {/* Quick actions */}
      <View style={styles.quickRow}>
        <TouchableOpacity style={[styles.quickBtn, { backgroundColor: '#3b82f6' }]} onPress={() => navigation.navigate('RiderNavigation', { orderId })}>
          <Ionicons name="navigate" size={18} color="#fff" /><Text style={styles.quickText}>Navigate</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.quickBtn, { backgroundColor: '#10b981' }]} onPress={() => task.customer?.phone && Linking.openURL(`tel:${task.customer.phone}`)}>
          <Ionicons name="call" size={18} color="#fff" /><Text style={styles.quickText}>Call</Text>
        </TouchableOpacity>
      </View>

      {/* Primary status action */}
      {nextLabel && (
        <TouchableOpacity style={styles.primaryBtn} onPress={advance} disabled={working}>
          {working ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="arrow-forward-circle" size={20} color="#fff" />
              <Text style={styles.primaryText}>{nextLabel}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function Detail({ icon, text }) {
  return (
    <View style={styles.detailRow}>
      <Ionicons name={icon} size={16} color="#6b7280" />
      <Text style={styles.detailText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, backgroundColor: '#f8f9fa' },
  doneTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  backBtn: { backgroundColor: '#1B7BF7', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28 },
  backText: { color: '#fff', fontWeight: '700' },
  headerCard: { backgroundColor: '#1B7BF7', margin: 16, marginBottom: 0, borderRadius: 12, padding: 16 },
  orderNum: { fontSize: 20, fontWeight: '800', color: '#fff' },
  customer: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  card: { backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginBottom: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  stepDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: '#10b981' },
  stepCur: { backgroundColor: '#1B7BF7' },
  stepLabel: { fontSize: 14, color: '#374151', fontWeight: '600' },
  stepLabelCur: { color: '#1B7BF7', fontWeight: '800' },
  stepLabelPending: { color: '#9ca3af' },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  detailText: { fontSize: 14, color: '#374151', flex: 1 },
  quickRow: { flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 16 },
  quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 13 },
  quickText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f59e0b', marginHorizontal: 16, marginTop: 12, borderRadius: 12, paddingVertical: 16, elevation: 2 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
