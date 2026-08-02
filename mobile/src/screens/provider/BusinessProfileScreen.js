import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Image, Switch, RefreshControl, Platform, KeyboardAvoidingView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { providerAPI } from '../../api/client';
import { SkeletonCard } from '../../components/Skeleton';

const BRAND = '#1B7BF7';

/**
 * The provider's own storefront — everything a customer sees about the business.
 * Scoped entirely to the signed-in provider; there is no way to reach another
 * laundromat's profile from here.
 */
export default function BusinessProfileScreen() {
  const [profile, setProfile] = useState(null);
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null); // 'logo' | 'cover'
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await providerAPI.getBusinessProfile();
      setProfile(r.data.profile);
      setF({
        businessName: r.data.profile.businessName || '',
        businessDescription: r.data.profile.businessDescription || '',
        businessHours: r.data.profile.businessHours || '',
        address: r.data.profile.address || '',
        phone: r.data.profile.phone || '',
        deliveryRadius: r.data.profile.deliveryRadius != null ? String(r.data.profile.deliveryRadius) : '',
        acceptingOrders: r.data.profile.acceptingOrders,
      });
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to load your business profile.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.businessName.trim()) { Alert.alert('Name required', 'Your business needs a name.'); return; }
    setSaving(true);
    try {
      const r = await providerAPI.updateBusinessProfile({
        businessName: f.businessName.trim(),
        businessDescription: f.businessDescription.trim() || null,
        businessHours: f.businessHours.trim(),
        address: f.address.trim(),
        phone: f.phone.trim(),
        deliveryRadius: f.deliveryRadius || undefined,
        acceptingOrders: f.acceptingOrders,
      });
      setProfile(r.data.profile);
      Alert.alert('Saved', 'Your business profile has been updated.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to save.');
    } finally { setSaving(false); }
  }

  // Logo/cover upload mirrors the service gallery: signed request, phone →
  // Cloudinary directly, then the publicId is recorded against the profile.
  async function pickImage(kind) {
    let perm = { granted: true, canAskAgain: true };
    try { perm = await ImagePicker.requestMediaLibraryPermissionsAsync(); } catch { /* API differences */ }
    if (!perm.granted && perm.canAskAgain === false) {
      Alert.alert('Photo access blocked', 'Enable photo access for LaundroMart in your device settings.');
      return;
    }
    let picked;
    try {
      picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
        aspect: kind === 'logo' ? [1, 1] : [16, 9],
      });
    } catch (e) {
      Alert.alert('Could not open photos', e.message || 'Please try again.');
      return;
    }
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];

    setUploading(kind);
    try {
      const { data: sig } = await providerAPI.getProfileImageSignature();
      const form = new FormData();
      form.append('file', { uri: asset.uri, type: asset.mimeType || 'image/jpeg', name: asset.fileName || `${kind}.jpg` });
      form.append('api_key', String(sig.apiKey));
      form.append('timestamp', String(sig.timestamp));
      form.append('folder', sig.folder);
      form.append('signature', sig.signature);

      const resp = await fetch(sig.uploadUrl, { method: 'POST', body: form });
      const out = await resp.json();
      if (!out.public_id) throw new Error(out.error?.message || 'Upload failed.');

      const r = await providerAPI.updateBusinessProfile(
        kind === 'logo' ? { logoPublicId: out.public_id } : { coverPublicId: out.public_id },
      );
      setProfile(r.data.profile);
    } catch (e) {
      Alert.alert('Upload failed', e.response?.data?.error || e.message || 'Could not upload that image.');
    } finally { setUploading(null); }
  }

  async function toggleAccepting(v) {
    set('acceptingOrders')(v);
    try {
      const r = await providerAPI.updateBusinessProfile({ acceptingOrders: v });
      setProfile(r.data.profile);
    } catch (e) {
      set('acceptingOrders')(!v); // revert on failure
      Alert.alert('Error', e.response?.data?.error || 'Could not change your status.');
    }
  }

  if (!profile || !f) {
    return <View style={styles.container}><View style={{ paddingTop: 12 }}><SkeletonCard /><SkeletonCard /></View></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 36 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {/* Cover + logo — what customers see first */}
        <TouchableOpacity style={styles.cover} onPress={() => pickImage('cover')} activeOpacity={0.9}>
          {profile.coverPhotoUrl
            ? <Image source={{ uri: profile.coverPhotoUrl }} style={styles.coverImg} resizeMode="cover" />
            : <View style={styles.coverEmpty}><Ionicons name="image-outline" size={26} color="#9ca3af" /><Text style={styles.coverEmptyText}>Add a cover photo</Text></View>}
          {uploading === 'cover' && <View style={styles.uploadOverlay}><ActivityIndicator color="#fff" /></View>}
          <View style={styles.coverEditBadge}><Ionicons name="camera" size={13} color="#fff" /></View>
        </TouchableOpacity>

        <View style={styles.logoRow}>
          <TouchableOpacity style={styles.logo} onPress={() => pickImage('logo')} activeOpacity={0.9}>
            {profile.logoUrl
              ? <Image source={{ uri: profile.logoUrl }} style={styles.logoImg} />
              : <Ionicons name="storefront-outline" size={26} color={BRAND} />}
            {uploading === 'logo' && <View style={styles.uploadOverlay}><ActivityIndicator color="#fff" /></View>}
            <View style={styles.logoEditBadge}><Ionicons name="camera" size={11} color="#fff" /></View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{profile.businessName}</Text>
              {profile.isVerified && <Ionicons name="checkmark-circle" size={16} color={BRAND} />}
            </View>
            <Text style={styles.rating}>
              {profile.avgRating > 0 ? `★ ${profile.avgRating.toFixed(1)} (${profile.reviewCount})` : 'No ratings yet'}
            </Text>
          </View>
        </View>

        {/* Open / closed for business */}
        <View style={styles.statusCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.statusTitle}>{f.acceptingOrders ? 'Accepting orders' : 'Paused'}</Text>
            <Text style={styles.statusSub}>
              {f.acceptingOrders ? 'Customers can book you right now.' : 'You will not receive new orders while paused.'}
            </Text>
          </View>
          <Switch value={f.acceptingOrders} onValueChange={toggleAccepting} trackColor={{ true: '#bfdbfe' }} thumbColor={f.acceptingOrders ? BRAND : '#f3f4f6'} />
        </View>

        <Field label="Business name">
          <TextInput style={styles.input} value={f.businessName} onChangeText={set('businessName')} placeholder="e.g. Cape Clean Laundry" placeholderTextColor="#9ca3af" />
        </Field>

        <Field label="About your business">
          <TextInput
            style={[styles.input, styles.textarea]}
            value={f.businessDescription}
            onChangeText={set('businessDescription')}
            placeholder="Tell customers what makes your laundry service stand out."
            placeholderTextColor="#9ca3af"
            multiline
          />
        </Field>

        <Field label="Business address" hint="Changing this re-locates you on the customer map.">
          <TextInput style={styles.input} value={f.address} onChangeText={set('address')} placeholder="e.g. 12 Ring Rd, Cape Coast" placeholderTextColor="#9ca3af" />
        </Field>

        <Field label="Opening hours" hint="Used to show customers whether you are open.">
          <TextInput style={styles.input} value={f.businessHours} onChangeText={set('businessHours')} placeholder="7:00 AM – 9:00 PM" placeholderTextColor="#9ca3af" />
        </Field>

        <Field label="Phone number">
          <TextInput style={styles.input} value={f.phone} onChangeText={set('phone')} placeholder="0550000000" placeholderTextColor="#9ca3af" keyboardType="phone-pad" />
        </Field>

        <Field label="Delivery radius (km)" hint="Customers inside this range see you as delivering to them.">
          <TextInput style={styles.input} value={f.deliveryRadius} onChangeText={set('deliveryRadius')} placeholder="10" placeholderTextColor="#9ca3af" keyboardType="number-pad" />
        </Field>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} activeOpacity={0.9}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, hint, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  cover: { height: 140, backgroundColor: '#e5e7eb' },
  coverImg: { width: '100%', height: '100%' },
  coverEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  coverEmptyText: { fontSize: 12.5, color: '#6b7280' },
  coverEditBadge: { position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: 7 },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },

  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginTop: -28, marginBottom: 14 },
  logo: { width: 72, height: 72, borderRadius: 20, backgroundColor: '#fff', borderWidth: 3, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  logoImg: { width: '100%', height: '100%' },
  logoEditBadge: { position: 'absolute', right: 2, bottom: 2, backgroundColor: BRAND, borderRadius: 10, padding: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 26 },
  name: { fontSize: 17, fontWeight: '800', color: '#111827', flexShrink: 1 },
  rating: { fontSize: 12.5, color: '#6b7280', marginTop: 2 },

  statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: '#eef2f7', marginBottom: 8 },
  statusTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  statusSub: { fontSize: 12.5, color: '#6b7280', marginTop: 2 },

  field: { marginHorizontal: 16, marginTop: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 7 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 13, paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 15, color: '#111827' },
  textarea: { minHeight: 92, textAlignVertical: 'top' },
  hint: { fontSize: 11.5, color: '#6b7280', marginTop: 5 },

  saveBtn: { backgroundColor: BRAND, marginHorizontal: 16, marginTop: 22, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
