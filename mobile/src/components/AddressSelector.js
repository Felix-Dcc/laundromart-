import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import colors from '../theme/colors';

/**
 * Address Selector Component
 * Matches glassmorphism design with location detection
 */
export default function AddressSelector({
  label = 'Address',
  value,
  onChange,
  error,
  latitude,
  longitude,
  onLocationChange,
}) {
  const [mode, setMode] = useState(value ? 'manual' : null); // 'auto' | 'manual' | null
  const [loading, setLoading] = useState(false);
  const [detectedAddress, setDetectedAddress] = useState('');
  const [manualAddress, setManualAddress] = useState(value || '');
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (value) {
      setManualAddress(value);
      setMode('manual');
    }
  }, [value]);

  const handleUseLocation = async () => {
    try {
      setLoading(true);
      setMode('auto');

      // Request permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission',
          'Location permission is required to auto-detect your address. Please enable it in settings or enter your address manually.',
          [{ text: 'OK' }]
        );
        setMode('manual');
        setLoading(false);
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude: lat, longitude: lng } = location.coords;

      // Reverse geocode
      const geocodeResult = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      
      if (geocodeResult && geocodeResult.length > 0) {
        const address = geocodeResult[0];
        // Build readable address
        const parts = [];
        if (address.street) parts.push(address.street);
        if (address.streetNumber) parts.push(address.streetNumber);
        if (address.district) parts.push(address.district);
        if (address.city) parts.push(address.city);
        if (address.region) parts.push(address.region);
        if (address.postalCode) parts.push(address.postalCode);
        if (address.country) parts.push(address.country);

        const readableAddress = parts.join(', ') || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        
        setDetectedAddress(readableAddress);
        setManualAddress(readableAddress);
        
        // Update parent
        onChange(readableAddress);
        if (onLocationChange) {
          onLocationChange({ latitude: lat, longitude: lng });
        }
      } else {
        // Fallback to coordinates
        const fallbackAddress = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        setDetectedAddress(fallbackAddress);
        setManualAddress(fallbackAddress);
        onChange(fallbackAddress);
        if (onLocationChange) {
          onLocationChange({ latitude: lat, longitude: lng });
        }
      }
    } catch (error) {
      console.error('Location error:', error);
      Alert.alert(
        'Location Error',
        'Unable to detect your location. Please enter your address manually.',
        [{ text: 'OK', onPress: () => setMode('manual') }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleManualEntry = () => {
    setMode('manual');
    setDetectedAddress('');
  };

  const handleAddressChange = (text) => {
    setManualAddress(text);
    onChange(text);
    if (onLocationChange && (latitude || longitude)) {
      // Clear coordinates when manually editing
      onLocationChange({ latitude: null, longitude: null });
    }
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}

      {/* Mode selector buttons */}
      {!mode && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.modeButton}
            onPress={handleUseLocation}
            disabled={loading}
          >
            <BlurView intensity={15} tint="dark" style={styles.buttonBlur}>
              <LinearGradient
                colors={['rgba(100, 200, 255, 0.1)', 'rgba(255, 255, 255, 0.05)']}
                style={styles.buttonGradient}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.ambient.cyan} />
                ) : (
                  <>
                    <Ionicons name="location" size={20} color={colors.ambient.cyan} />
                    <Text style={styles.buttonText}>Use my location</Text>
                  </>
                )}
              </LinearGradient>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modeButton}
            onPress={handleManualEntry}
            disabled={loading}
          >
            <BlurView intensity={15} tint="dark" style={styles.buttonBlur}>
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.05)']}
                style={styles.buttonGradient}
              >
                <Ionicons name="create-outline" size={20} color={colors.text.secondary} />
                <Text style={styles.buttonText}>Enter manually</Text>
              </LinearGradient>
            </BlurView>
          </TouchableOpacity>
        </View>
      )}

      {/* Manual input field */}
      {mode === 'manual' && (
        <View style={styles.inputContainer}>
          <Animated.View
            style={[
              styles.glow,
              {
                opacity: glowAnim,
              },
            ]}
          />
          <BlurView intensity={15} tint="dark" style={styles.blur}>
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.03)']}
              style={styles.gradient}
            >
              <Animated.View
                style={[
                  styles.border,
                  {
                    borderColor: error
                      ? colors.error.border
                      : 'rgba(120, 200, 255, 0.2)',
                  },
                ]}
              />
              <View style={styles.inputRow}>
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={colors.ambient.cyan}
                  style={styles.leftIcon}
                />
                <TextInput
                  style={styles.input}
                  value={manualAddress}
                  onChangeText={handleAddressChange}
                  placeholder="Enter hostel name or full address"
                  placeholderTextColor={colors.text.muted}
                  multiline
                  numberOfLines={2}
                  onFocus={() => {
                    Animated.timing(glowAnim, {
                      toValue: 0.15,
                      duration: 300,
                      useNativeDriver: false,
                    }).start();
                  }}
                  onBlur={() => {
                    Animated.timing(glowAnim, {
                      toValue: 0,
                      duration: 300,
                      useNativeDriver: false,
                    }).start();
                  }}
                />
              </View>
            </LinearGradient>
          </BlurView>
        </View>
      )}

      {/* Loading state for auto-detect */}
      {mode === 'auto' && loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.ambient.cyan} />
          <Text style={styles.loadingText}>Detecting your location...</Text>
        </View>
      )}

      {/* Detected address display */}
      {detectedAddress && mode === 'auto' && !loading && (
        <View style={styles.detectedContainer}>
          <View style={styles.detectedHeader}>
            <Ionicons name="checkmark-circle" size={16} color={colors.ambient.cyan} />
            <Text style={styles.detectedLabel}>Detected address</Text>
          </View>
          <Text style={styles.detectedAddress}>{detectedAddress}</Text>
          <TouchableOpacity
            style={styles.editDetectedButton}
            onPress={handleManualEntry}
          >
            <Text style={styles.editDetectedText}>Edit address</Text>
          </TouchableOpacity>
        </View>
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
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  modeButton: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonBlur: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.glass.border,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  inputContainer: {
    borderRadius: 16,
    overflow: 'visible',
  },
  glow: {
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
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 60,
  },
  leftIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text.primary,
    padding: 0,
    textAlignVertical: 'top',
    minHeight: 40,
  },
  editButton: {
    padding: 4,
    marginLeft: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: 'rgba(100, 200, 255, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(100, 200, 255, 0.2)',
  },
  loadingText: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  detectedContainer: {
    padding: 16,
    backgroundColor: 'rgba(100, 200, 255, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(100, 200, 255, 0.2)',
    marginTop: 8,
  },
  detectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  detectedLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ambient.cyan,
  },
  detectedAddress: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 8,
    lineHeight: 20,
  },
  editDetectedButton: {
    alignSelf: 'flex-start',
  },
  editDetectedText: {
    fontSize: 13,
    color: colors.ambient.cyan,
    fontWeight: '500',
  },
  errorText: {
    fontSize: 12,
    color: colors.error.text,
    marginTop: 6,
    marginLeft: 4,
  },
});
