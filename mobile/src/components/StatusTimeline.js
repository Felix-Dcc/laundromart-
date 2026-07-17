import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTimeOnly } from '../utils/helpers';
import { metaFor, stepIndexFor, TOTAL_STEPS, isTerminal, colorFor } from '../utils/orderStatus';

/**
 * Unified order timeline — the SAME component on every screen (user, rider,
 * provider, admin). It renders the authoritative `statusHistory` returned by
 * the backend, so every role sees identical steps, timestamps, responsible
 * users, and notes. Optional steps (drying/ironing) simply don't appear when
 * they never happened.
 *
 * Props:
 *   currentStatus – string – the order's current status
 *   statusHistory – array  – canonical shaped history:
 *                            [{ status, label, notes, at, by:{name,role} }]
 *   compact       – bool   – thin progress bar for list cards
 */
export default function StatusTimeline({ currentStatus, statusHistory = [], compact = false }) {
  if (compact) {
    const idx = stepIndexFor(currentStatus);
    const pct = isTerminal(currentStatus)
      ? (currentStatus === 'completed' ? 1 : 0.0)
      : Math.max(0.05, (idx + 1) / TOTAL_STEPS);
    const color = colorFor(currentStatus);
    return (
      <View style={compactStyles.container}>
        <View style={compactStyles.track}>
          <View style={[compactStyles.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
        </View>
        <Text style={[compactStyles.label, { color }]}>{metaFor(currentStatus).label}</Text>
      </View>
    );
  }

  // Normalize history entries (tolerate both shaped {at,by} and raw {createdAt}).
  const entries = (statusHistory || []).map((h) => ({
    status: h.status,
    label: h.label || metaFor(h.status).label,
    notes: h.notes || null,
    at: h.at || h.createdAt || null,
    by: h.by || (h.user ? { name: `${h.user.firstName} ${h.user.lastName}`, role: h.user.userType } : null),
  }));

  if (entries.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>No status updates yet.</Text>
      </View>
    );
  }

  const lastIdx = entries.length - 1;

  return (
    <View style={styles.container}>
      {entries.map((e, idx) => {
        const meta = metaFor(e.status);
        const isCurrent = idx === lastIdx && !isTerminal(e.status);
        const isFinal = idx === lastIdx && isTerminal(e.status);
        const isLast = idx === lastIdx;
        const exception = ['cancelled', 'failed', 'refunded'].includes(e.status);

        return (
          <View key={`${e.status}-${idx}`} style={styles.row}>
            <View style={styles.track}>
              {idx > 0 && <View style={[styles.lineSegment, { backgroundColor: meta.color }]} />}
              <View style={[
                styles.circle,
                { backgroundColor: isCurrent ? meta.bgColor : meta.color, borderColor: meta.color, borderWidth: isCurrent ? 3 : 2 },
              ]}>
                <Ionicons
                  name={exception ? 'close' : (isCurrent ? meta.icon : 'checkmark')}
                  size={isCurrent ? 16 : 14}
                  color={isCurrent ? meta.color : '#fff'}
                />
              </View>
              {!isLast && <View style={[styles.lineSegment, { backgroundColor: '#e5e7eb' }]} />}
            </View>

            <View style={[styles.content, isLast && styles.contentActive]}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: exception ? '#ef4444' : (isCurrent ? meta.color : '#374151') }, (isCurrent || isFinal) && { fontWeight: '800' }]}>
                  {e.label}
                </Text>
                {isCurrent && <Badge color={meta.color} text="Current" />}
                {isFinal && <Badge color={exception ? '#ef4444' : meta.color} text="Final" />}
              </View>
              {e.at && (
                <Text style={styles.timestamp}>
                  <Ionicons name="time-outline" size={11} color="#9ca3af" />{' '}
                  {formatTimeOnly(e.at)} · {new Date(e.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              )}
              {e.by && (
                <Text style={styles.by}>
                  <Ionicons name="person-outline" size={11} color="#9ca3af" /> {e.by.name}{e.by.role ? ` · ${e.by.role}` : ''}
                </Text>
              )}
              {e.notes && <Text style={styles.notes}>“{e.notes}”</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Badge({ color, text }) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 4 },
  empty: { color: '#9ca3af', fontSize: 13, paddingVertical: 8 },
  row: { flexDirection: 'row', minHeight: 64 },
  track: { width: 36, alignItems: 'center' },
  lineSegment: { flex: 1, width: 2.5, backgroundColor: '#e5e7eb', borderRadius: 2 },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  content: { flex: 1, paddingLeft: 12, paddingBottom: 18, justifyContent: 'center' },
  contentActive: { paddingBottom: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  label: { fontSize: 15, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  timestamp: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  by: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  notes: { fontSize: 12, color: '#6b7280', marginTop: 4, fontStyle: 'italic' },
});

const compactStyles = StyleSheet.create({
  container: { paddingVertical: 6 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#e5e7eb', overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '700', marginTop: 6 },
});
