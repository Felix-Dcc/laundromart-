import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import BrandLogo from '../../components/BrandLogo';
import GlassCard from '../../components/GlassCard';
import GlassInput from '../../components/GlassInput';
import NeonButton from '../../components/NeonButton';
import colors from '../../theme/colors';

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    // Smooth entrance animation
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

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Please enter email and password.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await login(email.trim().toLowerCase(), password);
      // Success - navigation handled by AppNavigator based on auth state
    } catch (err) {
      const msg = err.message || err.response?.data?.errors?.[0] || 'Login failed. Please try again.';
      setError(msg);
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
      {/* Animated gradient background */}
      <LinearGradient
        colors={[colors.background.primary, colors.background.secondary, colors.background.tertiary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Subtle ambient light orbs */}
      <View style={styles.ambientOrb1} />
      <View style={styles.ambientOrb2} />
      <View style={styles.ambientOrb3} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, animatedStyle]}>
          {/* Logo section */}
          <View style={styles.logoContainer}>
            <BrandLogo size={100} style={styles.logoCircle} />
            <Text style={styles.appName}>LaundroMart</Text>
            <Text style={styles.subtitle}>Sign in to your account</Text>
          </View>

          {/* Glass card with form */}
          <GlassCard style={styles.card}>
            <GlassInput
              label="Email Address"
              value={email}
              onChangeText={setEmail}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              icon="mail-outline"
              error={error && !password ? error : null}
            />

            <GlassInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              secureTextEntry
              icon="lock-closed-outline"
              error={error && password ? error : null}
            />

            <TouchableOpacity
              onPress={() => navigation.navigate('ForgotPassword')}
              style={styles.forgotButton}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <NeonButton
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
            />

            <View style={styles.registerRow}>
              <Text style={styles.registerText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={styles.registerLink}>Create one here</Text>
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
  },
  content: {
    width: '100%',
  },
  // Ambient light orbs (soft background glow)
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
    // Tight spacing suits the mixed-case wordmark; the old value of 4 was for
    // the all-caps "LAUNDROMAT" and stretches this one.
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
  forgotButton: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 8,
  },
  forgotText: {
    color: colors.ambient.cyan,
    fontSize: 14,
    fontWeight: '500',
  },
  registerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
    flexWrap: 'wrap',
  },
  registerText: {
    color: colors.text.tertiary,
    fontSize: 14,
  },
  registerLink: {
    color: colors.ambient.cyan,
    fontSize: 14,
    fontWeight: '600',
  },
});
