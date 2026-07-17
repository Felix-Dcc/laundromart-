import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import UserDashboard from '../screens/user/DashboardScreen';
import ChooseLaundromatScreen from '../screens/user/ChooseLaundromatScreen';
import NewRequestScreen from '../screens/user/NewRequestScreen';
import OrderConfirmationScreen from '../screens/user/OrderConfirmationScreen';
import PaymentScreen from '../screens/user/PaymentScreen';
import RequestsScreen from '../screens/user/RequestsScreen';
import RequestDetailsScreen from '../screens/user/RequestDetailsScreen';
import ReviewScreen from '../screens/user/ReviewScreen';
import NearbyScreen from '../screens/user/NearbyScreen';
import UserMapScreen from '../screens/user/UserMapScreen';
import FavoritesScreen from '../screens/user/FavoritesScreen';
import ProfileScreen from '../screens/user/ProfileScreen';
import NotificationsScreen from '../screens/common/NotificationsScreen';
import NotificationSettingsScreen from '../screens/common/NotificationSettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#1B7BF7' }, headerTintColor: '#fff' }}>
      <Stack.Screen name="Dashboard" component={UserDashboard} options={{ title: 'Dashboard' }} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'My Favorite Laundromats' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ title: 'Notification Settings' }} />
    </Stack.Navigator>
  );
}

function NearbyStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#1B7BF7' }, headerTintColor: '#fff' }}>
      <Stack.Screen name="FindNearby" component={UserMapScreen} options={{ title: 'Nearby Laundromats' }} />
      <Stack.Screen name="NearbyList" component={NearbyScreen} options={{ title: 'Laundromat List' }} />
    </Stack.Navigator>
  );
}

function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#1B7BF7' }, headerTintColor: '#fff' }}>
      <Stack.Screen name="MyRequests" component={RequestsScreen} options={{ title: 'My Requests' }} />
      <Stack.Screen name="ChooseLaundromat" component={ChooseLaundromatScreen} options={{ title: 'Choose a Laundromat' }} />
      <Stack.Screen name="NewRequest" component={NewRequestScreen} options={{ title: 'New Order' }} />
      <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} options={{ title: 'Order Confirmed', headerBackVisible: false }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ title: 'Payment' }} />
      <Stack.Screen name="RequestDetails" component={RequestDetailsScreen} options={{ title: 'Request Details' }} />
      <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Rate Order' }} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: '#1B7BF7' }, headerTintColor: '#fff' }}>
      <Stack.Screen name="MyProfile" component={ProfileScreen} options={{ title: 'My Profile' }} />
      <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ title: 'My Favorite Laundromats' }} />
    </Stack.Navigator>
  );
}

export default function UserNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1B7BF7',
        tabBarInactiveTintColor: '#6c757d',
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = 'home-outline';
          else if (route.name === 'Nearby') iconName = 'location-outline';
          else if (route.name === 'Orders') iconName = 'list-outline';
          else if (route.name === 'Profile') iconName = 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Nearby" component={NearbyStack} />
      <Tab.Screen name="Orders" component={OrdersStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}
