import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Modal, Alert, ActivityIndicator, RefreshControl, Animated, KeyboardAvoidingView, Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { providerAPI } from '../../api/client';
import { formatCurrency } from '../../utils/helpers';
import EmptyState from '../../components/EmptyState';
import { SkeletonCard } from '../../components/Skeleton';

const BRAND = '#1B7BF7';
const MAX_IMAGES = 10;

const PRICING_TYPES = [
  { key: 'per_kg', label: 'Per kg', hint: 'Charged by weight', unit: '/kg' },
  { key: 'fixed', label: 'Fixed', hint: 'One flat price', unit: '' },
  { key: 'per_item', label: 'Per item', hint: 'Charged per piece', unit: ' each' },
];

const STATUSES = [
  { key: 'available', label: 'Available', color: '#059669', bg: '#d1fae5' },
  { key: 'unavailable', label: 'Unavailable', color: '#6b7280', bg: '#f3f4f6' },
  { key: 'temporarily_closed', label: 'Temporarily closed', color: '#b45309', bg: '#fef3c7' },
  { key: 'out_of_service', label: 'Out of service', color: '#b91c1c', bg: '#fee2e2' },
];

const FALLBACK_CATEGORIES = [
  'Wash & Fold', 'Dry Cleaning', 'Ironing', 'Express Wash', 'Blanket Cleaning',
  'Curtain Cleaning', 'Carpet Cleaning', 'Shoe Cleaning', 'Bag Cleaning',
  'Wedding Dress Cleaning', 'Corporate Laundry', 'Custom Service',
];

const statusMeta = (key) => STATUSES.find((s) => s.key === key) || STATUSES[1];
const typeMeta = (key) => PRICING_TYPES.find((t) => t.key === key) || PRICING_TYPES[0];

function categoryIcon(cat) {
  const n = (cat || '').toLowerCase();
  if (n.includes('dry')) return 'sparkles-outline';
  if (n.includes('iron')) return 'shirt-outline';
  if (n.includes('express')) return 'flash-outline';
  if (n.includes('blanket')) return 'bed-outline';
  if (n.includes('curtain')) return 'browsers-outline';
  if (n.includes('carpet')) return 'grid-outline';
  if (n.includes('shoe')) return 'footsteps-outline';
  if (n.includes('bag')) return 'bag-handle-outline';
  if (n.includes('wedding')) return 'heart-outline';
  if (n.includes('corporate')) return 'business-outline';
  if (n.includes('fold')) return 'layers-outline';
  return 'water-outline';
}

