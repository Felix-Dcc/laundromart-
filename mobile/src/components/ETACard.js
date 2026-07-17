import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * ETA display card — shows remaining time with live countdown.
 *
 * Props:
 *   eta  – { etaMinutes, estimatedCompletion, remainingMinutes, isOverdue }
 *   status – current order status string
 */
export default function ETACard({ eta, status }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [liveMinutes, setLiveMinutes] = useState(eta?.remainingMinutes ?? 0);

  // Live countdown — ticks every 60s
  useEffect(() => {
    if (!eta || !eta.estimatedCompletion) return;

    function tick() {
      const now = new Date();
      const completion = new Date(eta.estimatedCompletion);
      const remaining = Math.max(0, Math.round((completion - now) / 60000));
      setLiveMinutes(remaining);
    }

    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [eta?.estimatedCompletion]);

  // Pulse animation for active orders
  useEffect(() => {
    if (!eta || status === 'delivered' || status === 'cancelled') return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [eta, status]);

  // No ETA to show
  if (!eta || status === 'delivered' || status === 'cancelled') return null;

  const isOverdue = liveMinutes === 0 && eta.isOverdue;
  const hours = Math.floor(liveMinutes / 60);
  const mins = liveMinutes % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

  const completionTime = new Date(eta.estimatedCompletion).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Color based on urgency
  let accentColor = '#3b82f6'; // blue = normal
  let bgColor = '#eff6ff';
  let icon = 'time-outline';

  if (isOverdue) {
    accentColor = '#ef4444'; bgColor = '#fef2f2'; icon = 'alert-circle-outline';
  } else if (liveMinutes <= 10) {
    accentColor = '#f59e0b'; bgColor = '#fffbeb'; icon = 'hourglass-outline';
  } else if (liveMinutes <= 30) {
    accentColor = '#10b981'; bgColor = '#ecfdf5'; icon = 'timer-outline';
  }

  return (
    <Animated.View style={[styles.container, { backgroundColor: bgColor, borderColor: accentColor, transform: [{ scale: pulseAnim }] }]}>
      <View style={[styles.iconCircle, { backgroundColor: accentColor }]}>
        <Ionicons name={icon} size={22} color="#fff" />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>
          {isOverdue ? 'Overdue' : 'Estimated Completion'}
        </Text>

        <View style={styles.timeRow}>
          <Text style={[styles.timeText, { color: accentColor }]}>
            {isOverdue ? 'Processing...' : timeStr}
          </Text>
          {!isOverdue && (
            <Text style={styles.byText}>by {completionTime}</Text>
          )}
        </View>

        {/* Progress indicator */}
        {!isOverdue && eta.etaMinutes > 0 && (
          <View style={styles.progressBg}>
            <View style={[
              styles.progressFill,
              {
                backgroundColor: accentColor,
                width: `${Math.min(100, Math.max(5, ((eta.etaMinutes - liveMinutes) / eta.etaMinutes) * 100))}%`,
              },
            ]} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  label: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  timeText: { fontSize: 24, fontWeight: '800' },
  byText: { fontSize: 13, color: '#9ca3af' },
  progressBg: {
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
});
