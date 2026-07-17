import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Illustrated empty state with an optional call-to-action.
 * Uses a soft gradient icon medallion (no network needed) so it always renders.
 */
export default function EmptyState({
  icon = 'file-tray-outline',
  title,
  subtitle,
  actionLabel,
  onAction,
  tint = '#1B7BF7',
  style,
}) {
  return (
    <View style={[styles.wrap, style]}>
      <LinearGradient
        colors={[`${tint}22`, `${tint}0d`]}
        style={styles.medallion}
      >
        <Ionicons name={icon} size={46} color={tint} />
      </LinearGradient>
      {!!title && <Text style={styles.title}>{title}</Text>}
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!actionLabel && (
        <TouchableOpacity style={[styles.btn, { backgroundColor: tint }]} onPress={onAction} activeOpacity={0.85}>
          <Text style={styles.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  medallion: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 18, fontWeight: '800', color: '#1f2937', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#9ca3af', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  btn: { marginTop: 22, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 28 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