export default function ServicesScreen({ navigation }) {
  const [services, setServices] = useState(null);
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(null); // service object, or {} for new
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await providerAPI.getServices();
      setServices(res.data.services || []);
    } catch (e) {
      setServices([]);
      Alert.alert('Error', e.response?.data?.error || 'Failed to load your services.');
    }
  }, []);

  useEffect(() => {
    load();
    providerAPI.getServiceCategories()
      .then((r) => { if (r.data?.categories?.length) setCategories(r.data.categories); })
      .catch(() => { /* keep the local fallback list */ });
  }, [load]);

  function confirmDelete(service) {
    Alert.alert(
      'Remove service?',
      `"${service.name}" will stop appearing to customers. Orders already placed are not affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyId(service.id);
            try {
              await providerAPI.deleteService(service.id);
              await load();
            } catch (e) {
              Alert.alert('Error', e.response?.data?.error || 'Failed to remove service.');
            } finally { setBusyId(null); }
          },
        },
      ],
    );
  }

  async function cycleStatus(service) {
    // Quick toggle between the two most-used states; the editor covers all four.
    const next = service.status === 'available' ? 'unavailable' : 'available';
    setBusyId(service.id);
    try {
      await providerAPI.updateService(service.id, { status: next });
      await load();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to update availability.');
    } finally { setBusyId(null); }
  }

  const availableCount = (services || []).filter((s) => s.status === 'available').length;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.headerTitle}>My Services</Text>
          <Text style={styles.headerSub}>
            {services == null ? 'Loading…' : `${services.length} total · ${availableCount} available`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('BusinessProfile')} activeOpacity={0.85}>
            <Ionicons name="storefront-outline" size={17} color={BRAND} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => setEditing({})} activeOpacity={0.9}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {services == null ? (
        <View style={{ paddingTop: 8 }}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />
          }
        >
          {services.length === 0 ? (
            <View style={{ marginTop: 40 }}>
              <EmptyState
                icon="pricetags-outline"
                title="No services yet"
                subtitle="Add the services your laundromat offers, set your own prices, and customers will see them when they book."
                tint={BRAND}
              />
              <TouchableOpacity style={styles.emptyCta} onPress={() => setEditing({})} activeOpacity={0.9}>
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.emptyCtaText}>Add your first service</Text>
              </TouchableOpacity>
            </View>
          ) : (
            services.map((s) => (
              <ServiceCard
                key={s.id}
                service={s}
                busy={busyId === s.id}
                onEdit={() => setEditing(s)}
                onDelete={() => confirmDelete(s)}
                onToggle={() => cycleStatus(s)}
              />
            ))
          )}
        </ScrollView>
      )}

      {editing && (
        <ServiceEditor
          initial={editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </View>
  );
}

function ServiceCard({ service, busy, onEdit, onDelete, onToggle }) {
  const st = statusMeta(service.status);
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.985, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.95}
        onPress={onEdit}
        onPressIn={pressIn}
        onPressOut={pressOut}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardIcon}>
            <Ionicons name={categoryIcon(service.category)} size={22} color={BRAND} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardName} numberOfLines={1}>{service.name}</Text>
            <Text style={styles.cardCat} numberOfLines={1}>{service.category}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
          </View>
        </View>

        {!!service.description && (
          <Text style={styles.cardDesc} numberOfLines={2}>{service.description}</Text>
        )}

        <View style={styles.cardMeta}>
          <View style={styles.priceWrap}>
            <Text style={styles.priceValue}>{formatCurrency(service.price || 0)}</Text>
            <Text style={styles.priceUnit}>{typeMeta(service.pricingType).unit || ' flat'}</Text>
          </View>
          {service.estimatedCompletionHours != null && (
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={13} color="#6b7280" />
              <Text style={styles.metaChipText}>{service.estimatedCompletionHours}h</Text>
            </View>
          )}
          <View style={styles.metaChip}>
            <Ionicons name="receipt-outline" size={13} color="#6b7280" />
            <Text style={styles.metaChipText}>{service.orderCount || 0} orders</Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity style={styles.actionBtn} onPress={onToggle} disabled={busy} activeOpacity={0.8}>
            {busy ? <ActivityIndicator size="small" color={BRAND} /> : (
              <>
                <Ionicons
                  name={service.status === 'available' ? 'pause-circle-outline' : 'play-circle-outline'}
                  size={17}
                  color={service.status === 'available' ? '#b45309' : '#059669'}
                />
                <Text style={[styles.actionText, { color: service.status === 'available' ? '#b45309' : '#059669' }]}>
                  {service.status === 'available' ? 'Pause' : 'Make available'}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onEdit} activeOpacity={0.8}>
            <Ionicons name="create-outline" size={17} color={BRAND} />
            <Text style={[styles.actionText, { color: BRAND }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onDelete} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={17} color="#dc2626" />
            <Text style={[styles.actionText, { color: '#dc2626' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ServiceEditor({ initial, categories, onClose, onSaved }) {
  const isNew = !initial.id;
  const [f, setF] = useState({
    name: initial.name || '',
    description: initial.description || '',
    category: initial.category || 'Wash & Fold',
    pricingType: initial.pricingType || 'per_kg',
    price: initial.price != null ? String(initial.price) : '',
    estimatedCompletionHours: initial.estimatedCompletionHours != null ? String(initial.estimatedCompletionHours) : '',
    status: initial.status || 'available',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.name.trim()) { Alert.alert('Name required', 'Give this service a name.'); return; }
    if (!(parseFloat(f.price) > 0)) { Alert.alert('Price required', 'Enter a price greater than 0.'); return; }
    setSaving(true);
    try {
      const body = {
        name: f.name.trim(),
        description: f.description.trim() || null,
        category: f.category,
        pricingType: f.pricingType,
        price: parseFloat(f.price),
        estimatedCompletionHours: f.estimatedCompletionHours ? parseInt(f.estimatedCompletionHours, 10) : null,
        status: f.status,
      };
      if (isNew) await providerAPI.createService(body);
      else await providerAPI.updateService(initial.id, body);
      await onSaved();
    } catch (e) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to save service.');
    } finally { setSaving(false); }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{isNew ? 'New service' : 'Edit service'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
            <Field label="Service name">
              <TextInput
                style={styles.input}
                value={f.name}
                onChangeText={set('name')}
                placeholder="e.g. Wash & Fold"
                placeholderTextColor="#9ca3af"
              />
            </Field>

            <Field label="Category">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, f.category === c && styles.chipActive]}
                    onPress={() => set('category')(c)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipText, f.category === c && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Field>

            <Field label="Pricing type">
              <View style={styles.segment}>
                {PRICING_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.segmentBtn, f.pricingType === t.key && styles.segmentBtnActive]}
                    onPress={() => set('pricingType')(t.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segmentText, f.pricingType === t.key && styles.segmentTextActive]}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>{typeMeta(f.pricingType).hint}</Text>
            </Field>

            <Field label={`Price (GH₵${typeMeta(f.pricingType).unit})`}>
              <TextInput
                style={styles.input}
                value={f.price}
                onChangeText={set('price')}
                placeholder="0.00"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
              />
            </Field>

            <Field label="Description (optional)">
              <TextInput
                style={[styles.input, styles.textarea]}
                value={f.description}
                onChangeText={set('description')}
                placeholder="What's included in this service?"
                placeholderTextColor="#9ca3af"
                multiline
              />
            </Field>

            <Field label="Processing time in hours (optional)">
              <TextInput
                style={styles.input}
                value={f.estimatedCompletionHours}
                onChangeText={set('estimatedCompletionHours')}
                placeholder="e.g. 24"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
              />
            </Field>

            {/* Images need a serviceId, so they appear once the service exists. */}
            {isNew ? (
              <View style={styles.photoLater}>
                <Ionicons name="images-outline" size={16} color="#6b7280" />
                <Text style={styles.photoLaterText}>Save the service, then reopen it to add photos.</Text>
              </View>
            ) : (
              <ImageGallery serviceId={initial.id} initial={initial.images || []} />
            )}

            <Field label="Availability">
              <View style={styles.statusGrid}>
                {STATUSES.map((s) => (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.statusOpt, f.status === s.key && { borderColor: s.color, backgroundColor: s.bg }]}
                    onPress={() => set('status')(s.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.statusOptText, f.status === s.key && { color: s.color, fontWeight: '800' }]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>Only “Available” services can be booked by customers.</Text>
            </Field>
          </ScrollView>

          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} activeOpacity={0.9}>
            {saving ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.saveBtnText}>{isNew ? 'Create service' : 'Save changes'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Gallery for one saved service. Uploads go phone → Cloudinary directly using a
// signature from our API, so large files never pass through the backend.
function ImageGallery({ serviceId, initial }) {
  const [images, setImages] = useState(initial || []);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  async function refresh() {
    try {
      const r = await providerAPI.getServiceImages(serviceId);
      setImages(r.data.images || []);
    } catch { /* keep what we have */ }
  }

  async function pickAndUpload() {
    if (images.length >= MAX_IMAGES) {
      Alert.alert('Limit reached', `A service can have at most ${MAX_IMAGES} images.`);
      return;
    }
    // Android 13+ uses the system photo picker, which needs NO permission — so a
    // not-granted result there is not a blocker. Only bail when the user has
    // hard-denied and we can't even ask again; otherwise open the picker and let
    // it fail naturally rather than refusing up front.
    let perm = { granted: true, canAskAgain: true };
    try { perm = await ImagePicker.requestMediaLibraryPermissionsAsync(); } catch { /* older/newer API differences */ }
    if (!perm.granted && perm.canAskAgain === false) {
      Alert.alert('Photo access blocked', 'Enable photo access for LaundroMart in your device settings to add service images.');
      return;
    }

    let picked;
    try {
      picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,         // compress before upload — keeps us well under 5MB
        allowsEditing: false,
      });
    } catch (e) {
      Alert.alert('Could not open photos', e.message || 'Please allow photo access and try again.');
      return;
    }
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];

    setUploading(true);
    try {
      // 1. short-lived signature from our API
      const { data: sig } = await providerAPI.getUploadSignature(serviceId);

      // 2. straight to Cloudinary. Only the signed params may be sent.
      const form = new FormData();
      form.append('file', {
        uri: asset.uri,
        type: asset.mimeType || 'image/jpeg',
        name: asset.fileName || `service-${Date.now()}.jpg`,
      });
      form.append('api_key', String(sig.apiKey));
      form.append('timestamp', String(sig.timestamp));
      form.append('folder', sig.folder);
      form.append('signature', sig.signature);

      const resp = await fetch(sig.uploadUrl, { method: 'POST', body: form });
      const out = await resp.json();
      if (!out.public_id) throw new Error(out.error?.message || 'Upload failed.');

      // 3. record it against the service
      await providerAPI.addServiceImage(serviceId, out.public_id);
      await refresh();
    } catch (e) {
      Alert.alert('Upload failed', e.response?.data?.error || e.message || 'Could not upload that image.');
    } finally { setUploading(false); }
  }

  async function remove(img) {
    Alert.alert('Remove image?', 'This permanently deletes the photo.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusyId(img.id);
          try { await providerAPI.deleteServiceImage(serviceId, img.id); await refresh(); }
          catch (e) { Alert.alert('Error', e.response?.data?.error || 'Failed to remove image.'); }
          finally { setBusyId(null); }
        },
      },
    ]);
  }

  async function makeCover(img) {
    setBusyId(img.id);
    try { await providerAPI.updateServiceImages(serviceId, { coverImageId: img.id }); await refresh(); }
    catch (e) { Alert.alert('Error', e.response?.data?.error || 'Failed to set cover.'); }
    finally { setBusyId(null); }
  }

  // Arrow reordering — same result as drag-and-drop without pulling in a
  // gesture/native dependency.
  async function move(index, delta) {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setImages(next);
    try { await providerAPI.updateServiceImages(serviceId, { order: next.map((i) => i.id) }); }
    catch { refresh(); }
  }

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={styles.galleryHead}>
        <Text style={styles.fieldLabel}>Photos ({images.length}/{MAX_IMAGES})</Text>
        <TouchableOpacity onPress={pickAndUpload} disabled={uploading} activeOpacity={0.85}>
          <Text style={styles.addPhoto}>{uploading ? 'Uploading…' : '+ Add photo'}</Text>
        </TouchableOpacity>
      </View>

      {images.length === 0 && !uploading ? (
        <TouchableOpacity style={styles.photoEmpty} onPress={pickAndUpload} activeOpacity={0.85}>
          <Ionicons name="images-outline" size={26} color="#9ca3af" />
          <Text style={styles.photoEmptyText}>Add photos so customers can see your work</Text>
        </TouchableOpacity>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
          {images.map((img, i) => (
            <View key={img.id} style={styles.thumbWrap}>
              <Image source={{ uri: img.thumbnailUrl || img.url }} style={styles.thumb} />
              {img.isCover && (
                <View style={styles.coverTag}><Text style={styles.coverTagText}>Cover</Text></View>
              )}
              {busyId === img.id && (
                <View style={styles.thumbBusy}><ActivityIndicator color="#fff" /></View>
              )}
              <View style={styles.thumbBar}>
                <TouchableOpacity onPress={() => move(i, -1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="chevron-back" size={15} color="#fff" />
                </TouchableOpacity>
                {!img.isCover && (
                  <TouchableOpacity onPress={() => makeCover(img)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Ionicons name="star-outline" size={15} color="#fff" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => remove(img)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="trash-outline" size={15} color="#fca5a5" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => move(i, 1)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Ionicons name="chevron-forward" size={15} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {uploading && (
            <View style={[styles.thumbWrap, styles.thumbUploading]}>
              <ActivityIndicator color={BRAND} />
              <Text style={styles.uploadingText}>Uploading…</Text>
            </View>
          )}
        </ScrollView>
      )}
      <Text style={styles.hint}>Tap ★ to set the cover, arrows to reorder. JPG, PNG or WEBP.</Text>
    </View>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12.5, color: '#6b7280', marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BRAND, borderRadius: 20, paddingHorizontal: 14, height: 38 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  profileBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#dbeafe' },

  emptyCta: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 7, backgroundColor: BRAND, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13, marginTop: 18 },
  emptyCtaText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  card: {
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 12, borderRadius: 18, padding: 14,
    borderWidth: 1, borderColor: '#eef2f7',
    shadowColor: '#0f172a', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cardIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 15.5, fontWeight: '800', color: '#111827' },
  cardCat: { fontSize: 12.5, color: '#6b7280', marginTop: 1 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 10.5, fontWeight: '800' },
  cardDesc: { fontSize: 13, color: '#4b5563', lineHeight: 18, marginTop: 10 },

  cardMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  priceWrap: { flexDirection: 'row', alignItems: 'baseline' },
  priceValue: { fontSize: 17, fontWeight: '800', color: '#059669' },
  priceUnit: { fontSize: 12.5, fontWeight: '700', color: '#059669' },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  metaChipText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },

  cardActions: { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 4 },
  actionText: { fontSize: 13, fontWeight: '700' },

  // Editor sheet
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, maxHeight: '90%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },

  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 7 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 13, paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 15, color: '#111827' },
  textarea: { minHeight: 78, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 6 },

  chipRow: { gap: 8, paddingRight: 8 },
  chip: { borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#f8fafc', borderRadius: 18, paddingHorizontal: 13, height: 36, justifyContent: 'center' },
  chipActive: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },

  segment: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 9 },
  segmentBtnActive: { backgroundColor: BRAND },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },
  segmentTextActive: { color: '#fff' },

  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusOpt: { borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#f8fafc', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 },
  statusOptText: { fontSize: 13, fontWeight: '600', color: '#374151' },

  // Gallery
  galleryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addPhoto: { color: BRAND, fontWeight: '700', fontSize: 13.5 },
  photoEmpty: { alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 14, backgroundColor: '#f8fafc' },
  photoEmptyText: { fontSize: 12.5, color: '#6b7280' },
  photoLater: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 16 },
  photoLaterText: { flex: 1, fontSize: 12.5, color: '#6b7280' },
  thumbWrap: { width: 104, height: 104, borderRadius: 14, overflow: 'hidden', backgroundColor: '#f1f5f9' },
  thumb: { width: '100%', height: '100%' },
  thumbUploading: { alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#d1d5db' },
  uploadingText: { fontSize: 11, color: '#6b7280' },
  thumbBusy: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  coverTag: { position: 'absolute', top: 6, left: 6, backgroundColor: BRAND, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  coverTagText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  thumbBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 6, backgroundColor: 'rgba(0,0,0,0.55)' },

  saveBtn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
