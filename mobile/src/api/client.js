import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from '../utils/storage';
import { Platform } from 'react-native';

// Override with EXPO_PUBLIC_API_URL in .env for physical device (your PC's LAN IP).
// Web: localhost = same machine. Android emulator: 10.0.2.2 = host (localhost is the emulator, not your PC).
const DEFAULT_BY_PLATFORM =
  Platform.OS === 'web'
    ? 'http://localhost:3000/api'
    : Platform.OS === 'android'
      ? 'http://10.0.2.2:3000/api'
      : 'http://localhost:3000/api';

// Primary source: baked into the binary via app.config.js `extra.apiUrl` at
// build time — reliable in release builds where EXPO_PUBLIC_ inlining can be
// missed. Falls back to the raw env var (dev / `expo start`), then platform
// dev defaults. This is what prevents release builds pointing at 10.0.2.2.
const extraApiUrl =
  Constants.expoConfig?.extra?.apiUrl ??
  Constants.manifest?.extra?.apiUrl ??
  Constants.manifest2?.extra?.expoClient?.extra?.apiUrl ??
  null;
// NOTE: written as a plain member expression. `process.env?.EXPO_PUBLIC_API_URL`
// (optional chaining) is NOT statically inlined by Expo's babel plugin, so it
// resolved to undefined in release builds and silently fell back to 10.0.2.2 —
// that is the bug that shipped in versionCode 4. Keep this form.
const inlinedEnvUrl = process.env.EXPO_PUBLIC_API_URL;
const envUrl = extraApiUrl || inlinedEnvUrl || null;
// On Android, localhost points to the emulator—never use it; use 10.0.2.2 or your PC's LAN IP.
const effectiveEnvUrl =
  Platform.OS === 'android' && envUrl && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))
    ? null
    : envUrl;

