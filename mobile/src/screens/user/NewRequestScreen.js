import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, Linking, Modal, Platform,
  Animated, Dimensions,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { pricingAPI, ordersAPI } from '../../api/client';
import { formatCurrency, isToday as isTodayISO, nowRoundedUpTo5HHMM, formatDate, formatTime } from '../../utils/helpers';
import { useAuth } from '../../context/AuthContext';
import DatePicker from '../../components/DatePicker';
import TimePicker from '../../components/TimePicker';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { providerLogo } from '../../theme/images';

// ── Service grid geometry ──────────────────────────────────
// Card width is computed from the screen so two columns ALWAYS fit exactly.
// (A percentage width plus margins plus gap overflowed by a few px, which made
// flexWrap drop every card onto its own row — the grid rendered as a list.)
const SCREEN_W = Dimensions.get('window').width;
const GRID_PAD = 16;   // outer padding either side
const GRID_GAP = 12;   // space between the two columns
const CARD_W = Math.floor((SCREEN_W - GRID_PAD * 2 - GRID_GAP) / 2);

// Service card icon by name.
function serviceIcon(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('dry')) return 'sparkles-outline';
  if (n.includes('iron')) return 'shirt-outline';
  if (n.includes('express')) return 'flash-outline';
  if (n.includes('delicate')) return 'flower-outline';
  if (n.includes('blanket') || n.includes('duvet') || n.includes('bed')) return 'bed-outline';
  if (n.includes('shoe') || n.includes('sneaker')) return 'footsteps-outline';
  if (n.includes('curtain')) return 'browsers-outline';
  if (n.includes('fold')) return 'layers-outline';
  return 'water-outline';
}

const PAYMENT_METHODS = [
  { key: 'momo', label: 'Mobile Money', sub: 'MTN · Vodafone · AirtelTigo', icon: 'phone-portrait-outline', primary: true },
  { key: 'card', label: 'Credit / Debit Card', sub: 'Visa · Mastercard', icon: 'card-outline' },
];

const NOTE_CHIPS = [
  'Call when you arrive.',
  'Pickup from the hostel reception.',
  'Handle delicate fabrics carefully.',
];

