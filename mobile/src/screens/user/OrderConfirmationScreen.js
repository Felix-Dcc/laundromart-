import React, { useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ProviderInfoCard from '../../components/ProviderInfoCard';
import { formatTime, formatDate, formatCurrency } from '../../utils/helpers';

export default function OrderConfirmationScreen({ route, navigation }) {
  const { order } = route.params || {};
  const provider = order?.provider || null;

  // Success check-mark pop.
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, tension: 80, friction: 7 }).start();
  }, []);

  if (!order) {
    return (
      <View style={styles.center}>
        <Text>Order details unavailable.</Text>
      </View>
    );
  }

  const pickupText = `${formatDate(order.pickupDate)} at ${formatTime(order.pickupTime)}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Success hero */}
      <View style={styles.hero}>
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: pop }] }]}>
          <Ionicons name="checkmark" size={44} color="#fff" />
        </Animated.View>
        <Text style={styles.heroTitle}>Order Placed Successfully</Text>
        {provider ? (
          <Text style={styles.heroSub}>Your request has been sent to</Text>
        ) : (
          <Text style={styles.heroSub}>Your request has been submitted</Text>
        )}
        {provider && <Text style={styles.heroProvider}>🏪 {provider.name}</Text>}
      </View>

      {/* Provider card */}
      {provider && (
        <ProviderInfoCard provider={provider} title="Laundry Provider" style={styles.providerCard} />
      )}

      {/* Order summary */}
      <View style={styles.summaryCard}>
        <SummaryRow icon="receipt-outline" label="Order Number" value={`#${order.requestNumber}`} highlight />
        <SummaryRow icon="time-outline" label="Estimated Pickup" value={pickupText} />
        <SummaryRow icon="shirt-outline" label="Service" value={order.laundryType} />
        <SummaryRow icon="cash-outline" label="Estimated Total" value={`${formatCurrency(order.estimatedAmount ?? order.totalAmount)} · subject to verification`} />
        {provider?.address ? (
          <SummaryRow icon="location-outline" label="Address" value={provider.address} />
        ) : null}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {order.paymentStatus !== 'paid' && order.status !== 'cancelled' && (
          <TouchableOpacity
            style={styles.payBtn}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('Payment', {
              orderId: order.id,
              amount: order.totalAmount,
              requestNumber: order.requestNumber,
            })}
          >
            <Ionicons name="card" size={20} color="#fff" />
            <Text style={styles.payText}>Pay Now</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.trackBtn}
          activeOpacity={0.9}
          onPress={() => navigation.replace('RequestDetails', { id: order.id })}
        >
          <Ionicons name="navigate-circle" size={20} color="#fff" />
          <Text style={styles.trackText}>Track Order</Text>
        </TouchableOpacity>

        {provider && (
          <View style={styles.secondaryRow}>
            <TouchableOpacity
              style={[styles.secBtn, { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }]}
              activeOpacity={0.85}
              onPress={() => provider.phone && Linking.openURL(`tel:${provider.phone}`)}
            >
              <Ionicons name="call" size={17} color="#059669" />
              <Text style={[styles.secText, { color: '#059669' }]}>Call Laundromat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secBtn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}
              activeOpacity={0.85}
              onPress={() => {
                if (provider.latitude != null && provider.longitude != null) {
                  Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${provider.latitude},${provider.longitude}`);
                }
              }}
            >
              <Ionicons name="navigate" size={17} color="#2563eb" />
              <Text style={[styles.secText, { color: '#2563eb' }]}>View Directions</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.homeBtn}
          onPress={() => navigation.navigate('MyRequests')}
          activeOpacity={0.8}
        >
          <Text style={styles.homeText}>Back to My Orders</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function SummaryRow({ icon, label, value, highlight }) {
  return (
    <View style={styles.sumRow}>
      <View style={styles.sumIcon}>
        <Ionicons name={icon} size={16} color="#6b7280" />
      </View>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={[styles.sumValue, highlight && styles.sumValueHi]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  hero: { alignItems: 'center', paddingTop: 36, paddingBottom: 24, paddingHorizontal: 24 },
  checkCircle: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#10b981',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10b981', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#1f2937', marginTop: 18, textAlign: 'center' },
  heroSub: { fontSize: 14, color: '#6b7280', marginTop: 6 },
  heroProvider: { fontSize: 18, fontWeight: '800', color: '#2563eb', marginTop: 6, textAlign: 'center' },

  providerCard: { marginHorizontal: 16, marginTop: 4 },

  summaryCard: { backgroundColor: '#fff', borderRadius: 16, marginHorizontal: 16, marginTop: 16, padding: 8, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  sumRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 10, gap: 10 },
  sumIcon: { width: 30, height: 30, borderRadius: 9, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  sumLabel: { fontSize: 13, color: '#6b7280', width: 110 },
  sumValue: { flex: 1, fontSize: 14, color: '#1f2937', fontWeight: '600', textAlign: 'right' },
  sumValueHi: { color: '#2563eb', fontWeight: '800' },

  actions: { paddingHorizontal: 16, marginTop: 20, gap: 12 },
  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 15, elevation: 3, shadowColor: '#10b981', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  payText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  trackBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1B7BF7', borderRadius: 12, paddingVertical: 15, elevation: 3, shadowColor: '#1B7BF7', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  trackText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11, paddingVertical: 12, borderWidth: 1 },
  secText: { fontSize: 13, fontWeight: '700' },
  homeBtn: { alignItems: 'center', paddingVertical: 12 },
  homeText: { fontSize: 14, color: '#6b7280', fontWeight: '600' },
});
