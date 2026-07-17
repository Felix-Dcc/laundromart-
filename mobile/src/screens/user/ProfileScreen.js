import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { userAPI } from '../../api/client';
import { formatDate, formatDateTime } from '../../utils/helpers';
import Avatar from '../../components/Avatar';
import { Skeleton } from '../../components/Skeleton';

export default function ProfileScreen({ navigation }) {
  const { user, updateUser, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  async function loadProfile() {
    try {
      const res = await userAPI.getProfile();
      setProfile(res.data.user);
      setForm({
        firstName: res.data.user.firstName,
        lastName: res.data.user.lastName,
        email: res.data.user.email,
        phone: res.data.user.phone,
        address: res.data.user.address,
      });
    } catch (error) {
      console.error('Profile load error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateProfile() {
    setSaving(true);
    try {
      const res = await userAPI.updateProfile(form);
      updateUser(res.data.user);
      Alert.alert('Success', 'Profile updated successfully!');
    } catch (error) {
      const errors = error.response?.data?.errors || ['Failed to update profile.'];
      Alert.alert('Error', errors.join('\n'));
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (!pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmPassword) {
      Alert.alert('Error', 'All password fields are required.');
      return;
    }
    if (pwForm.newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      Alert.alert('Error', 'New passwords do not match.');
      return;
    }

    setChangingPw(true);
    try {
      await userAPI.changePassword(pwForm);
      Alert.alert('Success', 'Password changed successfully!');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      const errors = error.response?.data?.errors || ['Failed to change password.'];
      Alert.alert('Error', errors.join('\n'));
    } finally {
      setChangingPw(false);
    }
  }

  if (loading) return (
    <View style={styles.container}>
      <View style={{ alignItems: 'center', paddingVertical: 32 }}>
        <Skeleton width={80} height={80} radius={40} />
        <Skeleton width={160} height={18} style={{ marginTop: 12 }} />
        <Skeleton width={120} height={14} style={{ marginTop: 6 }} />
      </View>
      <View style={styles.card}><Skeleton width="100%" height={200} radius={8} /></View>
    </View>
  );

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {/* Avatar Header */}
      <View style={styles.avatarSection}>
        <Avatar name={`${user?.firstName} ${user?.lastName}`} size={80} />
        <Text style={styles.avatarName}>{user?.firstName} {user?.lastName}</Text>
        <View style={styles.avatarBadge}>
          <Ionicons name="shield-checkmark" size={13} color="#1B7BF7" />
          <Text style={styles.avatarBadgeText}>{user?.userType?.toUpperCase()}</Text>
        </View>
      </View>

      {/* Profile Form */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}><Ionicons name="person-circle-outline" size={20} /> Profile Information</Text>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>First Name</Text>
            <TextInput style={styles.input} value={form.firstName} onChangeText={(v) => setForm({ ...form, firstName: v })} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput style={styles.input} value={form.lastName} onChangeText={(v) => setForm({ ...form, lastName: v })} />
          </View>
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} keyboardType="email-address" autoCapitalize="none" />

        <Text style={styles.label}>Phone</Text>
        <TextInput style={styles.input} value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} keyboardType="phone-pad" />

        <Text style={styles.label}>Address</Text>
        <TextInput style={[styles.input, { minHeight: 60 }]} value={form.address} onChangeText={(v) => setForm({ ...form, address: v })} multiline />

        <TouchableOpacity style={styles.saveBtn} onPress={handleUpdateProfile} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Update Profile</Text>}
        </TouchableOpacity>
      </View>

      {/* Change Password */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}><Ionicons name="lock-closed-outline" size={20} /> Change Password</Text>

        <Text style={styles.label}>Current Password</Text>
        <TextInput style={styles.input} value={pwForm.currentPassword} onChangeText={(v) => setPwForm({ ...pwForm, currentPassword: v })} secureTextEntry />

        <Text style={styles.label}>New Password</Text>
        <TextInput style={styles.input} value={pwForm.newPassword} onChangeText={(v) => setPwForm({ ...pwForm, newPassword: v })} secureTextEntry />

        <Text style={styles.label}>Confirm New Password</Text>
        <TextInput style={styles.input} value={pwForm.confirmPassword} onChangeText={(v) => setPwForm({ ...pwForm, confirmPassword: v })} secureTextEntry />

        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#ffc107' }]} onPress={handleChangePassword} disabled={changingPw}>
          {changingPw ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Change Password</Text>}
        </TouchableOpacity>
      </View>

      {/* My Favorite Laundromats */}
      {user?.userType === 'user' && (
        <TouchableOpacity style={styles.menuRow} onPress={() => navigation.navigate('Favorites')} activeOpacity={0.7}>
          <View style={styles.menuLeft}>
            <View style={styles.menuIcon}>
              <Ionicons name="heart" size={18} color="#ef4444" />
            </View>
            <Text style={styles.menuText}>My Favorite Laundromats</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#adb5bd" />
        </TouchableOpacity>
      )}

      {/* Account Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}><Ionicons name="information-circle-outline" size={20} /> Account Information</Text>
        <Text style={styles.infoLabel}>Account Type: <Text style={styles.infoValue}>{user?.userType?.toUpperCase()}</Text></Text>
        <Text style={styles.infoLabel}>Status: <Text style={styles.infoValue}>{profile?.status?.toUpperCase()}</Text></Text>
        <Text style={styles.infoLabel}>Member Since: <Text style={styles.infoValue}>{formatDate(profile?.createdAt)}</Text></Text>
        <Text style={styles.infoLabel}>Last Updated: <Text style={styles.infoValue}>{formatDateTime(profile?.updatedAt)}</Text></Text>
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={() => Alert.alert('Logout', 'Are you sure?', [{ text: 'No' }, { text: 'Yes', onPress: logout }])}>
        <Ionicons name="log-out-outline" size={20} color="#dc3545" />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarSection: { alignItems: 'center', paddingVertical: 28, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  avatarName: { fontSize: 20, fontWeight: '800', color: '#1f2937', marginTop: 12 },
  avatarBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#eff6ff', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 12, marginTop: 8 },
  avatarBadgeText: { fontSize: 11, fontWeight: '700', color: '#1B7BF7' },
  card: { backgroundColor: '#fff', margin: 16, marginBottom: 0, borderRadius: 10, padding: 16, elevation: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#212529', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#212529', marginBottom: 4, marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#dee2e6', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15 },
  row: { flexDirection: 'row', gap: 12 },
  saveBtn: { backgroundColor: '#1B7BF7', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  infoLabel: { fontSize: 14, color: '#6c757d', marginBottom: 6 },
  infoValue: { color: '#212529', fontWeight: '600' },
  menuRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 10, padding: 16, elevation: 1 },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  menuText: { fontSize: 15, fontWeight: '600', color: '#212529' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', margin: 16, padding: 14, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#dc3545', gap: 8 },
  logoutText: { color: '#dc3545', fontSize: 16, fontWeight: '600' },
});
