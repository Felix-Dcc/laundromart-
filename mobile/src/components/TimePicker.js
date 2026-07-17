import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import colors from '../theme/colors';
import { selectionTick, lightImpact } from '../utils/haptics';
import {
  hhmmToParts, partsToHHMM, formatTime, nowRoundedUpTo5HHMM,
} from '../utils/helpers';

// ── Wheel geometry ──
const ITEM_HEIGHT = 48;
const VISIBLE = 5;                       // odd → one centered row
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE;
const PAD = ITEM_HEIGHT * Math.floor(VISIBLE / 2);

// ── Wheel data ──
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);          // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);        // 0,5,..,55
const PERIODS = ['AM', 'PM'];

// ============================================================
// A single scrollable wheel column (iOS-Alarm style).
// Memoized so header-time state changes never re-render it.
// ============================================================
const WheelColumn = memo(function WheelColumn({
  data, initialIndex, onIndexChange, formatItem, width,
}) {
  const scrollY = useRef(new Animated.Value(initialIndex * ITEM_HEIGHT)).current;
  const scrollRef = useRef(null);
  const lastIndex = useRef(initialIndex);

  // Snap to the initial value once mounted.
  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: initialIndex * ITEM_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(t);
  }, [initialIndex]);

  // Native-driven offset for fade/scale + JS listener for haptic ticks.
  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    {
      useNativeDriver: true,
      listener: (e) => {
        const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
        if (idx !== lastIndex.current && idx >= 0 && idx < data.length) {
          lastIndex.current = idx;
          selectionTick();
          onIndexChange(idx);
        }
      },
    },
  );

  const handleEnd = (e) => {
    let idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    idx = Math.max(0, Math.min(data.length - 1, idx));
    scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    lastIndex.current = idx;
    onIndexChange(idx);
  };

  return (
    <View style={{ width, height: WHEEL_HEIGHT }}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleEnd}
        contentContainerStyle={{ paddingVertical: PAD }}
        nestedScrollEnabled
      >
        {data.map((item, i) => {
          const inputRange = [
            (i - 2) * ITEM_HEIGHT, (i - 1) * ITEM_HEIGHT, i * ITEM_HEIGHT,
            (i + 1) * ITEM_HEIGHT, (i + 2) * ITEM_HEIGHT,
          ];
          const opacity = scrollY.interpolate({
            inputRange, outputRange: [0.18, 0.45, 1, 0.45, 0.18], extrapolate: 'clamp',
          });
          const scale = scrollY.interpolate({
            inputRange, outputRange: [0.76, 0.88, 1.12, 0.88, 0.76], extrapolate: 'clamp',
          });
          return (
            <Animated.View key={i} style={[styles.item, { opacity, transform: [{ scale }] }]}>
              <Text style={styles.itemText}>{formatItem ? formatItem(item) : String(item)}</Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
});

// ============================================================
// The bottom-sheet contents: live header + 3 wheels + actions.
// Indices are kept in refs (no re-render); only the header
// preview uses lightweight state.
// ============================================================
function TimeWheelSheet({ initialHHMM, onCancel, onConfirm }) {
  const parts = hhmmToParts(initialHHMM);
  const initMinIdx = Math.round(parts.minute / 5) % 12;

  const hourIdxRef = useRef(parts.hour12 - 1);
  const minIdxRef = useRef(initMinIdx);
  const periodIdxRef = useRef(parts.period === 'PM' ? 1 : 0);

  const [preview, setPreview] = useState(
    partsToHHMM(parts.hour12, MINUTES[initMinIdx], parts.period),
  );

  const recompute = useCallback(() => {
    setPreview(partsToHHMM(
      HOURS[hourIdxRef.current],
      MINUTES[minIdxRef.current],
      PERIODS[periodIdxRef.current],
    ));
  }, []);

  // Stable callbacks → memoized wheels never re-render.
  const onHour = useCallback((i) => { hourIdxRef.current = i; recompute(); }, [recompute]);
  const onMin = useCallback((i) => { minIdxRef.current = i; recompute(); }, [recompute]);
  const onPeriod = useCallback((i) => { periodIdxRef.current = i; recompute(); }, [recompute]);

  const handleConfirm = () => {
    lightImpact();
    onConfirm(partsToHHMM(
      HOURS[hourIdxRef.current],
      MINUTES[minIdxRef.current],
      PERIODS[periodIdxRef.current],
    ));
  };

  return (
    <View style={styles.sheetInner}>
      {/* Grab handle */}
      <View style={styles.handle} />

      {/* Live selected-time header */}
      <Text style={styles.headerLabel}>Pickup Time</Text>
      <Text style={styles.headerTime}>{formatTime(preview)}</Text>

      {/* Wheels */}
      <View style={styles.wheelRow}>
        {/* Center selection band spanning all columns */}
        <View pointerEvents="none" style={styles.centerBand} />

        <WheelColumn
          data={HOURS}
          initialIndex={hourIdxRef.current}
          onIndexChange={onHour}
          formatItem={(h) => String(h)}
          width={64}
        />
        <Text style={styles.separator}>:</Text>
        <WheelColumn
          data={MINUTES}
          initialIndex={minIdxRef.current}
          onIndexChange={onMin}
          formatItem={(m) => String(m).padStart(2, '0')}
          width={64}
        />
        <WheelColumn
          data={PERIODS}
          initialIndex={periodIdxRef.current}
          onIndexChange={onPeriod}
          formatItem={(p) => p}
          width={72}
        />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onCancel} activeOpacity={0.85}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmWrap} onPress={handleConfirm} activeOpacity={0.85}>
          <LinearGradient
            colors={['rgba(120,200,255,0.95)', 'rgba(100,170,255,0.85)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.confirmBtn}
          >
            <Ionicons name="checkmark" size={18} color="#0a0a0f" />
            <Text style={styles.confirmText}>Confirm</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================
// Public component: glassmorphism trigger + wheel modal.
// Mirrors the DatePicker API used elsewhere in the form.
//   value      : "HH:MM" 24h string (unchanged storage format)
//   onChange   : (hhmm) => void
//   isToday    : whether the chosen pickup date is today
//   minHHMM    : earliest allowed time when isToday (auto-adjust)
//   optional   : show a clear (×) control + neutral placeholder
// ============================================================
export default function TimePicker({
  label,
  value,
  onChange,
  isToday = false,
  minHHMM = null,
  optional = false,
  placeholder = 'Select time',
}) {
  const [open, setOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const initial = value || (isToday && minHHMM) || nowRoundedUpTo5HHMM();

  const handleConfirm = (hhmm) => {
    let finalVal = hhmm;
    // Auto-adjust past times to the next available valid time.
    if (isToday && minHHMM && hhmm < minHHMM) {
      finalVal = minHHMM;
    }
    onChange(finalVal);
    setOpen(false);
    setIsFocused(false);
  };

  const close = () => { setOpen(false); setIsFocused(false); };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { setIsFocused(true); setOpen(true); }}
        style={styles.touchable}
      >
        <BlurView intensity={15} tint="dark" style={styles.blur}>
          <LinearGradient
            colors={[
              isFocused ? 'rgba(100, 200, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
              'rgba(255, 255, 255, 0.03)',
            ]}
            style={styles.gradient}
          >
            <View style={[styles.border, { borderColor: isFocused ? 'rgba(120,200,255,0.4)' : 'rgba(255,255,255,0.15)' }]} />
            <View style={styles.inputRow}>
              <Ionicons
                name="time-outline"
                size={20}
                color={isFocused ? colors.ambient.accent : colors.text.tertiary}
                style={{ marginRight: 12 }}
              />
              <Text style={[styles.displayText, !value && styles.placeholderText]}>
                {value ? formatTime(value) : placeholder}
              </Text>

              {optional && value ? (
                <TouchableOpacity
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => onChange('')}
                >
                  <Ionicons name="close-circle" size={18} color={colors.text.muted} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward-outline" size={18} color={colors.text.tertiary} />
              )}
            </View>
          </LinearGradient>
        </BlurView>
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={close}
      >
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <BlurView intensity={40} tint="dark" style={styles.sheet}>
            <LinearGradient
              colors={['rgba(21,21,32,0.92)', 'rgba(10,10,15,0.96)']}
              style={StyleSheet.absoluteFill}
            />
            <TimeWheelSheet
              initialHHMM={initial}
              onCancel={close}
              onConfirm={handleConfirm}
            />
          </BlurView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Trigger field ──
  container: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#212529', marginBottom: 6, marginTop: 10 },
  touchable: { borderRadius: 16 },
  blur: { borderRadius: 16, overflow: 'hidden' },
  gradient: { borderRadius: 16, overflow: 'hidden' },
  border: { ...StyleSheet.absoluteFillObject, borderRadius: 16, borderWidth: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  displayText: { flex: 1, fontSize: 16, color: colors.text.primary },
  placeholderText: { color: colors.text.muted },

  // ── Modal / sheet ──
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 24,
  },
  sheetInner: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  handle: {
    alignSelf: 'center', width: 44, height: 5, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 14,
  },
  headerLabel: {
    textAlign: 'center', fontSize: 13, fontWeight: '600',
    color: colors.text.tertiary, letterSpacing: 0.5,
  },
  headerTime: {
    textAlign: 'center', fontSize: 34, fontWeight: '800',
    color: colors.text.primary, marginTop: 2, marginBottom: 12,
    textShadowColor: 'rgba(120,200,255,0.5)', textShadowRadius: 16,
  },

  // ── Wheels ──
  wheelRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    height: WHEEL_HEIGHT, position: 'relative',
  },
  centerBand: {
    position: 'absolute',
    top: (WHEEL_HEIGHT - ITEM_HEIGHT) / 2,
    height: ITEM_HEIGHT,
    left: 10, right: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(120,200,255,0.10)',
    borderTopWidth: 1, borderBottomWidth: 1,
    borderColor: 'rgba(120,200,255,0.25)',
  },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 24, fontWeight: '600', color: colors.text.primary },
  separator: { fontSize: 26, fontWeight: '800', color: colors.text.secondary, marginHorizontal: 2 },

  // ── Actions ──
  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  btn: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  cancelText: { color: colors.text.secondary, fontSize: 16, fontWeight: '600' },
  confirmWrap: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  confirmBtn: {
    flexDirection: 'row', gap: 6, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmText: { color: '#0a0a0f', fontSize: 16, fontWeight: '800' },
});
