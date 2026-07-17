import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import colors from '../../theme/colors';

export default function ForgotPasswordScreen({ navigation }) {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (error) {
      const msg = error.response?.data?.errors?.[0] || 'An error occurred. Please try again.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.logoContainer}>
          <Ionicons name="key-outline" size={50} color={colors.brand.primary} />
          <Text style={styles.title}>Forgot Password</Text>
          <Text style={styles.subtitle}>Enter your email to reset your password</Text>
        </View>

        <View style={styles.form}>
          {sent ? (
            <View style={styles.successContainer}>
              <Ionicons name="checkmark-circle-outline" size={60} color="#198754" />
              <Text style={styles.successText}>
                If an account with that email exists, a password reset link has been sent.
              </Text>
              <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Login')}>
                <Text style={styles.backBtnText}>Back to Login</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputRow}>
                <Ionicons name="mail-outline" size={20} color="#6c757d" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your email address"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <Text style={styles.helpText}>We'll send a password reset link to this email address.</Text>

              <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Send Reset Link</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.loginLink}>
                <Text style={styles.loginLinkText}>Remember your password? Sign in here</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#212529', marginTop: 12 },
  subtitle: { fontSize: 14, color: '#6c757d', marginTop: 4, textAlign: 'center' },
  form: { backgroundColor: '#fff', borderRadius: 12, padding: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  label: { fontSize: 14, fontWeight: '600', color: '#212529', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#dee2e6', borderRadius: 8 },
  inputIcon: { paddingLeft: 12 },
  input: { flex: 1, paddingVertical: 12, paddingHorizontal: 10, fontSize: 16 },
  helpText: { fontSize: 12, color: '#6c757d', marginTop: 6 },
  submitBtn: { backgroundColor: '#1B7BF7', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  loginLink: { alignItems: 'center', marginTop: 16 },
  loginLinkText: { color: '#1B7BF7', fontSize: 14 },
  successContainer: { alignItems: 'center', paddingVertical: 20 },
  successText: { fontSize: 16, color: '#198754', textAlign: 'center', marginVertical: 16 },
  backBtn: { backgroundColor: '#1B7BF7', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 30, marginTop: 8 },
  backBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
