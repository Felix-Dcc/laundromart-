import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Reusable star rating component.
 *
 * Props:
 *   rating     – number (current rating)
 *   maxStars   – number (default 5)
 *   size       – number (icon size, default 28)
 *   color      – string (star color, default '#f59e0b')
 *   onRate     – function(starIndex) — if provided, stars are tappable
 *   showLabel  – bool — show "4.2 (12 reviews)" label
 *   count      – number — review count for label
 */
export default function StarRating({
  rating = 0,
  maxStars = 5,
  size = 28,
  color = '#f59e0b',
  onRate,
  showLabel = false,
  count,
}) {
  const stars = [];

  for (let i = 1; i <= maxStars; i++) {
    const filled = i <= Math.round(rating);
    const halfFilled = !filled && i - 0.5 <= rating;

    stars.push(
      <TouchableOpacity
        key={i}
        onPress={() => onRate && onRate(i)}
        disabled={!onRate}
        activeOpacity={onRate ? 0.6 : 1}
        style={{ padding: onRate ? 4 : 1 }}
      >
        <Ionicons
          name={filled ? 'star' : halfFilled ? 'star-half' : 'star-outline'}
          size={size}
          color={filled || halfFilled ? color : '#d1d5db'}
        />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.starsRow}>{stars}</View>
      {showLabel && (
        <Text style={styles.label}>
          {rating > 0 ? rating.toFixed(1) : 'No ratings'}
          {count !== undefined && count > 0 ? ` (${count})` : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  starsRow: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
});
