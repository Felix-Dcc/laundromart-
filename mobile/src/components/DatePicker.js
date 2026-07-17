import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import colors from '../theme/colors';

/**
 * Premium Date Picker Component
 * Matches glassmorphism design with date selection
 */
export default function DatePicker({
  label,
  value,
  onChange,
  minimumDate,
  error,
  placeholder = 'Select date',
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const glowAnim = useRef(new Animated.Value(0)).current;

  const dateValue = value ? new Date(value) : new Date();

  useEffect(() => {
    if (isFocused) {
      Animated.timing(glowAnim, {
        toValue: 0.15,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(glowAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }
  }, [isFocused]);

  const formatDisplayDate = (dateString) => {
    if (!dateString) return placeholder;
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if it's today
    if (date.toDateString() === today.toDateString()) {
      return `Today, ${date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
    }

    // Check if it's tomorrow
    if (date.toDateString() === tomorrow.toDateString()) {
      return `Tomorrow, ${date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })}`;
    }

    // Format as "Mon, 9 Feb 2026"
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      setIsFocused(false);
    }

    if (Platform.OS === 'android') {
      if (event.type === 'set' && selectedDate) {
        // Set time to start of day to avoid timezone issues
        const dateOnly = new Date(selectedDate);
        dateOnly.setHours(0, 0, 0, 0);
        const isoString = dateOnly.toISOString().split('T')[0];
        onChange(isoString);
      }
      // If cancelled, just close picker (already done above)
    } else {
      // iOS - always update when date changes
      if (selectedDate) {
        const dateOnly = new Date(selectedDate);
        dateOnly.setHours(0, 0, 0, 0);
        const isoString = dateOnly.toISOString().split('T')[0];
        onChange(isoString);
      }
    }
  };

  const handlePress = () => {
    setIsFocused(true);
    setShowPicker(true);
  };

  const handleIOSDone = () => {
    setShowPicker(false);
    setIsFocused(false);
  };

  const glowOpacity = glowAnim;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}

      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.8}
        style={styles.touchable}
      >
        <Animated.View
          style={[
            styles.inputContainer,
            {
              opacity: glowOpacity,
            },
          ]}
        />

        <BlurView intensity={15} tint="dark" style={styles.blur}>
          <LinearGradient
            colors={[
              isFocused ? 'rgba(100, 200, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
              'rgba(255, 255, 255, 0.03)',
            ]}
            style={styles.gradient}
          >
            <Animated.View
              style={[
                styles.border,
                {
                  borderColor: error
                    ? colors.error.border
                    : isFocused
                    ? 'rgba(120, 200, 255, 0.4)'
                    : 'rgba(255, 255, 255, 0.15)',
                },
              ]}
            />

            <View style={styles.inputRow}>
              <Ionicons
                name="calendar-outline"
                size={20}
                color={isFocused ? colors.ambient.cyan : colors.text.tertiary}
                style={styles.leftIcon}
              />

              <View style={styles.textContainer}>
                <Text
                  style={[
                    styles.displayText,
                    !value && styles.placeholderText,
                  ]}
                >
                  {formatDisplayDate(value)}
                </Text>
              </View>

              <Ionicons
                name="chevron-forward-outline"
                size={18}
                color={colors.text.tertiary}
                style={styles.rightIcon}
              />
            </View>
          </LinearGradient>
        </BlurView>
      </TouchableOpacity>

      {showPicker && (
        <>
          <DateTimePicker
            value={dateValue}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={minimumDate || new Date()}
            onChange={handleDateChange}
          />
          {Platform.OS === 'ios' && (
            <View style={styles.iosPickerContainer}>
              <TouchableOpacity
                style={styles.iosDoneButton}
                onPress={handleIOSDone}
              >
                <Text style={styles.iosDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: 8,
    marginLeft: 4,
  },
  touchable: {
    borderRadius: 16,
    overflow: 'visible',
  },
  inputContainer: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 20,
    backgroundColor: colors.ambient.cyan,
    shadowColor: colors.ambient.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 15,
    shadowOpacity: 0.4,
  },
  blur: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradient: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  border: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  leftIcon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  displayText: {
    fontSize: 16,
    color: colors.text.primary,
  },
  placeholderText: {
    color: colors.text.muted,
  },
  rightIcon: {
    marginLeft: 8,
  },
  errorText: {
    fontSize: 12,
    color: colors.error.text,
    marginTop: 6,
    marginLeft: 4,
  },
  iosPickerContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  iosDoneButton: {
    backgroundColor: colors.ambient.cyan,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  iosDoneText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
