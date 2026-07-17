import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import AdminDashboard from '../screens/admin/DashboardScreen';
import AdminUsersScreen from '../screens/admin/UsersScreen';
import AdminUserDetailsScreen from '../screens/admin/UserDetailsScreen';
import AdminOrdersScreen from '../screens/admin/OrdersScreen';
import AdminOrderDetailsScreen from '../screens/admin/OrderDetailsScreen';
import AdminPricingScreen from '../screens/admin/PricingScreen';
import AdminTransactionsScreen from '../screens/admin/TransactionsScreen';
import AuditLogScreen from '../screens/admin/AuditLogScreen';
import AnalyticsScreen from '../screens/common/AnalyticsScreen';
import NotificationsScreen from '../screens/common/NotificationsScreen';
import NotificationSettingsScreen from '../screens/common/NotificationSettingsScreen';
import ProfileScreen from '../screens/user/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const headerRed = { headerStyle: { backgroundColor: '#dc3545' }, headerTintColor: '#fff' };

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={headerRed}>
      <Stack.Screen name="Dashboard" component={AdminDashboard} options={{ title: 'Admin Dashboard' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ title: 'Notification Settings' }} />
    </Stack.Navigator>
  );
}

function UsersStack() {
  return (
    <Stack.Navigator screenOptions={headerRed}>
      <Stack.Screen name="AllUsers" component={AdminUsersScreen} options={{ title: 'Manage Users' }} />
      <Stack.Screen name="UserDetails" component={AdminUserDetailsScreen} options={{ title: 'User Details' }} />
    </Stack.Navigator>
  );
}

function OrdersStack() {
  return (
    <Stack.Navigator screenOptions={headerRed}>
      <Stack.Screen name="AllOrders" component={AdminOrdersScreen} options={{ title: 'All Orders' }} />
      <Stack.Screen name="OrderDetails" component={AdminOrderDetailsScreen} options={{ title: 'Order Details' }} />
    </Stack.Navigator>
  );
}

function AnalyticsStack() {
  return (
    <Stack.Navigator screenOptions={headerRed}>
      <Stack.Screen name="AnalyticsHome" component={AnalyticsScreen} options={{ title: 'Analytics' }} />
    </Stack.Navigator>
  );
}

function MoreStack() {
  return (
    <Stack.Navigator screenOptions={headerRed}>
      <Stack.Screen name="Pricing" component={AdminPricingScreen} options={{ title: 'Manage Pricing' }} />
      <Stack.Screen name="Transactions" component={AdminTransactionsScreen} options={{ title: 'Transactions' }} />
      <Stack.Screen name="AuditLogs" component={AuditLogScreen} options={{ title: 'Audit Logs' }} />
      <Stack.Screen name="MyProfile" component={ProfileScreen} options={{ title: 'My Profile' }} />
    </Stack.Navigator>
  );
}

export default function AdminNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#dc3545',
        tabBarInactiveTintColor: '#6c757d',
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Home') iconName = 'home-outline';
          else if (route.name === 'Users') iconName = 'people-outline';
          else if (route.name === 'Orders') iconName = 'list-outline';
          else if (route.name === 'Stats') iconName = 'bar-chart-outline';
          else if (route.name === 'More') iconName = 'ellipsis-horizontal-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} />
      <Tab.Screen name="Orders" component={OrdersStack} />
      <Tab.Screen name="Stats" component={AnalyticsStack} />
      <Tab.Screen name="Users" component={UsersStack} />
      <Tab.Screen name="More" component={MoreStack} />
    </Tab.Navigator>
  );
}
