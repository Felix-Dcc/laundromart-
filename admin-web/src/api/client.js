import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';


export const api = axios.create({ baseURL: API_URL, timeout: 20000 });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem('admin_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  },
);

// ── endpoint helpers ──
export const authApi = {
  login: (email, password, twofaToken, recaptchaToken) => api.post('/auth/login', { email, password, ...(twofaToken ? { twofaToken } : {}), ...(recaptchaToken ? { recaptchaToken } : {}) }),
  me: () => api.get('/auth/me'),
};
export const sa = {
  overview: () => api.get('/superadmin/overview'),
  timeseries: (days = 14) => api.get('/superadmin/timeseries', { params: { days } }),
  liveOps: () => api.get('/superadmin/live-ops'),
  systemHealth: () => api.get('/superadmin/system-health'),
  providers: (search) => api.get('/superadmin/providers', { params: { search } }),
  createProvider: (body) => api.post('/superadmin/providers', body),
  patchProvider: (id, body) => api.patch(`/superadmin/providers/${id}`, body),
  riders: () => api.get('/superadmin/riders'),
  createRider: (body) => api.post('/superadmin/riders', body),
  patchRider: (id, body) => api.patch(`/superadmin/riders/${id}`, body),
  patchUser: (id, body) => api.patch(`/superadmin/users/${id}`, body),
  deleteUser: (id) => api.delete(`/superadmin/users/${id}`),
  resetPassword: (id) => api.post(`/superadmin/users/${id}/reset-password`),
  // Phase 2
  payments: (params) => api.get('/superadmin/payments', { params }),
  reviews: () => api.get('/superadmin/reviews'),
  deleteReview: (id) => api.delete(`/superadmin/reviews/${id}`),
  broadcast: (body) => api.post('/superadmin/broadcast', body),
  admins: () => api.get('/superadmin/admins'),
  createAdmin: (body) => api.post('/superadmin/admins', body),
  patchAdmin: (id, body) => api.patch(`/superadmin/admins/${id}`, body),
  deleteAdmin: (id) => api.delete(`/superadmin/admins/${id}`),
  settings: () => api.get('/superadmin/settings'),
  saveSettings: (body) => api.put('/superadmin/settings', body),
  analytics: () => api.get('/superadmin/analytics'),
  // Phase 3
  promotions: () => api.get('/superadmin/promotions'),
  createPromo: (body) => api.post('/superadmin/promotions', body),
  patchPromo: (id, body) => api.patch(`/superadmin/promotions/${id}`, body),
  deletePromo: (id) => api.delete(`/superadmin/promotions/${id}`),
  security: () => api.get('/superadmin/security/overview'),
  revokeSession: (id) => api.post(`/superadmin/security/sessions/${id}/revoke`),
  updateProfile: (body) => api.put('/superadmin/me', body),
  changePassword: (body) => api.post('/superadmin/me/password', body),
  // Phase 4 — 2FA
  twofaStatus: () => api.get('/superadmin/me/2fa'),
  twofaSetup: () => api.post('/superadmin/me/2fa/setup'),
  twofaEnable: (token) => api.post('/superadmin/me/2fa/enable', { token }),
  twofaDisable: (token) => api.post('/superadmin/me/2fa/disable', { token }),
};

export const supportApi = {
  tickets: (status) => api.get('/support/tickets', { params: { status } }),
  ticket: (id) => api.get(`/support/tickets/${id}`),
  create: (body) => api.post('/support/tickets', body),
  reply: (id, body) => api.post(`/support/tickets/${id}/reply`, { body }),
  setStatus: (id, status) => api.patch(`/support/tickets/${id}`, { status }),
};
export const adminApi = {
  users: (params) => api.get('/admin/users', { params }),
  userDetails: (id) => api.get(`/admin/users/${id}`),
  toggleUser: (id) => api.put(`/admin/users/${id}/toggle-status`),
  orders: (params) => api.get('/admin/orders', { params }),
  orderDetails: (id) => api.get(`/admin/orders/${id}`),
  setOrderStatus: (id, body) => api.put(`/admin/orders/${id}/status`, body),
  reassignRider: (id, riderId) => api.put(`/admin/orders/${id}/reassign-rider`, { riderId }),
  ridersForAssign: () => api.get('/admin/riders'),
  auditLogs: (params) => api.get('/admin/audit-logs', { params }),
};
export const payApi = {
  list: (params) => api.get('/payments', { params }),
  refund: (reference) => api.post(`/payments/refund/${reference}`),
};
