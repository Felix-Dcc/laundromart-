import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

// Auth screens
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';

// Role-based navigators
import UserNavigator from './UserNavigator';
import ProviderNavigator from './ProviderNavigator';
import AdminNavigator from './AdminNavigator';
import RiderNavigator from './RiderNavigator';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { user, loading, isLoggedIn } = useAuth();

  if (loading) {
    return (
      <LinearGradient colors={['#0a0a0f', '#0f0f1a', '#151520']} style={splashStyles.container}>
        <View style={splashStyles.logoCircle}>
          <Ionicons name="water-outline" size={48} color="rgba(100,200,255,0.4)" />
        </View>
        <Text style={splashStyles.appName}>LAUNDROMAT</Text>
        <ActivityIndicator size="small" color="rgba(100,200,255,0.4)" style={{ marginTop: 24 }} />
      </LinearGradient>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isLoggedIn ? (
        // Auth flow
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </>
      ) : (user?.userType === 'admin' || user?.userType === 'superadmin') ? (
        <Stack.Screen name="AdminRoot" component={AdminNavigator} />
      ) : user?.userType === 'provider' ? (
        <Stack.Screen name="ProviderRoot" component={ProviderNavigator} />
      ) : user?.userType === 'rider' ? (
        <Stack.Screen name="RiderRoot" component={RiderNavigator} />
      ) : (
        <Stack.Screen name="UserRoot" component={UserNavigator} />
      )}
    </Stack.Navigator>
  );
}

const splashStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logoCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(100,200,255,0.1)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20, borderWidth: 1, borderColor: 'rgba(100,200,255,0.2)',
  },
  appName: { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: 4 },
});
