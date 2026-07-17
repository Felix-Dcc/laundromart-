import React, { useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { NotificationProvider, useNotifications } from './src/context/NotificationContext';
import { RiderProvider } from './src/context/RiderContext';
import { FavoritesProvider } from './src/context/FavoritesContext';
import AppNavigator from './src/navigation/AppNavigator';

function AppInner() {
  const { navigationRef } = useNotifications();
  const { user } = useAuth();

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style="light" />
      {user?.userType === 'rider' ? (
        <RiderProvider>
          <AppNavigator />
        </RiderProvider>
      ) : (
        <AppNavigator />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <FavoritesProvider>
          <AppInner />
        </FavoritesProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}
