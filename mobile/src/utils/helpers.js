// ============================================================
// HELPERS — shared utility functions for the mobile app
// ============================================================

// Format currency
export function formatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return `GH₵${num.toFixed(2)}`;
}

// Format date
export function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Format datetime
export function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Format time only (from datetime)
export function formatTimeOnly(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Format HH:MM slot to readable time
export function formatTime(timeString) {
  if (!timeString) return '-';
  const [hours, minutes] = timeString.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

// ============================================================
// STATUS — single source of truth lives in utils/orderStatus.js.
// These wrappers keep the existing helper names working everywhere.
// ============================================================
import { STATUS_META, metaFor, labelFor as _labelFor, progressSteps } from './orderStatus';

// Full mainline progress steps (customer timeline).
export const ORDER_STATUS_STEPS = progressSteps();

// Status badge / accent color (orders + a few non-order states).
export function getStatusColor(status) {
  if (STATUS_META[status]) return STATUS_META[status].color;
  const extras = {
    active: '#10b981', inactive: '#6b7280',
    paid: '#10b981', pending: '#f59e0b',
  };
  return extras[status] || '#6b7280';
}

// Human label for a status.
export function formatStatus(status) {
  if (!status) return '';
  if (STATUS_META[status]) return _labelFor(status);
  return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

// Pickup and delivery time slots
export const TIME_SLOTS = [
  '09:00', '10:00', '11:00', '14:00', '15:00', '16:00',
];

// ============================================================
// TIME WHEEL HELPERS — used by the wheel-style TimePicker.
// pickupTime is always stored/sent as a 24-hour "HH:MM" string,
// matching the existing backend format (unchanged).
// ============================================================

// Round a Date up to the nearest 5-minute mark (e.g. 8:02 → 8:05).
export function roundUpTo5(date = new Date()) {
  const d = new Date(date);
  d.setSeconds(0, 0);
  const rem = d.getMinutes() % 5;
  if (rem !== 0) d.setMinutes(d.getMinutes() + (5 - rem));
  return d;
}

// 24-hour "HH:MM" of a Date.
export function dateToHHMM(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// Current time, rounded up to nearest 5 min, as "HH:MM".
export function nowRoundedUpTo5HHMM() {
  return dateToHHMM(roundUpTo5(new Date()));
}

// "HH:MM" (24h) → { hour12, minute, period }
export function hhmmToParts(hhmm) {
  const [H, M] = (hhmm || '').split(':').map(Number);
  const hours = isNaN(H) ? 0 : H;
  const minute = isNaN(M) ? 0 : M;
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return { hour12, minute, period };
}

// { hour12, minute, period } → "HH:MM" (24h)
export function partsToHHMM(hour12, minute, period) {
  let H = hour12 % 12;
  if (period === 'PM') H += 12;
  return `${String(H).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Is a "YYYY-MM-DD" string the local calendar today?
export function isToday(dateISO) {
  if (!dateISO) return false;
  const [Y, M, D] = dateISO.split('-').map(Number);
  const t = new Date();
  return Y === t.getFullYear() && (M - 1) === t.getMonth() && D === t.getDate();
}

// Validation
export function validateEmail(email) {
  return /^\S+@\S+\.\S+$/.test(email);
}

export function validatePhone(phone) {
  return /^[0-9+\-\s()]+$/.test(phone);
}
