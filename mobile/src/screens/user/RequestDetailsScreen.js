import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ordersAPI, reviewsAPI } from '../../api/client';
import {
  formatCurrency, formatDate, formatDateTime, formatTime,
  formatStatus, getStatusColor,
} from '../../utils/helpers';
import StatusTimeline from '../../components/StatusTimeline';
import StarRating from '../../components/StarRating';
import ETACard from '../../components/ETACard';
import ProviderInfoCard from '../../components/ProviderInfoCard';
import { metaFor, isTerminal as isTerminalStatus } from '../../utils/orderStatus';
import { subscribeToOrder, connectSocket } from '../../services/realtime';
import LiveRiderMap from '../../components/LiveRiderMap';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';

export default function RequestDetailsScreen({ route, navigation }) {
  const { id } = route.params;
  const [request, setRequest] = useState(null);
  const [eta, setEta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewData, setReviewData] = useState(null);
  const [checkingReview, setCheckingReview] = useState(false);

  useEffect(() => {
    loadDetails();

    // Connect to real-time updates
    connectSocket();

    // Subscribe to canonical order updates — the payload carries the full
    // shaped order, so we just merge it in. No manual refresh needed.
    const unsubscribe = subscribeToOrder(id, (updateData) => {
      if (updateData.order) {
        setRequest((prev) => ({ ...prev, ...updateData.order }));
        if (updateData.order.eta) setEta(updateData.order.eta);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [id]);

  // Refetch when returning from a successful payment (PaymentScreen passes `paid`).
  useEffect(() => {
    if (route.params?.paid) loadDetails();
  }, [route.params?.paid]);

  async function loadDetails() {
    try {
      const res = await ordersAPI.getById(id);
      setRequest(res.data.request);
      if (res.data.eta) setEta(res.data.eta);

      // Once complete, check if already reviewed
      if (['delivered', 'completed'].includes(res.data.request.status)) {
        setCheckingReview(true);
        try {
          const revRes = await reviewsAPI.checkOrder(id);
          setReviewData(revRes.data);
        } catch (e) {
          // ignore
        }
        setCheckingReview(false);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load request details.');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    Alert.alert('Cancel Request', 'Are you sure?', [
      { text: 'No' },
      {
        text: 'Yes, Cancel', style: 'destructive',
        onPress: async () => {
          try {
            await ordersAPI.cancel(id);
            Alert.alert('Success', 'Request cancelled.');
            loadDetails();
          } catch (error) {
            Alert.alert('Error', error.response?.data?.error || 'Failed to cancel.');
          }
        },
      },
    ]);
  }

  function openReview() {
    navigation.navigate('Review', {
      orderId: request.id,
      providerId: request.provider?.id ?? null,
      providerName: request.provider?.name ?? null,
      requestNumber: request.requestNumber,
    });
  }

  if (loading) return (
    <View style={styles.container}>
      <View style={{ padding: 16 }}>
        <Skeleton width="100%" height={60} radius={12} />
        <Skeleton width="100%" height={200} radius={12} style={{ marginTop: 16 }} />
        <SkeletonCard style={{ marginHorizontal: 0 }} />
      </View>
    </View>
  );
  if (!request) return null;

  const isDelivered = ['delivered', 'completed'].includes(request.status);
  const hasReview = reviewData?.hasReview;
  const existingReview = reviewData?.review;
  const canCancel = (request.allowedActions || []).some((a) => a.to === 'cancelled');
  const inTransit = [
    'rider_assigned', 'rider_on_the_way', 'rider_arrived', 'picked_up',
    'delivery_rider_assigned', 'rider_to_laundromat', 'collected_from_laundromat',
    'out_for_delivery', 'rider_arrived_at_customer',
  ].includes(request.status);

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <Text style={styles.reqNum}>#{request.requestNumber}</Text>
        <View style={[styles.badge, { backgroundColor: getStatusColor(request.status) }]}>
          <Text style={styles.badgeText}>{formatStatus(request.status)}</Text>
        </View>
      </View>

      {/* ★ Laundry Provider card — visible through the whole lifecycle */}
      {request.provider && (
        <ProviderInfoCard provider={request.provider} style={styles.providerCard} />
      )}

      {/* ★ Pricing & Payment */}
      {request.status !== 'cancelled' && !isTerminalStatus(request.status) && (
        request.paymentStatus === 'paid' ? (
          <View style={styles.paidBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#059669" />
            <Text style={styles.paidBannerText}>Payment complete — {formatCurrency(request.amountDue)}</Text>
          </View>
        ) : !request.weightVerified ? (
          // Before the laundromat verifies the weight — no charge yet.
          <View style={styles.estimateBanner}>
            <View style={styles.estimateBannerTop}>
              <Ionicons name="information-circle-outline" size={18} color="#d97706" />
              <Text style={styles.estimateBannerTitle}>Estimated Total (Subject to Verification)</Text>
            </View>
            <Text style={styles.estimateBannerAmount}>{formatCurrency(request.estimatedAmount)}</Text>
            <Text style={styles.estimateBannerHint}>You'll pay the final amount once the laundromat weighs your laundry.</Text>
          </View>
        ) : (
          // Verified — customer pays the FINAL amount.
          <TouchableOpacity
            style={styles.payBanner}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('Payment', {
              orderId: request.id,
              amount: request.amountDue,
              requestNumber: request.requestNumber,
            })}
          >
            <View style={styles.payBannerLeft}>
              <Ionicons name="card" size={20} color="#fff" />
              <View>
                <Text style={styles.payBannerTitle}>Pay Final Amount</Text>
                <Text style={styles.payBannerSub}>{formatCurrency(request.amountDue)} · MoMo or Card</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )
      )}

      {/* ★ Pricing breakdown (once the weight is verified) */}
      {request.weightVerified && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pricing</Text>
          <PriceRow label="Estimated Weight" value={`${request.estimatedWeightKg} kg`} />
          <PriceRow label="Actual Weight" value={`${request.actualWeightKg} kg`} />
          <PriceRow label="Estimated Cost" value={formatCurrency(request.estimatedAmount)} muted />
          <PriceRow label="Final Cost" value={formatCurrency(request.finalAmount)} muted={request.promoDiscount > 0} strong={!(request.promoDiscount > 0)} />
          {request.promoDiscount > 0 && (
            <PriceRow label={`Promo${request.promoCode ? ` (${request.promoCode})` : ''}`} value={`−${formatCurrency(request.promoDiscount)}`} color="#059669" />
          )}
          {request.promoDiscount > 0 && (
            <PriceRow label="Amount Due" value={formatCurrency(request.amountDue)} strong />
          )}
          {request.priceDifference != null && (
            <PriceRow label="Difference vs estimate"
              value={`${request.priceDifference >= 0 ? '+' : ''}${formatCurrency(request.priceDifference)}`}
              color={request.priceDifference >= 0 ? '#dc2626' : '#059669'} />
          )}
          <PriceRow label="Payment Status" value={formatStatus(request.paymentStatus)}
            color={request.paymentStatus === 'paid' ? '#059669' : '#d97706'} />
        </View>
      )}

      {/* ★ Unified Status Timeline — same component/data on every screen */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Order Progress</Text>
        <View style={[styles.progressMessageCard, { borderLeftColor: metaFor(request.status).color, backgroundColor: metaFor(request.status).bgColor }]}>
          <Text style={[styles.progressMessage, { color: metaFor(request.status).color }]}>
            {metaFor(request.status).label}
          </Text>
        </View>
        <StatusTimeline currentStatus={request.status} statusHistory={request.statusHistory || []} />
      </View>

      {/* ★ Live Rider Tracking Map — shown while a rider is in transit */}
      {inTransit && (
        <View style={styles.card}>
          <View style={styles.liveTrackingHeader}>
            <Ionicons name="bicycle" size={18} color="#3b82f6" />
            <Text style={styles.cardTitle}>Live Rider Tracking</Text>
          </View>
          <LiveRiderMap
            orderId={request.id}
            userLocation={
              request.pickupLatitude && request.pickupLongitude
                ? { latitude: request.pickupLatitude, longitude: request.pickupLongitude }
                : null
            }
            pickupAddress={request.pickupAddress}
            riderPhone={request.assignedRider?.phone}
            laundromatLocation={
              request.provider?.latitude != null && request.provider?.longitude != null
                ? { latitude: request.provider.latitude, longitude: request.provider.longitude }
                : (request.laundromatLatitude != null && request.laundromatLongitude != null
                    ? { latitude: request.laundromatLatitude, longitude: request.laundromatLongitude }
                    : null)
            }
          />
        </View>
      )}

      {/* ★ ETA Card — shown for active orders */}
      {eta && (
        <View style={styles.card}>
          <ETACard eta={eta} status={request.status} />
        </View>
      )}

      {/* ★ Rate prompt — only shown after delivery */}
      {isDelivered && !checkingReview && (
        <View style={styles.card}>
          {hasReview ? (
            // Show existing review
            <View>
              <Text style={styles.cardTitle}>Your Review</Text>
              <View style={styles.reviewDisplay}>
                <StarRating rating={existingReview.rating} size={22} />
                {existingReview.comment && (
                  <Text style={styles.reviewComment}>"{existingReview.comment}"</Text>
                )}
                <Text style={styles.reviewDate}>{formatDateTime(existingReview.createdAt)}</Text>
              </View>
            </View>
          ) : (
            // Rate prompt
            <TouchableOpacity style={styles.ratePrompt} onPress={openReview}>
              <View style={styles.ratePromptIcon}>
                <Ionicons name="star" size={24} color="#f59e0b" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ratePromptTitle}>How was your experience?</Text>
                <Text style={styles.ratePromptSub}>Tap to rate this order</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Request Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Request Information</Text>
        <InfoRow label="Service Type" value={request.laundryType} />
        <InfoRow label={request.weightVerified ? 'Estimated Weight' : 'Weight'} value={`${request.estimatedWeightKg} kg`} />
        <InfoRow label="Pickup" value={`${formatDate(request.pickupDate)} at ${formatTime(request.pickupTime)}`} />
        {request.deliveryDate && (
          <InfoRow label="Delivery" value={`${formatDate(request.deliveryDate)}${request.deliveryTime ? ' at ' + formatTime(request.deliveryTime) : ''}`} />
        )}
        <InfoRow
          label={request.weightVerified ? 'Final Total' : 'Estimated Total'}
          value={formatCurrency(request.amountDue)}
          valueStyle={{ color: '#059669', fontWeight: 'bold', fontSize: 18 }} />
        <InfoRow label="Payment" value={formatStatus(request.paymentStatus)} />
        <InfoRow label="Request Date" value={formatDateTime(request.createdAt)} />
      </View>

      {/* Addresses */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Addresses</Text>
        <InfoRow label="Pickup Address" value={request.pickupAddress} />
        <InfoRow label="Delivery Address" value={request.deliveryAddress} />
      </View>

      {request.specialInstructions && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Special Instructions</Text>
          <Text style={styles.infoValue}>{request.specialInstructions}</Text>
        </View>
      )}

      {request.adminNotes && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Admin Notes</Text>
          <Text style={styles.infoValue}>{request.adminNotes}</Text>
        </View>
      )}

      {canCancel && (
        <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel}>
          <Ionicons name="close-circle-outline" size={20} color="#fff" />
          <Text style={styles.cancelBtnText}>Cancel Request</Text>
        </TouchableOpacity>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function InfoRow({ label, value, valueStyle }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function PriceRow({ label, value, muted, strong, color }) {
  return (
    <View style={styles.priceRow}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={[
        styles.priceValue,
        muted && { color: '#9ca3af' },
        strong && { fontSize: 18, fontWeight: '800', color: '#059669' },
        color && { color },
      ]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 2 },
  providerCard: { marginHorizontal: 16, marginTop: 16 },
  payBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#10b981', marginHorizontal: 16, marginTop: 16, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, elevation: 3, shadowColor: '#10b981', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  payBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payBannerTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  payBannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 1 },
  paidBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', marginHorizontal: 16, marginTop: 16, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16 },
  paidBannerText: { color: '#065f46', fontSize: 14, fontWeight: '700' },
  estimateBanner: { backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a', marginHorizontal: 16, marginTop: 16, borderRadius: 12, padding: 14 },
  estimateBannerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  estimateBannerTitle: { fontSize: 13, fontWeight: '800', color: '#92400e' },
  estimateBannerAmount: { fontSize: 26, fontWeight: '900', color: '#78350f', marginTop: 6 },
  estimateBannerHint: { fontSize: 12, color: '#b45309', marginTop: 4 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  priceLabel: { fontSize: 14, color: '#6b7280' },
  priceValue: { fontSize: 15, color: '#1f2937', fontWeight: '700' },
  reqNum: { fontSize: 20, fontWeight: 'bold', color: '#1f2937' },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 12, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937', marginBottom: 12 },
  infoRow: { marginBottom: 10 },
  infoLabel: { fontSize: 12, color: '#6b7280', marginBottom: 2 },
  infoValue: { fontSize: 15, color: '#1f2937' },

  // Rate prompt
  ratePrompt: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ratePromptIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },
  ratePromptTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  ratePromptSub: { fontSize: 13, color: '#6b7280', marginTop: 1 },

  // Existing review
  reviewDisplay: { gap: 6 },
  reviewComment: { fontSize: 14, color: '#374151', fontStyle: 'italic', marginTop: 4 },
  reviewDate: { fontSize: 11, color: '#9ca3af' },

  cancelBtn: { flexDirection: 'row', backgroundColor: '#ef4444', marginHorizontal: 16, marginTop: 16, borderRadius: 10, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', gap: 8 },
  cancelBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  
  // Progress display
  progressMessageCard: { marginBottom: 16, padding: 12, backgroundColor: '#f0f9ff', borderRadius: 8, borderLeftWidth: 3, borderLeftColor: '#3b82f6' },
  progressMessage: { fontSize: 15, fontWeight: '600', color: '#1e40af' },
  progressSteps: { gap: 16 },
  progressStep: { flexDirection: 'row', alignItems: 'flex-start' },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f3f4f6',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  progressStepContent: { flex: 1, paddingTop: 2 },
  progressStepLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 2 },
  progressStepDescription: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  // Live tracking
  liveTrackingHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
});
