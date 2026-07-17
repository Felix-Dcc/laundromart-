/**
 * BrandLogo — the LaundroMart mark, used on auth screens and headers.
 *
 * Renders assets/logo-mark.png (white porthole + cyan water on transparent),
 * which is generated from the same geometry as the app icons by
 * scripts/brand/generate_icons.py. Use this rather than an ad-hoc Ionicon so
 * the in-app identity and the launcher icon can never drift apart.
 */

import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import colors from '../theme/colors';

export default function BrandLogo({ size = 100, framed = true, style }) {
  const mark = (
    <Image
      source={require('../../assets/logo-mark.png')}
      style={{ width: size * 0.62, height: size * 0.62 }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="LaundroMart"
    />
  );

  if (!framed) return <View style={style}>{mark}</View>;

  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      {mark}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: 'rgba(100, 200, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(100, 200, 255, 0.2)',
    shadowColor: colors.ambient.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 30,
    shadowOpacity: 0.3,
  },
});
