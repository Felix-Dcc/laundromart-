import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import colors from '../theme/colors';

/**
 * Simple Password Strength Indicator
 * Matches glassmorphism design language
 */
export default function PasswordStrength({ password }) {
  if (!password) return null;

  const getStrength = (pwd) => {
    if (pwd.length < 6) return { level: 0, label: 'Too short', color: colors.error.border };
    if (pwd.length < 8) return { level: 1, label: 'Weak', color: '#ef4444' };
    
    let strength = 1;
    if (/[a-z]/.test(pwd)) strength++;
    if (/[A-Z]/.test(pwd)) strength++;
    if (/[0-9]/.test(pwd)) strength++;
    if (/[^a-zA-Z0-9]/.test(pwd)) strength++;

    if (strength <= 2) return { level: 2, label: 'Fair', color: '#f59e0b' };
    if (strength <= 3) return { level: 3, label: 'Good', color: '#10b981' };
    return { level: 4, label: 'Strong', color: colors.ambient.cyan };
  };

  const { level, label, color } = getStrength(password);
  const width = `${(level / 4) * 100}%`;

  return (
    <View style={styles.container}>
      <View style={styles.barContainer}>
        <View style={[styles.bar, { width, backgroundColor: color }]} />
      </View>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    marginBottom: 4,
  },
  barContainer: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  bar: {
    height: 3,
    borderRadius: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
    shadowOpacity: 0.3,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 2,
  },
});
