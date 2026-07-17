import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Switch, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { notificationsAPI } from '../../api/client';
import { Skeleton } from '../../components/Skeleton';

const ITEMS = [
  { key: 'orderUpdates', label: 'Order Updates', desc: 'Pickup, washing, ready, delivered', icon: 'cube-outline' },
  { key: 'providerUpdates', label: 'Provider Updates', desc: 'Laundromat status & reviews', icon: 'storefront-outline' },
  { key: 'messages', label: 'Messages', desc: 'Messages from customers & riders', icon: 'chatbubble-ellipses-outline' },
  { key: 'promotions', label: 'Promotions', desc: 'Offers and discounts', icon: 'pricetag-outline' },
  { key: 'system', label: 'System Notifications', desc: 'Account & security alerts', icon: 'settings-outline' },
];

export default function NotificationSettingsScreen() {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await notificationsAPI.getPreferences();
      setPrefs(res.data.preferences);
    } catch (e) {
      setPrefs({ orderUpdates: true, providerUpdates: true, messages: true, promotions: true, system: true });
    } finally {
      setLoading(false);
    }
  }

  async function toggle(key, value) {
    const prev = prefs;
    setPrefs({ ...prefs, [key]: value }); // optimistic
    setSaving(true);
    try {
      const res = await notificationsAPI.updatePreferences({ [key]: value });
      setPrefs(res.data.preferences);
    } catch (e) {
      setPrefs(prev);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <View style={styles.container}>
      <View style={{ padding: 16 }}>
        {ITEMS.map((_, i) => <Skeleton key={i} width="100%" height={56} radius={12} style={{ marginBottom: 8 }} />)}
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.intro}>
        <Ionicons name="notifications-outline" size={22} color="#1B7BF7" />
        <Text style={styles.introText}>Choose which push notifications you'd like to receive. In-app notifications are always shown.</Text>
      </View>

      <View style={styles.card}>
        {ITEMS.map((item, i) => (
          <View key={item.key} style={[styles.row, i < ITEMS.length - 1 && styles.rowDivider]}>
            <View style={styles.iconWrap}><Ionicons name={item.icon} size={20} color="#1B7BF7" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.desc}>{item.desc}</Text>
            </View>
            <Switch
              value={!!prefs?.[item.key]}
              onValueChange={(v) => toggle(item.key, v)}
              disabled={saving}
              trackColor={{ true: '#1B7BF7', false: '#cbd5e1' }}
              thumbColor="#fff"
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  intro: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 16 },
  introText: { flex: 1, fontSize: 13, color: '#6b7280', lineHeight: 19 },
  card: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 16, elevation: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  iconWrap: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  desc: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
});