export const API_BASE_URL = effectiveEnvUrl || DEFAULT_BY_PLATFORM;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach JWT token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.log('Token retrieval error:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Transparent access-token refresh ──
// When a request 401s, exchange the stored refresh token for a new access
// token (rotating), then retry. Concurrent 401s share a single refresh.
let isRefreshing = false;
let refreshWaiters = [];
let onAuthFailure = null;

// AuthContext registers this so a failed refresh updates app state (logout).
export function setAuthFailureHandler(fn) { onAuthFailure = fn; }

async function clearStoredAuth() {
  await SecureStore.deleteItemAsync('authToken');
  await SecureStore.deleteItemAsync('refreshToken');
  await SecureStore.deleteItemAsync('userData');
}

async function performRefresh() {
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  if (!refreshToken) throw new Error('no-refresh-token');
  // Bare axios (not `api`) to avoid interceptor recursion.
  const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
  const { token, refreshToken: rotated } = res.data;
  await SecureStore.setItemAsync('authToken', token);
  if (rotated) await SecureStore.setItemAsync('refreshToken', rotated);
  return token;
}

// Response interceptor: refresh-on-401, plus network/429 messaging.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    const url = original.url || '';
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/register');

    // ── 401 → try a single transparent refresh + retry ──
    if (status === 401 && !original._retry && !isAuthCall) {
      original._retry = true;

      // If a refresh is already in flight, wait for it.
      if (isRefreshing) {
        try {
          const token = await new Promise((resolve, reject) => refreshWaiters.push({ resolve, reject }));
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${token}`;
          return api(original);
        } catch (e) {
          return Promise.reject(error);
        }
      }

      isRefreshing = true;
      try {
        const token = await performRefresh();
        refreshWaiters.forEach((w) => w.resolve(token));
        refreshWaiters = [];
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (refreshErr) {
        refreshWaiters.forEach((w) => w.reject(refreshErr));
        refreshWaiters = [];
        await clearStoredAuth();
        if (onAuthFailure) onAuthFailure(); // tell the app to drop to the login screen
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // Handle network errors (no response)
    if (!error.response) {
      console.error('Network error:', error.message, '| URL:', API_BASE_URL);
      if (error.code === 'ECONNREFUSED' || error.message.includes('Network request failed')) {
        error.message = 'Cannot connect to server. Check that the backend is running and the API URL is correct.';
      } else if (error.message.includes('timeout')) {
        error.message = 'Request timed out. Please try again.';
      } else if (error.message === 'Network Error') {
        error.message = 'Cannot reach server. Ensure the backend is running and (on Android) the app allows cleartext HTTP.';
      }
    }

    // Handle 429 rate limited — surface a friendly message
    if (status === 429) {
      error.message = error.response.data?.errors?.[0]
        || 'Too many requests. Please wait a moment and try again.';
    }

    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('API Error (no response):', error.message);
    }

    return Promise.reject(error);
  }
);

// ========================
// AUTH API
// ========================
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  refresh: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  forgotPassword: (data) => api.post('/auth/forgot-password', data),
  getMe: () => api.get('/auth/me'),
  updateFcmToken: (fcmToken, platform) => api.put('/auth/fcm-token', { fcmToken, platform }),
  removeFcmToken: (fcmToken) => api.delete('/auth/fcm-token', { data: { fcmToken } }),
  deleteAccount: (password) => api.post('/auth/delete-account', { password }),
};

// ========================
// USER API
// ========================
export const userAPI = {
  getDashboard: () => api.get('/user/dashboard'),
  getProfile: () => api.get('/user/profile'),
  updateProfile: (data) => api.put('/user/profile', data),
  changePassword: (data) => api.put('/user/change-password', data),
};

// ========================
// ORDERS API (User)
// ========================
export const ordersAPI = {
  list: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  getETA: (id) => api.get(`/orders/${id}/eta`),
  getRiderLocation: (id) => api.get(`/orders/${id}/rider-location`),
  create: (data) => api.post('/orders', data),
  cancel: (id) => api.put(`/orders/${id}/cancel`),
  promoQuote: (code, laundryType, weightKg) => api.post('/orders/promo-quote', { code, laundryType, weightKg }),
};

// ========================
// PROVIDER API
// ========================
export const providerAPI = {
  getDashboard: () => api.get('/provider/dashboard'),
  getQueue: (bucket, params) => api.get(`/provider/queue/${bucket}`, { params }),
  getOrders: (params) => api.get('/provider/orders', { params }),
  // Set an explicit target status (preparing | washing | drying | ironing | ready_for_delivery)
  setStatus: (id, status, adminNotes) => api.put(`/provider/orders/${id}/status`, { status, adminNotes }),
  // Advance to the next forward provider step
  advanceOrder: (id, data) => api.put(`/provider/orders/${id}/advance`, data || {}),
  // Verify the actual laundry weight → backend computes the final price
  verifyWeight: (id, actualWeightKg) => api.put(`/provider/orders/${id}/verify-weight`, { actualWeightKg }),
  // Pause/resume accepting new orders
  getAcceptingOrders: () => api.get('/provider/accepting-orders'),
  setAcceptingOrders: (acceptingOrders) => api.put('/provider/accepting-orders', { acceptingOrders }),
  // ── Services the provider owns and prices themselves ──
  getServiceCategories: () => api.get('/provider/service-categories'),
  getServices: () => api.get('/provider/services'),
  createService: (body) => api.post('/provider/services', body),
  updateService: (id, body) => api.patch(`/provider/services/${id}`, body),
  deleteService: (id) => api.delete(`/provider/services/${id}`),
};

// ========================
// RIDER API
// ========================
export const riderAPI = {
  getStatus: () => api.get('/rider/status'),
  goOnline: () => api.put('/rider/go-online'),
  goOffline: () => api.put('/rider/go-offline'),
  updateLocation: (latitude, longitude) => api.put('/rider/update-location', { latitude, longitude }),
  // Available work
  getAvailableOrders: () => api.get('/rider/orders/available'),           // pickups
  getAvailableDeliveries: () => api.get('/rider/orders/available-deliveries'), // return leg
  getTasks: () => api.get('/rider/tasks'),
  getActiveOrder: () => api.get('/rider/orders/active'),
  getMyOrders: () => api.get('/rider/orders/my-orders'),
  // Pickup leg
  acceptOrder: (orderId) => api.post(`/rider/orders/${orderId}/accept`),
  markOnTheWay: (orderId) => api.put(`/rider/orders/${orderId}/on-the-way`),
  markArrived: (orderId) => api.put(`/rider/orders/${orderId}/arrived`),
  markPickedUp: (orderId) => api.put(`/rider/orders/${orderId}/picked-up`),
  markAtLaundromat: (orderId, laundromatLatitude, laundromatLongitude) =>
    api.put(`/rider/orders/${orderId}/at-laundromat`, { laundromatLatitude, laundromatLongitude }),
  // Return delivery leg
  acceptDelivery: (orderId) => api.post(`/rider/orders/${orderId}/accept-delivery`),
  declineDelivery: (orderId) => api.post(`/rider/orders/${orderId}/decline-delivery`),
  markToLaundromat: (orderId) => api.put(`/rider/orders/${orderId}/to-laundromat`),
  markCollected: (orderId) => api.put(`/rider/orders/${orderId}/collected`),
  markOutForDelivery: (orderId) => api.put(`/rider/orders/${orderId}/out-for-delivery`),
  markArrivedAtCustomer: (orderId) => api.put(`/rider/orders/${orderId}/arrived-customer`),
  markDeliveredToCustomer: (orderId) => api.put(`/rider/orders/${orderId}/delivered`),
  getEarnings: (params) => api.get('/rider/earnings', { params }),
};

// ========================
// ADMIN API
// ========================
export const adminAPI = {
  getDashboard: () => api.get('/admin/dashboard'),
  getUsers: (params) => api.get('/admin/users', { params }),
  getUserById: (id) => api.get(`/admin/users/${id}`),
  toggleUserStatus: (id) => api.put(`/admin/users/${id}/toggle-status`),
  getOrders: (params) => api.get('/admin/orders', { params }),
  getOrderById: (id) => api.get(`/admin/orders/${id}`),
  updateOrderStatus: (id, data) => api.put(`/admin/orders/${id}/status`, data),
  reassignRider: (id, riderId) => api.put(`/admin/orders/${id}/reassign-rider`, { riderId }),
  getRiders: () => api.get('/admin/riders'),
  getAuditLogs: (params) => api.get('/admin/audit-logs', { params }),
  getDispatchSettings: () => api.get('/admin/settings/dispatch'),
  updateDispatchSettings: (patch) => api.put('/admin/settings/dispatch', patch),
};

// ========================
// NOTIFICATIONS API
// ========================
export const notificationsAPI = {
  list: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  getPreferences: () => api.get('/notifications/preferences'),
  updatePreferences: (prefs) => api.put('/notifications/preferences', prefs),
};

// ========================
// NEARBY PROVIDERS API
// ========================
export const nearbyAPI = {
  getProviders: (lat, lng, radius) => api.get('/nearby', { params: { lat, lng, radius } }),
  getAllLaundromats: (lat, lng) => api.get('/nearby/all', { params: { lat, lng } }),
  updateLocation: (data) => api.put('/nearby/update-location', data),
};

// ========================
// FAVORITES API
// ========================
export const favoritesAPI = {
  list: (lat, lng) => api.get('/favorites', { params: { lat, lng } }),
  add: (providerId) => api.post('/favorites', { providerId }),
  remove: (providerId) => api.delete(`/favorites/${providerId}`),
};

// ========================
// PAYMENTS API
// ========================
// WebView watches for this sentinel URL to know the Paystack flow finished.
export const PAYMENT_CALLBACK_URL = 'https://laundromat-payment.app/complete';

export const paymentsAPI = {
  // method: 'momo'|'card'; channel: 'mtn'|'vodafone'|'airteltigo' (momo only)
  initialize: (orderId, method, channel, idempotencyKey) =>
    api.post('/payments/initialize', {
      orderId, method, channel, idempotencyKey, callbackUrl: PAYMENT_CALLBACK_URL,
    }),
  verify: (reference) => api.get(`/payments/verify/${reference}`),
  list: (params) => api.get('/payments', { params }),
  refund: (reference) => api.post(`/payments/refund/${reference}`),
};

// ========================
// ANALYTICS API
// ========================
export const analyticsAPI = {
  get: (range) => api.get('/analytics', { params: { range } }),
};

// ========================
// REVIEWS API
// ========================
export const reviewsAPI = {
  submit: (data) => api.post('/reviews', data),
  getForProvider: (providerId, params) => api.get(`/reviews/provider/${providerId}`, { params }),
  checkOrder: (orderId) => api.get(`/reviews/order/${orderId}`),
};

// ========================
// PRICING API
// ========================
export const pricingAPI = {
  getActive: () => api.get('/pricing'),
  getAll: () => api.get('/pricing/all'),
  create: (data) => api.post('/pricing', data),
  update: (id, data) => api.put(`/pricing/${id}`, data),
  delete: (id) => api.delete(`/pricing/${id}`),
};

export default api;
