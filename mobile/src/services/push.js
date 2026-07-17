/**
 * Push notification service (Expo Notifications → FCM on Android, APNs on iOS).
 *
 * Everything is guarded: in Expo Go (SDK 53+) remote push is unavailable, so
 * these calls no-op gracefully. In an EAS development/production build they
 * deliver real banner / lock-screen / tray / sound / badge notifications, even
 * when the app is backgrounded or closed. Socket.IO continues to drive live
 * in-app updates — push only complements it.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { authAPI } from '../api/client';

let Notifications;
let Device;
try {
  Notifications = require('expo-notifications');
  Device = require('expo-device');
} catch (e) {
  Notifications = null;
}

// Remote push was removed from Expo Go in SDK 53. Detect Expo Go so we can skip
// the push-token request entirely — otherwise expo-notifications logs a scary
// (but harmless) error every launch. Works fine in EAS dev/production builds.
const IS_EXPO_GO =
  Constants?.executionEnvironment === 'storeClient' || Constants?.appOwnership === 'expo';

// Foreground display: show banner + play sound + set badge while app is open.
try {
  if (Notifications && Notifications.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }
} catch (e) { /* ignore */ }

// High-priority Android channels with sound (one per category).
async function configureAndroidChannels() {
  if (Platform.OS !== 'android' || !Notifications?.setNotificationChannelAsync) return;
  const base = { importance: 4, vibrationPattern: [0, 250, 250, 250], sound: 'default', lightColor: '#1B7BF7' };
  try {
    await Notifications.setNotificationChannelAsync('orders', { name: 'Order Updates', ...base });
    await Notifications.setNotificationChannelAsync('messages', { name: 'Messages', ...base });
    await Notifications.setNotificationChannelAsync('promotions', { name: 'Promotions', importance: 3, sound: 'default' });
    await Notifications.setNotificationChannelAsync('system', { name: 'System', ...base });
  } catch (e) { /* ignore */ }
}

/**
 * Request permission, configure channels, get the Expo push token, and register
 * it with the backend (multi-device). Returns the token or null.
 */
export async function registerForPush() {
  if (!Notifications || !Device) return null;
  try {
    // Local notification channels still work in Expo Go — set them up regardless.
    await configureAndroidChannels();

    // Remote push tokens are unavailable in Expo Go (SDK 53+). Skip the request
    // so the library doesn't log an error; in-app + Socket.IO updates still work.
    if (IS_EXPO_GO) {
      console.log('[push] Expo Go detected — remote push disabled. Use an EAS dev build for push notifications.');
      return null;
    }

    if (!Device.isDevice) return null; // emulators can't receive remote push

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    let token;
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId;
      const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      token = tokenData.data;
    } catch (e) {
      // Expected in Expo Go (remote push needs a dev build).
      return null;
    }

    try {
      await authAPI.updateFcmToken(token, Platform.OS);
    } catch (e) { /* backend offline — try again next launch */ }

    return token;
  } catch (e) {
    return null;
  }
}

export async function unregisterPush(token) {
  try {
    if (token) await authAPI.removeFcmToken(token);
  } catch (e) { /* ignore */ }
}

export function addReceivedListener(cb) {
  if (!Notifications?.addNotificationReceivedListener) return null;
  return Notifications.addNotificationReceivedListener(cb);
}

export function addResponseListener(cb) {
  if (!Notifications?.addNotificationResponseReceivedListener) return null;
  return Notifications.addNotificationResponseReceivedListener(cb);
}

// Returns the notification that launched the app from a cold start (tap while closed).
export async function getInitialResponse() {
  if (!Notifications?.getLastNotificationResponseAsync) return null;
  try { return await Notifications.getLastNotificationResponseAsync(); } catch (e) { return null; }
}

export async function setBadgeCount(n) {
  try { if (Notifications?.setBadgeCountAsync) await Notifications.setBadgeCountAsync(Math.max(0, n || 0)); } catch (e) { /* ignore */ }
}
