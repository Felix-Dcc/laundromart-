import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import ProviderDashboard from '../screens/provider/DashboardScreen';
import OrderQueueScreen from '../screens/provider/OrderQueueScreen';
import ProviderOrderDetailsScreen from '../screens/provider/OrderDetailsScreen';
import ServicesScreen from '../screens/provider/ServicesScreen';
import AnalyticsScreen from '../screens/common/AnalyticsScreen';
import NotificationsScreen from '../screens/common/NotificationsScreen';
import NotificationSettingsScreen from '../screens/common/NotificationSettingsScreen';
import ProfileScreen from '../screens/user/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const headerGreen = { headerStyle: { backgroundColor: '#198754' }, headerTintColor: '#fff' };

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={headerGreen}>
      <Stack.Screen name="Dashboard" component={ProviderDashboard} options={{ title: 'Dashboard' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ title: 'Notification Settings' }} />
    </Stack.Navigator>
  );
}

function QueueStack() {
  return (
    <Stack.Navigator screenOptions={headerGreen}>
      <Stack.Screen name="OrderQueue" component={OrderQueueScreen} options={{ title: 'Order Queue' }} />
      <Stack.Screen name="OrderDetails" component={ProviderOrderDetailsScreen} options={{ title: 'Order Details' }} />
    </Stack.Navigator>
  );
}

function AnalyticsStack() {
  return (
    <Stack.Navigator screenOptions={headerGreen}>
      <Stack.Screen name="AnalyticsHome" component={AnalyticsScreen} options={{ title: 'Analytics' }} />
    </Stack.Navigator>
  );
}

// Business — where a provider manages what they sell and for how much.
function BusinessStack() {
  return (
    <Stack.Navigator screenOptions={headerGreen}>
      <Stack.Screen name="ServicesHome" component={ServicesScreen} options={{ title: 'My Services' }} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={headerGreen}>
      <Stack.Screen name="MyProfile" component={ProfileScreen} options={{ title: 'My Profile' }} />
    </Stack.Navigator>
  );
}

export default function ProviderNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#198754',
        tabBarInactiveTintColor: '#6c757d',
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = 'home-outline';
          else if (route.name === 'Orders') iconName = 'layers-outline';
          else if (route.name === 'Business') iconName = 'pricetags-outline';
          else if (route.name === 'Stats') iconName = 'bar-chart-outline';
          else if (route.name === 'Profile') iconName = 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Orders" component={QueueStack} />
      <Tab.Screen name="Business" component={BusinessStack} />
      <Tab.Screen name="Stats" component={AnalyticsStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}
