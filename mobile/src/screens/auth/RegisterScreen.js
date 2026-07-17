import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import BrandLogo from '../../components/BrandLogo';
import { useAuth } from '../../context/AuthContext';
import GlassCard from '../../components/GlassCard';
import GlassInput from '../../components/GlassInput';
import NeonButton from '../../components/NeonButton';
import PasswordStrength from '../../components/PasswordStrength';
import AddressSelector from '../../components/AddressSelector';
import colors from '../../theme/colors';

export default function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    address: '',
  });
  const [location, setLocation] = useState({
    latitude: null,
    longitude: null,
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  // Entrance animations - EXACT same as LoginScreen
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    // Smooth entrance animation - same timing and spring as login
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear error when user types
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: null }));
    }
  }

  function validate() {
    const newErrors = {};

    if (!form.firstName.trim()) newErrors.firstName = 'First name is required.';
    if (!form.lastName.trim()) newErrors.lastName = 'Last name is required.';
    if (!form.email.trim()) {
      newErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Please enter a valid email.';
    }
    if (!form.phone.trim()) {
      newErrors.phone = 'Phone number is required.';
    } else if (!/^[0-9+\-\s()]+$/.test(form.phone)) {
      newErrors.phone = 'Please enter a valid phone number.';
    }
    if (!form.password) {
      newErrors.password = 'Password is required.';
    } else if (form.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters.';
    }
    if (!form.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password.';
    } else if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }
    if (!form.address || !form.address.trim()) {
      newErrors.address = 'Address is required. Please select or enter your address.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleRegister() {
    if (!validate()) return;

    setLoading(true);
    setErrors({}); // Clear previous errors
    try {
      await register({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        password: form.password,
        latitude: location.latitude,
        longitude: location.longitude,
      });
      // Success - user is automatically logged in by AuthContext
    } catch (err) {
      const errorMsg = err.message || err.response?.data?.errors?.[0] || 'Registration failed. Please try again.';
      setErrors({ general: errorMsg });
    } finally {
      setLoading(false);
    }
  }

  const animatedStyle = {
    opacity: fadeAnim,
    transform: [
      { translateY: slideAnim },
      { scale: scaleAnim },
    ],
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* EXACT same background as LoginScreen */}
      <LinearGradient
        colors={[colors.background.primary, colors.background.secondary, colors.background.tertiary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* EXACT same ambient light orbs */}
      <View style={styles.ambientOrb1} />
      <View style={styles.ambientOrb2} />
      <View style={styles.ambientOrb3} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, animatedStyle]}>
          {/* EXACT same logo section */}
          <View style={styles.logoContainer}>
            <BrandLogo size={100} style={styles.logoCircle} />
            <Text style={styles.appName}>LaundroMart</Text>
            <Text style={styles.subtitle}>Create your account</Text>
          </View>

          {/* Glass card with form */}
          <GlassCard style={styles.card}>
            {/* Full Name - Split into two fields */}
            <View style={styles.nameRow}>
              <View style={styles.nameField}>
                <GlassInput
                  label="First Name"
                  value={form.firstName}
                  onChangeText={(value) => updateField('firstName', value)}
                  placeholder="First name"
                  icon="person-outline"
                  error={errors.firstName}
                />
              </View>
              <View style={[styles.nameField, styles.nameFieldRight]}>
                <GlassInput
                  label="Last Name"
                  value={form.lastName}
                  onChangeText={(value) => updateField('lastName', value)}
                  placeholder="Last name"
                  icon="person-outline"
                  error={errors.lastName}
                />
              </View>
            </View>

            <GlassInput
              label="Email Address"
              value={form.email}
              onChangeText={(value) => updateField('email', value)}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              icon="mail-outline"
              error={errors.email}
            />

            <GlassInput
              label="Phone Number"
              value={form.phone}
              onChangeText={(value) => updateField('phone', value)}
              placeholder="Enter your phone"
              keyboardType="phone-pad"
              icon="call-outline"
              error={errors.phone}
            />

            <AddressSelector
              label="Address"
              value={form.address}
              onChange={(value) => updateField('address', value)}
              latitude={location.latitude}
              longitude={location.longitude}
              onLocationChange={(loc) => setLocation(loc)}
              error={errors.address}
            />

            <GlassInput
              label="Password"
              value={form.password}
              onChangeText={(value) => updateField('password', value)}
              placeholder="Create a password"
              secureTextEntry
              icon="lock-closed-outline"
              error={errors.password}
            />
            {form.password && <PasswordStrength password={form.password} />}

            <GlassInput
              label="Confirm Password"
              value={form.confirmPassword}
              onChangeText={(value) => updateField('confirmPassword', value)}
              placeholder="Confirm your password"
              secureTextEntry
              icon="lock-closed-outline"
              error={errors.confirmPassword}
            />

            {errors.general && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{errors.general}</Text>
              </View>
            )}

            <NeonButton
              title="Create Account"
              onPress={handleRegister}
              loading={loading}
              disabled={loading}
            />

            <View style={styles.loginRow}>
              <Text style={styles.loginText}>Already have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={styles.loginLink}>Sign in here</Text>
              </TouchableOpacity>
            </View>
          </GlassCard>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
    paddingTop: 40,
  },
  content: {
    width: '100%',
  },
  // EXACT same ambient orbs as LoginScreen
  ambientOrb1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: colors.ambient.cyan,
    opacity: 0.15,
    shadowColor: colors.ambient.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 100,
    shadowOpacity: 0.5,
  },
  ambientOrb2: {
    position: 'absolute',
    bottom: -150,
    left: -150,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: colors.ambient.purple,
    opacity: 0.1,
    shadowColor: colors.ambient.purple,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 120,
    shadowOpacity: 0.4,
  },
  ambientOrb3: {
    position: 'absolute',
    top: '40%',
    right: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: colors.ambient.blue,
    opacity: 0.08,
    shadowColor: colors.ambient.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 80,
    shadowOpacity: 0.3,
  },
  // EXACT same logo section
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  // Framing lives in BrandLogo; only spacing is screen-specific.
  logoCircle: {
    marginBottom: 20,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text.primary,
    // Tight spacing suits the mixed-case wordmark (was 4 for all-caps).
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
  },
  card: {
    width: '100%',
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  nameField: {
    flex: 1,
  },
  nameFieldRight: {
    // No additional styling needed, gap handles spacing
  },
  errorContainer: {
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    backgroundColor: colors.error.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error.border,
  },
  errorText: {
    color: colors.error.text,
    fontSize: 13,
    textAlign: 'center',
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    flexWrap: 'wrap',
  },
  loginText: {
    color: colors.text.tertiary,
    fontSize: 14,
  },
  loginLink: {
    color: colors.ambient.cyan,
    fontSize: 14,
    fontWeight: '600',
  },
});
