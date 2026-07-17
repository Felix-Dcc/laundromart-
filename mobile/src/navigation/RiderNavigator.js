import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet } from 'react-native';

import RiderDashboardScreen from '../screens/rider/DashboardScreen';
import ActiveTasksScreen from '../screens/rider/ActiveTasksScreen';
import TaskDetailsScreen from '../screens/rider/TaskDetailsScreen';
import RiderNavigationScreen from '../screens/rider/RiderNavigationScreen';
import DeliveryDetailsScreen from '../screens/rider/DeliveryDetailsScreen';
import EarningsScreen from '../screens/rider/EarningsScreen';
import ProfileScreen from '../screens/user/ProfileScreen';
import NotificationsScreen from '../screens/common/NotificationsScreen';
import NotificationSettingsScreen from '../screens/common/NotificationSettingsScreen';
import { useRider } from '../context/RiderContext';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const headerBlue = { headerStyle: { backgroundColor: '#1B7BF7' }, headerTintColor: '#fff' };

function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={headerBlue}>
      <Stack.Screen name="RiderDashboardScreen" component={RiderDashboardScreen} options={{ title: 'Rider Dashboard' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ title: 'Notification Settings' }} />
    </Stack.Navigator>
  );
}

function TasksStack() {
  return (
    <Stack.Navigator screenOptions={headerBlue}>
      <Stack.Screen name="ActiveTasks" component={ActiveTasksScreen} options={{ title: "Today's Route" }} />
      <Stack.Screen name="TaskDetails" component={TaskDetailsScreen} options={{ title: 'Task Details' }} />
      <Stack.Screen name="RiderNavigation" component={RiderNavigationScreen} options={{ title: 'Navigation' }} />
      <Stack.Screen name="DeliveryDetails" component={DeliveryDetailsScreen} options={{ title: 'Delivery' }} />
    </Stack.Navigator>
  );
}

function EarningsStack() {
  return (
    <Stack.Navigator screenOptions={headerBlue}>
      <Stack.Screen name="EarningsScreen" component={EarningsScreen} options={{ title: 'Earnings' }} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={headerBlue}>
      <Stack.Screen name="ProfileScreen" component={ProfileScreen} options={{ title: 'My Profile' }} />
    </Stack.Navigator>
  );
}

// Small badge showing active-task count on the Tasks tab.
function TasksIcon({ focused, color, size }) {
  const { activeTaskCount } = useRider();
  return (
    <View>
      <Ionicons name={focused ? 'list' : 'list-outline'} size={size} color={color} />
      {activeTaskCount > 0 && (
        <View style={styles.badge}><Text style={styles.badgeText}>{activeTaskCount}</Text></View>
      )}
    </View>
  );
}

export default function RiderNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1B7BF7',
        tabBarInactiveTintColor: 'gray',
        tabBarIcon: ({ focused, color, size }) => {
          if (route.name === 'Tasks') return <TasksIcon focused={focused} color={color} size={size} />;
          let iconName = 'home-outline';
          if (route.name === 'Dashboard') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Earnings') iconName = focused ? 'cash' : 'cash-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardStack} />
      <Tab.Screen name="Tasks" component={TasksStack} />
      <Tab.Screen name="Earnings" component={EarningsStack} />
      <Tab.Screen name="Profile" component={ProfileStack} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -6, right: -10, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