export default function NewRequestScreen({ navigation, route }) {
  const { user } = useAuth();
  const [laundromat, setLaundromat] = useState(route?.params?.provider || null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [promoInput, setPromoInput] = useState('');
  const [promoQuote, setPromoQuote] = useState(null); // { ok, discount, total, reason, code }
  const [promoBusy, setPromoBusy] = useState(false);

  const [form, setForm] = useState({
    pickupDate: '', pickupTime: '',
    pickupAddress: '', laundryType: '', weightKg: '',
    specialInstructions: '', paymentMethod: 'momo',
    pickupLat: null, pickupLng: null,
  });

  useEffect(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    setForm((prev) => ({
      ...prev,
      pickupDate: today.toISOString().split('T')[0],
      pickupTime: nowRoundedUpTo5HHMM(),
      pickupAddress: prev.pickupAddress || user?.address || '',
      pickupLat: prev.pickupLat ?? user?.latitude ?? null,
      pickupLng: prev.pickupLng ?? user?.longitude ?? null,
    }));
    loadServices();
  }, []);

  useEffect(() => {
    if (route?.params?.provider) setLaundromat(route.params.provider);
  }, [route?.params?.provider]);

  async function loadServices() {
    try {
      const res = await pricingAPI.getActive();
      const list = res.data.pricing || [];
      setServices(list);
      // Preselect the first service for a faster start.
      setForm((prev) => ({ ...prev, laundryType: prev.laundryType || list[0]?.serviceType || '' }));
    } catch (error) {
      Alert.alert('Error', 'Failed to load services.');
    } finally {
      setLoading(false);
    }
  }

  function update(key, value) { setForm((prev) => ({ ...prev, [key]: value })); }

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Enable location to auto-detect your pickup address.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = loc.coords;
      let address = form.pickupAddress;
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geo && geo[0]) {
          const g = geo[0];
          address = [g.name, g.street, g.district, g.city].filter(Boolean).join(', ') || address;
        }
      } catch (e) { /* keep existing address */ }
      setForm((prev) => ({ ...prev, pickupLat: latitude, pickupLng: longitude, pickupAddress: address }));
    } catch (e) {
      Alert.alert('Error', 'Could not get your current location.');
    } finally {
      setLocating(false);
    }
  }

  const selectedService = services.find((s) => s.serviceType === form.laundryType);
  const estimate = selectedService && parseFloat(form.weightKg) > 0
    ? parseFloat(selectedService.pricePerKg) * parseFloat(form.weightKg) : 0;
  const discountedTotal = promoQuote?.ok ? promoQuote.total : estimate;
  const pickupIsToday = isTodayISO(form.pickupDate);

  // A promo quote is tied to the service + weight — invalidate it if they change.
  useEffect(() => { setPromoQuote(null); }, [form.laundryType, form.weightKg]);

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) return;
    if (!form.laundryType || !(parseFloat(form.weightKg) > 0)) {
      Alert.alert('Add details first', 'Choose a service and weight before applying a promo code.');
      return;
    }
    setPromoBusy(true);
    try {
      const res = await ordersAPI.promoQuote(code, form.laundryType, parseFloat(form.weightKg));
      setPromoQuote(res.data);
      if (!res.data.ok) Alert.alert('Promo code', res.data.reason || 'This code cannot be applied.');
    } catch (e) {
      setPromoQuote({ ok: false, reason: 'Could not check the code.' });
    } finally { setPromoBusy(false); }
  }

  function validate() {
    if (!laundromat) { Alert.alert('Choose a laundromat', 'Please select a laundromat first.'); return false; }
    if (!form.laundryType) { Alert.alert('Select a service', 'Please choose a laundry service.'); return false; }
    const weight = parseFloat(form.weightKg);
    if (!weight || weight <= 0 || weight > 50) { Alert.alert('Weight', 'Enter a weight between 0.1 and 50 kg.'); return false; }
    if (!form.pickupAddress.trim()) { Alert.alert('Pickup address', 'Please enter a pickup address.'); return false; }
    if (!form.pickupTime) { Alert.alert('Pickup time', 'Please choose a pickup time.'); return false; }
    return true;
  }

  function openReview() { if (validate()) setReviewOpen(true); }

  async function confirmOrder() {
    let finalPickupTime = form.pickupTime;
    if (isTodayISO(form.pickupDate)) {
      const earliest = nowRoundedUpTo5HHMM();
      if (finalPickupTime < earliest) finalPickupTime = earliest;
    }
    setSubmitting(true);
    try {
      const res = await ordersAPI.create({
        pickupDate: form.pickupDate,
        pickupTime: finalPickupTime,
        pickupAddress: form.pickupAddress.trim(),
        // Laundry returns to the same place it was picked up from.
        deliveryAddress: form.pickupAddress.trim(),
        laundryType: form.laundryType,
        weightKg: parseFloat(form.weightKg),
        specialInstructions: form.specialInstructions || null,
        paymentMethod: form.paymentMethod,
        promoCode: promoQuote?.ok ? (promoQuote.code || promoInput.trim()) : null,
        providerId: laundromat.id,
        pickupLatitude: form.pickupLat,
        pickupLongitude: form.pickupLng,
        laundromatLatitude: laundromat.latitude ?? null,
        laundromatLongitude: laundromat.longitude ?? null,
      });
      setReviewOpen(false);
      navigation.replace('OrderConfirmation', { order: res.data.request });
    } catch (error) {
      const errors = error.response?.data?.errors || [error.response?.data?.error || 'Failed to submit request.'];
      Alert.alert('Could not place order', errors.join('\n'));
    } finally {
      setSubmitting(false);
    }
  }

  // Guard: the redesigned flow always arrives with a laundromat.
  if (!laundromat) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="storefront-outline"
          title="Choose a laundromat first"
          subtitle="Every order belongs to a specific laundromat."
          actionLabel="Choose a Laundromat"
          onAction={() => navigation.replace('ChooseLaundromat')}
        />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={{ padding: 16 }}>
          <Skeleton width="100%" height={110} radius={16} />
          <Skeleton width="100%" height={140} radius={16} style={{ marginTop: 14 }} />
          <Skeleton width="100%" height={180} radius={16} style={{ marginTop: 14 }} />
        </View>
      </View>
    );
  }

  const rating = laundromat.avgRating ?? laundromat.rating ?? 0;
  const hasPickupCoords = form.pickupLat != null && form.pickupLng != null;

  return (
    <View style={styles.container}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>
        {/* ── Order Summary (locked laundromat) ── */}
        <View style={styles.summaryCard}>
          <Avatar name={laundromat.businessName} uri={providerLogo(laundromat.id)} size={54} style={{ borderRadius: 15 }} />
          <View style={{ flex: 1 }}>
            <View style={styles.lockRow}>
              <Text style={styles.summaryName} numberOfLines={1}>{laundromat.businessName}</Text>
              <Ionicons name="lock-closed" size={13} color="#10b981" />
            </View>
            <View style={styles.summaryMeta}>
              <Ionicons name="star" size={13} color="#f59e0b" />
              <Text style={styles.summaryMetaText}>{rating > 0 ? Number(rating).toFixed(1) : 'New'}</Text>
              {laundromat.estimatedPickupMin != null && (
                <>
                  <Text style={styles.dot}>·</Text>
                  <Ionicons name="bicycle-outline" size={13} color="#8b5cf6" />
                  <Text style={styles.summaryMetaText}>~{laundromat.estimatedPickupMin} min pickup</Text>
                </>
              )}
            </View>
            {!!laundromat.address && <Text style={styles.summaryAddr} numberOfLines={1}>{laundromat.address}</Text>}
          </View>
        </View>
        <View style={styles.summaryActions}>
          <TouchableOpacity style={styles.summaryBtn} onPress={() => laundromat.phone && Linking.openURL(`tel:${laundromat.phone}`)}>
            <Ionicons name="call-outline" size={16} color="#059669" /><Text style={[styles.summaryBtnText, { color: '#059669' }]}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.summaryBtn} onPress={() => laundromat.latitude != null && Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${laundromat.latitude},${laundromat.longitude}`)}>
            <Ionicons name="navigate-outline" size={16} color="#2563eb" /><Text style={[styles.summaryBtnText, { color: '#2563eb' }]}>Directions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.summaryBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="swap-horizontal-outline" size={16} color="#6b7280" /><Text style={[styles.summaryBtnText, { color: '#6b7280' }]}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* ── Services ── */}
        <SectionTitle icon="pricetags-outline" text="Laundry Service" />
        <View style={styles.serviceGrid}>
          {services.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              active={form.laundryType === s.serviceType}
              onPress={() => update('laundryType', s.serviceType)}
            />
          ))}
        </View>

        {/* Weight */}
        <View style={styles.weightRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.weightLabel}>Estimated Weight</Text>
            <Text style={styles.weightHint}>Max 50 kg · final amount confirmed at pickup</Text>
          </View>
          <View style={styles.weightInputWrap}>
            <TextInput style={styles.weightInput} placeholder="0.0" value={form.weightKg} onChangeText={(v) => update('weightKg', v)} keyboardType="decimal-pad" />
            <Text style={styles.weightUnit}>kg</Text>
          </View>
        </View>

        {/* ── Pickup Address ── */}
        <SectionTitle icon="location-outline" text="Pickup Address" />
        <View style={styles.card}>
          <TouchableOpacity style={styles.locBtn} onPress={useCurrentLocation} disabled={locating}>
            {locating ? <ActivityIndicator size="small" color="#1B7BF7" /> : <Ionicons name="locate" size={18} color="#1B7BF7" />}
            <Text style={styles.locBtnText}>{locating ? 'Detecting…' : 'Use Current Location'}</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.addressInput}
            placeholder="Enter hostel name, room, or custom address"
            value={form.pickupAddress}
            onChangeText={(v) => update('pickupAddress', v)}
            multiline
          />
          {hasPickupCoords && (
            <View style={styles.miniMapWrap}>
              <MapView
                style={styles.miniMap}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                pointerEvents="none"
                region={{ latitude: form.pickupLat, longitude: form.pickupLng, latitudeDelta: 0.008, longitudeDelta: 0.008 }}
              >
                <Marker coordinate={{ latitude: form.pickupLat, longitude: form.pickupLng }} pinColor="#1B7BF7" />
              </MapView>
            </View>
          )}
        </View>

        {/* ── Pickup Date & Time ── */}
        <SectionTitle icon="calendar-outline" text="Pickup Schedule" />
        <View style={styles.card}>
          <DatePicker label="Pickup Date" value={form.pickupDate} onChange={(d) => update('pickupDate', d)} minimumDate={new Date()} />
          <TimePicker
            label="Pickup Time"
            value={form.pickupTime}
            isToday={pickupIsToday}
            minHHMM={pickupIsToday ? nowRoundedUpTo5HHMM() : null}
            onChange={(t) => update('pickupTime', t)}
          />
        </View>

        {/* ── Notes ── */}
        <SectionTitle icon="chatbubble-ellipses-outline" text="Additional Notes" />
        <View style={styles.card}>
          <TextInput
            style={styles.notesInput}
            placeholder="Any special instructions…"
            value={form.specialInstructions}
            onChangeText={(v) => update('specialInstructions', v)}
            multiline
          />
          <View style={styles.noteChips}>
            {NOTE_CHIPS.map((c) => (
              <TouchableOpacity key={c} style={styles.noteChip} onPress={() => update('specialInstructions', form.specialInstructions ? `${form.specialInstructions} ${c}` : c)}>
                <Ionicons name="add" size={13} color="#1B7BF7" />
                <Text style={styles.noteChipText} numberOfLines={1}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Payment ── */}
        <SectionTitle icon="wallet-outline" text="Payment Method" />
        <View style={styles.payWrap}>
          {PAYMENT_METHODS.map((m) => {
            const active = form.paymentMethod === m.key;
            return (
              <TouchableOpacity key={m.key} style={[styles.payCard, active && styles.payCardActive]} onPress={() => update('paymentMethod', m.key)} activeOpacity={0.85}>
                <View style={[styles.payIcon, active && { backgroundColor: '#dbeafe' }]}>
                  <Ionicons name={m.icon} size={22} color={active ? '#1B7BF7' : '#6b7280'} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.payTitleRow}>
                    <Text style={[styles.payTitle, active && { color: '#1B7BF7' }]}>{m.label}</Text>
                    {m.primary && <View style={styles.primaryTag}><Text style={styles.primaryTagText}>Recommended</Text></View>}
                  </View>
                  <Text style={styles.paySub}>{m.sub}</Text>
                </View>
                <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={20} color={active ? '#1B7BF7' : '#cbd5e1'} />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Promo code ── */}
        <SectionTitle icon="pricetag-outline" text="Promo Code" />
        <View style={styles.card}>
          <View style={styles.promoRow}>
            <TextInput
              style={styles.promoInput}
              placeholder="Enter code (e.g. WELCOME10)"
              autoCapitalize="characters"
              value={promoInput}
              onChangeText={(v) => setPromoInput(v.toUpperCase())}
              editable={!promoQuote?.ok}
            />
            {promoQuote?.ok ? (
              <TouchableOpacity style={styles.promoClear} onPress={() => { setPromoQuote(null); setPromoInput(''); }}>
                <Ionicons name="close-circle" size={20} color="#6b7280" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.promoApply} onPress={applyPromo} disabled={promoBusy || !promoInput.trim()}>
                {promoBusy ? <ActivityIndicator size="small" color="#1B7BF7" /> : <Text style={styles.promoApplyText}>Apply</Text>}
              </TouchableOpacity>
            )}
          </View>
          {promoQuote?.ok && (
            <View style={styles.promoOk}>
              <Ionicons name="checkmark-circle" size={16} color="#059669" />
              <Text style={styles.promoOkText}>Code applied — you save {formatCurrency(promoQuote.discount)}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Sticky footer: total + review ── */}
      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>Estimated Total · subject to verification</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            {promoQuote?.ok && <Text style={styles.footerStrike}>{formatCurrency(estimate)}</Text>}
            <Text style={styles.footerTotal}>{formatCurrency(discountedTotal)}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.reviewBtn} onPress={openReview} activeOpacity={0.9}>
          <Text style={styles.reviewBtnText}>Review Order</Text>
          <Ionicons name="arrow-forward" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Order Review sheet ── */}
      <Modal visible={reviewOpen} transparent animationType="slide" onRequestClose={() => setReviewOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Review Your Order</Text>
            <ScrollView style={{ maxHeight: 380 }}>
              <ReviewRow icon="storefront-outline" label="Laundromat" value={laundromat.businessName} />
              <ReviewRow icon="pricetag-outline" label="Service" value={`${form.laundryType} · ${form.weightKg || 0} kg`} />
              <ReviewRow icon="location-outline" label="Pickup Address" value={form.pickupAddress} />
              <ReviewRow icon="calendar-outline" label="Pickup Date" value={formatDate(form.pickupDate)} />
              <ReviewRow icon="time-outline" label="Pickup Time" value={formatTime(form.pickupTime)} />
              <ReviewRow icon="wallet-outline" label="Payment" value={PAYMENT_METHODS.find((m) => m.key === form.paymentMethod)?.label} />
              {promoQuote?.ok && <ReviewRow icon="pricetag-outline" label="Promo" value={`${promoQuote.code || promoInput.trim()} (−${formatCurrency(promoQuote.discount)})`} />}
              {!!form.specialInstructions && <ReviewRow icon="chatbubble-outline" label="Notes" value={form.specialInstructions} />}
              <View style={styles.totalRow}>
                <View>
                  <Text style={styles.totalLabel}>Estimated Cost</Text>
                  <Text style={styles.totalSubtle}>Final amount confirmed after the laundromat weighs your laundry</Text>
                </View>
                <Text style={styles.totalValue}>{formatCurrency(discountedTotal)}</Text>
              </View>
            </ScrollView>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.editBtn} onPress={() => setReviewOpen(false)} disabled={submitting}>
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirmOrder} disabled={submitting}>
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.confirmBtnText}>Confirm Order</Text></>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// Selectable service tile in the 2-column grid. Press gives a spring scale for
// tactile feedback; selection is purely visual — the parent still owns
// form.laundryType and the same update() call as before.
function ServiceCard({ service, active, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 8 }).start();

  return (
    <Animated.View style={{ width: CARD_W, transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.serviceCard, active && styles.serviceCardActive]}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        activeOpacity={0.9}
      >
        <View style={[styles.serviceIcon, active && styles.serviceIconActive]}>
          <Ionicons name={serviceIcon(service.serviceType)} size={22} color={active ? '#fff' : '#6b7280'} />
        </View>
        <Text style={[styles.serviceName, active && styles.serviceNameActive]} numberOfLines={2}>
          {service.serviceType}
        </Text>
        <Text style={styles.servicePrice}>{formatCurrency(service.pricePerKg)}/kg</Text>
        {active && (
          <View style={styles.serviceCheck}>
            <Ionicons name="checkmark-circle" size={20} color="#1B7BF7" />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

function SectionTitle({ icon, text }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Ionicons name={icon} size={18} color="#1B7BF7" />
      <Text style={styles.sectionTitle}>{text}</Text>
    </View>
  );
}
function ReviewRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.reviewRow}>
      <Ionicons name={icon} size={16} color="#6b7280" />
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  // Summary
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 16, padding: 14, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryName: { flex: 1, fontSize: 17, fontWeight: '800', color: '#1f2937' },
  summaryMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  summaryMetaText: { fontSize: 13, color: '#4b5563', fontWeight: '600' },
  dot: { color: '#d1d5db', marginHorizontal: 2 },
  summaryAddr: { fontSize: 12, color: '#9ca3af', marginTop: 3 },
  summaryActions: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 8 },
  summaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#fff', borderRadius: 11, paddingVertical: 10, borderWidth: 1, borderColor: '#eef2f7' },
  summaryBtnText: { fontSize: 13, fontWeight: '700' },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 16, marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1f2937' },
  card: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 14, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } },

  // Services
  // 2-column grid. Width comes from CARD_W (computed from the screen) and the
  // only spacing is `gap` — no margins competing with it, so two cards always
  // fit on a row instead of wrapping into a single column.
  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GRID_PAD, gap: GRID_GAP },
  serviceCard: {
    width: '100%', backgroundColor: '#fff', borderRadius: 18, padding: 14,
    borderWidth: 1.5, borderColor: '#eef2f7',
    shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  serviceCardActive: {
    borderColor: '#1B7BF7', backgroundColor: '#f5f9ff',
    shadowColor: '#1B7BF7', shadowOpacity: 0.18, shadowRadius: 10, elevation: 3,
  },
  serviceIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  serviceIconActive: { backgroundColor: '#1B7BF7' },
  // minHeight reserves two lines so every card is the same height regardless of
  // whether the service name wraps.
  serviceName: { fontSize: 14, fontWeight: '700', color: '#1f2937', lineHeight: 18, minHeight: 36 },
  serviceNameActive: { color: '#1B7BF7' },
  servicePrice: { fontSize: 13, fontWeight: '700', color: '#059669', marginTop: 2 },
  serviceCheck: { position: 'absolute', top: 10, right: 10 },

  weightRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 14, padding: 14, elevation: 1 },
  weightLabel: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  weightHint: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  weightInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  weightInput: { fontSize: 18, fontWeight: '800', color: '#1f2937', minWidth: 44, textAlign: 'center', padding: 0 },
  weightUnit: { fontSize: 14, color: '#6b7280', fontWeight: '700' },

  // Address
  locBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#eff6ff', borderRadius: 11, paddingVertical: 11, marginBottom: 10 },
  locBtnText: { color: '#1B7BF7', fontWeight: '700', fontSize: 14 },
  addressInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 11, padding: 12, fontSize: 15, minHeight: 60, textAlignVertical: 'top', color: '#1f2937' },
  miniMapWrap: { borderRadius: 12, overflow: 'hidden', marginTop: 10, height: 130 },
  miniMap: { width: '100%', height: '100%' },

  notesInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 11, padding: 12, fontSize: 15, minHeight: 60, textAlignVertical: 'top', color: '#1f2937' },
  noteChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  noteChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#eff6ff', borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10, maxWidth: '100%' },
  noteChipText: { fontSize: 12, color: '#1B7BF7', fontWeight: '600' },

  // Payment
  payWrap: { marginHorizontal: 16, gap: 10 },
  payCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#eef2f7' },
  payCardActive: { borderColor: '#1B7BF7', backgroundColor: '#f5f9ff' },
  payIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  payTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  primaryTag: { backgroundColor: '#ecfdf5', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7 },
  primaryTagText: { fontSize: 10, fontWeight: '800', color: '#059669' },
  paySub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  // Footer
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, borderTopWidth: 1, borderTopColor: '#f1f5f9', elevation: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } },
  footerLabel: { fontSize: 12, color: '#6b7280' },
  footerTotal: { fontSize: 22, fontWeight: '800', color: '#1f2937' },
  footerStrike: { fontSize: 14, color: '#9ca3af', textDecorationLine: 'line-through' },
  promoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promoInput: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 11, paddingVertical: 11, paddingHorizontal: 12, fontSize: 15, letterSpacing: 1, color: '#1f2937' },
  promoApply: { backgroundColor: '#eff6ff', borderRadius: 11, paddingVertical: 12, paddingHorizontal: 18 },
  promoApplyText: { color: '#1B7BF7', fontWeight: '800', fontSize: 14 },
  promoClear: { padding: 8 },
  promoOk: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  promoOkText: { color: '#059669', fontWeight: '700', fontSize: 13 },
  reviewBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1B7BF7', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 22 },
  reviewBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Review sheet
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 30 },
  sheetHandle: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: '#1f2937', marginBottom: 14 },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  reviewLabel: { fontSize: 13, color: '#6b7280', width: 96 },
  reviewValue: { flex: 1, fontSize: 14, color: '#1f2937', fontWeight: '600', textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  totalSubtle: { fontSize: 11, color: '#9ca3af', marginTop: 2, maxWidth: 200 },
  totalValue: { fontSize: 22, fontWeight: '800', color: '#059669' },
  sheetActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  editBtn: { paddingVertical: 15, paddingHorizontal: 26, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  editBtnText: { color: '#6b7280', fontWeight: '700', fontSize: 15 },
  confirmBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10b981', borderRadius: 12, paddingVertical: 15 },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
