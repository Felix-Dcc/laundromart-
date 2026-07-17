import React, { createContext, useState, useEffect, useRef, useContext, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { notificationsAPI } from '../api/client';
import {
  registerForPush, unregisterPush, addReceivedListener, addResponseListener,
  getInitialResponse, setBadgeCount,
} from '../services/push';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user, isLoggedIn } = useAuth();
  const [expoPushToken, setExpoPushToken] = useState(null);
  const [lastNotification, setLastNotification] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigationRef = useRef(null);
  const subsRef = useRef([]);
  const tokenRef = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;

  // Sync the app badge + unread count from the server.
  const refreshUnread = useCallback(async () => {
    try {
      const res = await notificationsAPI.getUnreadCount();
      const n = res.data.count || 0;
      setUnreadCount(n);
      setBadgeCount(n);
    } catch (e) { /* ignore */ }
  }, []);

  // ── Deep linking: open the right screen for the notification's payload ──
  const handleDeepLink = useCallback((data) => {
    const nav = navigationRef.current;
    if (!data || !nav) return;
    const u = userRef.current;
    const orderId = data.orderId ? Number(data.orderId) : null;
    try {
      if (u?.userType === 'rider') {
        if (orderId) nav.navigate('Tasks', { screen: 'TaskDetails', params: { orderId } });
        else nav.navigate('Tasks', { screen: 'ActiveTasks' });
      } else if (u?.userType === 'provider') {
        if (orderId) nav.navigate('Orders', { screen: 'OrderDetails', params: { id: orderId } });
      } else if (u?.userType === 'admin') {
        if (orderId) nav.navigate('Orders', { screen: 'OrderDetails', params: { id: orderId } });
      } else if (orderId) {
        nav.navigate('Orders', { screen: 'RequestDetails', params: { id: orderId } });
      }
    } catch (e) { /* ignore nav errors */ }
  }, []);

  // Register for push + wire listeners on login; clean up on logout.
  useEffect(() => {
    if (!isLoggedIn) return undefined;

    let mounted = true;
    registerForPush().then((token) => {
      if (mounted && token) { setExpoPushToken(token); tokenRef.current = token; }
    });
    refreshUnread();

    // Foreground: a push arrived while the app is open → in-app banner + badge.
    const recvSub = addReceivedListener((notification) => {
      setLastNotification(notification);
      refreshUnread();
    });
    if (recvSub) subsRef.current.push(recvSub);

    // User tapped a notification (background/foreground).
    const respSub = addResponseListener((response) => {
      handleDeepLink(response?.notification?.request?.content?.data);
    });
    if (respSub) subsRef.current.push(respSub);

    // Cold start: app opened by tapping a notification while it was closed.
    getInitialResponse().then((response) => {
      if (response) setTimeout(() => handleDeepLink(response?.notification?.request?.content?.data), 600);
    });

    return () => {
      mounted = false;
      subsRef.current.forEach((s) => { try { s && s.remove && s.remove(); } catch (e) { /* ignore */ } });
      subsRef.current = [];
    };
  }, [isLoggedIn, refreshUnread, handleDeepLink]);

  // On logout, unregister this device so it stops receiving the old user's pushes.
  useEffect(() => {
    if (!isLoggedIn && tokenRef.current) {
      unregisterPush(tokenRef.current);
      tokenRef.current = null;
      setExpoPushToken(null);
      setUnreadCount(0);
      setBadgeCount(0);
    }
  }, [isLoggedIn]);

  const value = {
    expoPushToken,
    lastNotification,
    unreadCount,
    refreshUnread,
    navigationRef,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

export default NotificationContext;
