import React, { useRef } from 'react';
import { TouchableOpacity, Animated, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { selectionTick } from '../utils/haptics';

/**
 * Premium animated favorite heart.
 *  - spring "pop" on tap (native driver → 60 FPS)
 *  - subtle expanding ring burst when favoriting
 *  - haptic tick
 *
 * Props:
 *   active      – bool (is favorite)
 *   onToggle    – () => void
 *   size        – icon size (default 24)
 *   activeColor – default '#ef4444'
 *   chip        – render on a frosted circular chip (for use over maps/images)
 */
export default function FavoriteHeart({
  active,
  onToggle,
  size = 24,
  activeColor = '#ef4444',
  inactiveColor = '#9ca3af',
  chip = false,
  style,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;

  const handlePress = () => {
    selectionTick();

    // Pop the heart.
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, speed: 50, bounciness: 14 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 10 }),
    ]).start();

    // Ring burst only when turning ON.
    if (!active) {
      burst.setValue(0);
      Animated.timing(burst, { toValue: 1, duration: 420, useNativeDriver: true }).start();
    }

    onToggle && onToggle();
  };

  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.2, 2.2] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.5, 0.3, 0] });

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[chip && styles.chip, style]}
    >
      {/* burst ring */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.burst,
          {
            width: size, height: size, borderRadius: size / 2,
            borderColor: activeColor,
            opacity: burstOpacity,
            transform: [{ scale: burstScale }],
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons
          name={active ? 'heart' : 'heart-outline'}
          size={size}
          color={active ? activeColor : inactiveColor}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  burst: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%', left: '50%',
    marginTop: -0.5, marginLeft: -0.5,
    borderWidth: 2,
  },
});
