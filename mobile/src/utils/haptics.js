/**
 * Thin, crash-proof wrapper around expo-haptics.
 * Every call is guarded so haptics silently no-op on unsupported
 * devices/platforms ("where supported") and never break the UI.
 */
import * as Haptics from 'expo-haptics';

// Light "tick" as the wheel value changes.
export function selectionTick() {
  try {
    Haptics.selectionAsync();
  } catch (e) {
    // ignore — haptics not supported
  }
}

// Soft confirm bump.
export function lightImpact() {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) {
    // ignore
  }
}
