import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Modal, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { paymentsAPI, PAYMENT_CALLBACK_URL } from '../../api/client';
import { formatCurrency } from '../../utils/helpers';

const MOMO_NETWORKS = [
  { key: 'mtn', label: 'MTN Mobile Money', color: '#ffcc00', fg: '#1a1a1a' },
  { key: 'vodafone', label: 'Vodafone Cash', color: '#e60000', fg: '#fff' },
  { key: 'airteltigo', label: 'AirtelTigo Money', color: '#0033a0', fg: '#fff' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function PaymentScreen({ route, navigation }) {
  const { orderId, amount, requestNumber } = route.params || {};
  const [method, setMethod] = useState('momo');       // 'momo' | 'card'
  const [channel, setChannel] = useState('mtn');
  const [phase, setPhase] = useState('select');        // select | webview | sandbox | verifying | success | failed
  const [authUrl, setAuthUrl] = useState(null);
  const [reference, setReference] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const idemRef = useRef(`idem-${orderId}-${Date.now()}`);
  const verifiedRef = useRef(false);

  // ── Start payment ──
  const startPayment = useCallback(async () => {
    setBusy(true);
    try {
      const res = await paymentsAPI.initialize(
        orderId,
        method,
        method === 'momo' ? channel : undefined,
        idemRef.current,
      );
      setReference(res.data.reference);
      const url = res.data.authorizationUrl || '';
      if (res.data.stub || url.startsWith('stub://')) {
        // Backend in sandbox mode — no real gateway page to open.
        setPhase('sandbox');
      } else {
        setAuthUrl(url);
        setPhase('webview');
      }
    } catch (e) {
      Alert.alert('Payment', e.response?.data?.error || e.message || 'Could not start payment.');
    } finally {
      setBusy(false);
    }
  }, [orderId, method, channel]);

  // ── Verify (poll — webhook may settle a moment after redirect) ──
  const verifyPayment = useCallback(async () => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;
    setPhase('verifying');
    for (let i = 0; i < 6; i++) {
      try {
        const res = await paymentsAPI.verify(reference);
        if (res.data.status === 'paid') {
          setReceipt(res.data.receipt);
          setPhase('success');
          return;
        }
        if (res.data.status === 'failed') {
          setPhase('failed');
          return;
        }
      } catch (e) { /* keep polling */ }
      await sleep(1500);
    }
    // Still pending — let the user retry verification.
    verifiedRef.current = false;
    setPhase('pending');
  }, [reference]);

  // ── WebView completion detection ──
  const onNavChange = useCallback((navState) => {
    const url = navState.url || '';
    if (
      url.startsWith(PAYMENT_CALLBACK_URL) ||
      url.includes('laundromat-payment.app/complete') ||
      url.includes('standard.paystack.co/close') ||
      url.includes('checkout.paystack.com/close')
    ) {
      setPhase('verifying');
      verifyPayment();
    }
  }, [verifyPayment]);

  const goToOrder = () => navigation.navigate('RequestDetails', { id: orderId, paid: Date.now() });

  // ────────────────────────── RENDER ──────────────────────────

  if (phase === 'success') {
    return (
      <View style={styles.resultContainer}>
        <View style={[styles.resultIcon, { backgroundColor: '#10b981' }]}>
          <Ionicons name="checkmark" size={44} color="#fff" />
        </View>
        <Text style={styles.resultTitle}>Payment Successful</Text>
        <Text style={styles.resultSub}>Your order #{requestNumber} is now paid.</Text>

        {receipt && (
          <View style={styles.receiptCard}>
            <Text style={styles.receiptHeader}>Receipt</Text>
            <ReceiptRow label="Receipt No." value={receipt.receiptNumber} />
            <ReceiptRow label="Amount" value={formatCurrency(receipt.amount)} highlight />
            <ReceiptRow label="Method" value={receipt.method === 'card' ? 'Card' : `MoMo (${receipt.channel})`} />
            <ReceiptRow label="Reference" value={receipt.reference} small />
          </View>
        )}

        <TouchableOpacity style={styles.primaryBtn} onPress={goToOrder}>
          <Text style={styles.primaryBtnText}>View Order</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.navigate('MyRequests')}>
          <Text style={styles.linkBtnText}>Back to My Orders</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'failed') {
    return (
      <View style={styles.resultContainer}>
        <View style={[styles.resultIcon, { backgroundColor: '#ef4444' }]}>
          <Ionicons name="close" size={44} color="#fff" />
        </View>
        <Text style={styles.resultTitle}>Payment Failed</Text>
        <Text style={styles.resultSub}>Your payment could not be completed. No charge was made.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => { verifiedRef.current = false; setPhase('select'); }}>
          <Text style={styles.primaryBtnText}>Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.linkBtnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === 'verifying') {
    return (
      <View style={styles.resultContainer}>
        <ActivityIndicator size="large" color="#1B7BF7" />
        <Text style={styles.resultTitle}>Confirming payment…</Text>
        <Text style={styles.resultSub}>This only takes a moment.</Text>
      </View>
    );
  }

  if (phase === 'pending') {
    return (
      <View style={styles.resultContainer}>
        <View style={[styles.resultIcon, { backgroundColor: '#f59e0b' }]}>
          <Ionicons name="hourglass-outline" size={40} color="#fff" />
        </View>
        <Text style={styles.resultTitle}>Payment Pending</Text>
        <Text style={styles.resultSub}>
          We haven't received confirmation yet. If you completed the payment, tap below to check again.
        </Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => { verifiedRef.current = false; verifyPayment(); }}>
          <Text style={styles.primaryBtnText}>Check Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.linkBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 32 }}>
      {/* Amount */}
      <View style={styles.amountCard}>
        <Text style={styles.amountLabel}>Amount to pay</Text>
        <Text style={styles.amountValue}>{formatCurrency(amount)}</Text>
        <Text style={styles.amountOrder}>Order #{requestNumber}</Text>
      </View>

      {/* Method tabs */}
      <Text style={styles.sectionTitle}>Payment Method</Text>
      <View style={styles.methodTabs}>
        <TouchableOpacity
          style={[styles.methodTab, method === 'momo' && styles.methodTabActive]}
          onPress={() => setMethod('momo')}
        >
          <Ionicons name="phone-portrait-outline" size={20} color={method === 'momo' ? '#1B7BF7' : '#6b7280'} />
          <Text style={[styles.methodTabText, method === 'momo' && styles.methodTabTextActive]}>Mobile Money</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.methodTab, method === 'card' && styles.methodTabActive]}
          onPress={() => setMethod('card')}
        >
          <Ionicons name="card-outline" size={20} color={method === 'card' ? '#1B7BF7' : '#6b7280'} />
          <Text style={[styles.methodTabText, method === 'card' && styles.methodTabTextActive]}>Card</Text>
        </TouchableOpacity>
      </View>

      {/* MoMo network picker */}
      {method === 'momo' && (
        <View style={styles.networkList}>
          {MOMO_NETWORKS.map((n) => {
            const active = channel === n.key;
            return (
              <TouchableOpacity
                key={n.key}
                style={[styles.networkRow, active && styles.networkRowActive]}
                onPress={() => setChannel(n.key)}
              >
                <View style={[styles.networkLogo, { backgroundColor: n.color }]}>
                  <Text style={[styles.networkLogoText, { color: n.fg }]}>{n.label.charAt(0)}</Text>
                </View>
                <Text style={styles.networkLabel}>{n.label}</Text>
                <Ionicons
                  name={active ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={active ? '#1B7BF7' : '#cbd5e1'}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {method === 'card' && (
        <View style={styles.cardNote}>
          <Ionicons name="lock-closed" size={16} color="#10b981" />
          <Text style={styles.cardNoteText}>You'll enter your card details securely on the next screen.</Text>
        </View>
      )}

      {/* Pay button */}
      <TouchableOpacity style={[styles.payBtn, busy && { opacity: 0.7 }]} onPress={startPayment} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : (
          <>
            <Ionicons name="lock-closed" size={18} color="#fff" />
            <Text style={styles.payBtnText}>Pay {formatCurrency(amount)}</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.secureRow}>
        <Ionicons name="shield-checkmark-outline" size={14} color="#10b981" />
        <Text style={styles.secureText}>Secured by Paystack</Text>
      </View>

      {/* Sandbox simulation (backend in stub mode) */}
      {phase === 'sandbox' && (
        <View style={styles.sandboxCard}>
          <Text style={styles.sandboxTitle}>Sandbox mode</Text>
          <Text style={styles.sandboxDesc}>
            No live payment keys are configured, so the gateway is simulated. Tap below to complete a test payment.
          </Text>
          <TouchableOpacity style={styles.sandboxBtn} onPress={verifyPayment}>
            <Text style={styles.sandboxBtnText}>Simulate Successful Payment</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Live gateway WebView */}
      <Modal visible={phase === 'webview' && !!authUrl} animationType="slide" onRequestClose={() => setPhase('select')}>
        <View style={styles.webHeader}>
          <TouchableOpacity onPress={() => setPhase('select')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.webTitle}>Complete Payment</Text>
          <TouchableOpacity onPress={verifyPayment}>
            <Text style={styles.webDone}>Done</Text>
          </TouchableOpacity>
        </View>
        {authUrl ? (
          <WebView
            source={{ uri: authUrl }}
            onNavigationStateChange={onNavChange}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.webLoading}><ActivityIndicator size="large" color="#1B7BF7" /></View>
            )}
          />
        ) : null}
      </Modal>
    </ScrollView>
  );
}

function ReceiptRow({ label, value, highlight, small }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text
        style={[styles.receiptValue, highlight && styles.receiptValueHi, small && styles.receiptValueSm]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  amountCard: { backgroundColor: '#1B7BF7', margin: 16, borderRadius: 16, padding: 22, alignItems: 'center' },
  amountLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  amountValue: { color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 4 },
  amountOrder: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginHorizontal: 16, marginTop: 8, marginBottom: 8 },
  methodTabs: { flexDirection: 'row', marginHorizontal: 16, gap: 10 },
  methodTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb' },
  methodTabActive: { borderColor: '#1B7BF7', backgroundColor: '#eff6ff' },
  methodTabText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  methodTabTextActive: { color: '#1B7BF7' },

  networkList: { marginHorizontal: 16, marginTop: 12, gap: 10 },
  networkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: '#e5e7eb' },
  networkRowActive: { borderColor: '#1B7BF7' },
  networkLogo: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  networkLogoText: { fontSize: 18, fontWeight: '800' },
  networkLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1f2937' },

  cardNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, backgroundColor: '#ecfdf5', borderRadius: 10, padding: 12 },
  cardNoteText: { flex: 1, fontSize: 13, color: '#065f46' },

  payBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10b981', marginHorizontal: 16, marginTop: 22, borderRadius: 14, paddingVertical: 16, elevation: 3, shadowColor: '#10b981', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  payBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12 },
  secureText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },

  sandboxCard: { backgroundColor: '#fffbeb', borderColor: '#fde68a', borderWidth: 1, borderRadius: 14, margin: 16, padding: 16 },
  sandboxTitle: { fontSize: 14, fontWeight: '800', color: '#92400e' },
  sandboxDesc: { fontSize: 13, color: '#92400e', marginTop: 6, lineHeight: 19 },
  sandboxBtn: { backgroundColor: '#f59e0b', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  sandboxBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // WebView modal
  webHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, paddingTop: Platform.OS === 'ios' ? 54 : 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff' },
  webTitle: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  webDone: { fontSize: 15, fontWeight: '700', color: '#1B7BF7' },
  webLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },

  // Result screens
  resultContainer: { flex: 1, backgroundColor: '#f8f9fa', alignItems: 'center', justifyContent: 'center', padding: 28 },
  resultIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  resultTitle: { fontSize: 22, fontWeight: '800', color: '#1f2937', textAlign: 'center' },
  resultSub: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 8, lineHeight: 20 },

  receiptCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginTop: 22, width: '100%', borderWidth: 1, borderColor: '#e5e7eb' },
  receiptHeader: { fontSize: 13, fontWeight: '800', color: '#6b7280', letterSpacing: 0.5, marginBottom: 10 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7 },
  receiptLabel: { fontSize: 13, color: '#6b7280' },
  receiptValue: { fontSize: 14, color: '#1f2937', fontWeight: '700', flexShrink: 1, marginLeft: 12, textAlign: 'right' },
  receiptValueHi: { color: '#10b981', fontSize: 16 },
  receiptValueSm: { fontSize: 11, fontWeight: '500', color: '#9ca3af' },

  primaryBtn: { backgroundColor: '#1B7BF7', borderRadius: 12, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', marginTop: 24, alignSelf: 'stretch' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  linkBtn: { paddingVertical: 12, marginTop: 4 },
  linkBtnText: { color: '#6b7280', fontSize: 14, fontWeight: '600' },
});
