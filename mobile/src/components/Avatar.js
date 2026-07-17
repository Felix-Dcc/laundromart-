import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

const PALETTE = ['#1B7BF7', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#14b8a6'];

function colorFor(name) {
  const s = String(name || '?');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

/**
 * Avatar: shows an image when `uri` is given, otherwise deterministic initials
 * on a colored circle. Use for customers, riders, providers, profiles.
 */
export default function Avatar({ name, uri, size = 44, style, ring }) {
  const radius = size / 2;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[{ width: size, height: size, borderRadius: radius }, ring && styles.ring, style]}
      />
    );
  }
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: radius, backgroundColor: colorFor(name) },
        styles.center,
        ring && styles.ring,
        style,
      ]}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 2, borderColor: '#fff' },
});
