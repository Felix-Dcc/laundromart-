
const prisma = require('../lib/prisma');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// ── Multi-device token management ──
async function registerDeviceToken(userId, token, platform) {
  if (!token) return null;
  // Upsert by token; reassign ownership if the same device logs into a new account.
  return prisma.deviceToken.upsert({
    where: { token },
    update: { userId, platform: platform || undefined },
    create: { userId, token, platform: platform || null },
  });
}

async function removeDeviceToken(token) {
  if (!token) return;
  await prisma.deviceToken.deleteMany({ where: { token } });
}

// Every push token for a user (multi-device) + the legacy single fcmToken.
async function getUserTokens(userId) {
  const [devices, user] = await Promise.all([
    prisma.deviceToken.findMany({ where: { userId }, select: { token: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { fcmToken: true } }),
  ]);
  const set = new Set(devices.map((d) => d.token));
  if (user && user.fcmToken) set.add(user.fcmToken);
  return [...set].filter((t) => t && t.startsWith('ExponentPushToken['));
}

// Map a notification to a preference category (so users can mute categories).
function categoryForTitle(title, data) {
  if (data && data.category) return data.category;
  const t = (title || '').toLowerCase();
  if (t.includes('message')) return 'messages';
  if (t.includes('promo') || t.includes('offer') || t.includes('discount')) return 'promotions';
  if (t.includes('review') || t.includes('provider') || t.includes('laundromat registration')) return 'providerUpdates';
  if (t.includes('login') || t.includes('account') || t.includes('password') || t.includes('welcome') || t.includes('registration')) return 'system';
  return 'orderUpdates';
}

async function isCategoryEnabled(userId, category) {
  try {
    const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
    if (!pref) return true; // default: all on
    return pref[category] !== false;
  } catch (e) {
    return true;
  }
}

function buildDeepLink(data) {
  if (data && data.deepLink) return data.deepLink;
  if (data && data.orderId) return `orders/${data.orderId}`;
  return null;
}

// ── Lightweight in-memory dedupe (avoid sending the same event twice fast) ──
const recentPushes = new Map();
function isDuplicate(userId, type, data) {
  const key = `${userId}:${type}:${(data && data.orderId) || ''}:${(data && data.screen) || ''}`;
  const now = Date.now();
  const last = recentPushes.get(key);
  // prune occasionally
  if (recentPushes.size > 500) {
    for (const [k, t] of recentPushes) if (now - t > 30000) recentPushes.delete(k);
  }
  if (last && now - last < 10000) return true;
  recentPushes.set(key, now);
  return false;
}

// ============================================================
// Send in-app + push notification to a user.
// In-app row is ALWAYS saved (Socket.IO / notification center). Push is sent
// to every device token when the category is enabled and not a duplicate.
// ============================================================
async function sendNotification(userId, title, message, type = 'info', data = {}) {
  try {
    // 1. Always save the in-app notification.
    const notification = await prisma.notification.create({
      data: { userId, title, message, type },
    });

    // 2. Push (best-effort, never blocks the in-app path).
    try {
      const category = categoryForTitle(title, data);
      if (await isCategoryEnabled(userId, category) && !isDuplicate(userId, type, data)) {
        const tokens = await getUserTokens(userId);
        if (tokens.length) {
          const badge = await prisma.notification.count({ where: { userId, isRead: false } });
          await sendExpoPush(tokens, title, message, {
            ...data,
            type,
            category,
            notificationId: notification.id,
            deepLink: buildDeepLink(data),
            timestamp: new Date().toISOString(),
          }, { badge, channelId: pushChannel(category) });
        }
      }
    } catch (pushError) {
      console.error('Push send error:', pushError.message);
    }

    return notification;
  } catch (error) {
    console.error('Notification error:', error.message);
    return null;
  }
}

function pushChannel(category) {
  if (category === 'messages') return 'messages';
  if (category === 'promotions') return 'promotions';
  if (category === 'system') return 'system';
  return 'orders';
}

// ============================================================
// Expo Push API — delivers via FCM (Android) + APNs (iOS).
// Accepts one token or an array; prunes tokens the device rejected.
// ============================================================
async function sendExpoPush(tokenOrTokens, title, body, data = {}, opts = {}) {
  const tokens = (Array.isArray(tokenOrTokens) ? tokenOrTokens : [tokenOrTokens])
    .filter((t) => t && t.startsWith('ExponentPushToken['));
  if (tokens.length === 0) return;

  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: opts.channelId || 'orders',
    badge: opts.badge,
    data, // { orderId, type, deepLink, timestamp, ... } — used for deep-link on tap
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });
    const result = await response.json();
    const tickets = result.data || [];
    // Prune tokens the push service says are no longer registered.
    await Promise.all(tickets.map(async (ticket, i) => {
      if (ticket && ticket.status === 'error') {
        const code = ticket.details && ticket.details.error;
        if (code === 'DeviceNotRegistered') {
          await removeDeviceToken(tokens[i]).catch(() => {});
        } else {
          console.error('Expo push error:', ticket.message);
        }
      }
    }));
  } catch (error) {
    console.error('Expo push fetch error:', error.message);
  }
}

// ============================================================
// CENTRALIZED STATUS-CHANGE NOTIFIER
// Called by orderService.afterTransition() for EVERY status change.
// Picks the right recipients from the target status — the single place
// that decides who hears about what.
// ============================================================
async function notifyStatusChange(order, to, actor = null) {
  const sm = require('./orderStateMachine');
  const meta = sm.STATUS_META[to] || {};
  let body = meta.message || `Your order is now ${sm.labelFor(to)}.`;
  const type = ['cancelled', 'failed'].includes(to) ? 'warning' : (to === 'completed' ? 'success' : 'info');

  // Weight verified → tell the customer who verified it and the final amount.
  if (to === 'weight_verified' && order.finalAmount != null) {
    const name = order.provider?.businessName
      || (order.provider ? `${order.provider.firstName} ${order.provider.lastName}'s Laundry` : 'the laundromat');
    body = `Your laundry has been verified by ${name}. Your final amount is GHS ${Number(order.finalAmount).toFixed(2)}. Please complete payment to begin washing.`;
  }

  // 1. The customer always hears about their order.
  await sendNotification(
    order.userId,
    to === 'weight_verified' ? `Order #${order.requestNumber} — Final Amount Ready` : `Order #${order.requestNumber} Updated`,
    body,
    type,
    { orderId: order.id, screen: 'RequestDetails', category: 'orderUpdates' }
  );

  // 2. New order published → tell the linked provider (scoped!) + admins.
  if (to === 'awaiting_rider') {
    const msg = `New order #${order.requestNumber} is awaiting pickup.`;
    if (order.providerId) {
      await sendNotification(order.providerId, 'New Laundry Order', msg, 'info', { orderId: order.id, screen: 'OrderDetails' });
    }
    await notifyAdmins('New Laundry Order', msg, 'info', { orderId: order.id, screen: 'OrderDetails' });
  }

  // 3. Arrived at the laundromat → the provider can start work.
  if (to === 'at_laundromat' && order.providerId) {
    await sendNotification(order.providerId, 'Order Received', `Order #${order.requestNumber} has arrived at your laundromat.`, 'info', { orderId: order.id, screen: 'OrderDetails' });
  }

  // 3b. Delivery rider collected the clean laundry → tell the provider.
  if (to === 'collected_from_laundromat' && order.providerId) {
    await sendNotification(order.providerId, 'Laundry Collected', `A rider has collected order #${order.requestNumber} for delivery.`, 'info', { orderId: order.id, screen: 'OrderDetails' });
  }

  // 4. Cancelled / failed → provider (scoped) + admins.
  if (['cancelled', 'failed'].includes(to)) {
    const msg = `Order #${order.requestNumber} was ${to}.`;
    if (order.providerId) {
      await sendNotification(order.providerId, `Order ${sm.labelFor(to)}`, msg, 'warning', { orderId: order.id, screen: 'OrderDetails' });
    }
    await notifyAdmins(`Order ${sm.labelFor(to)}`, msg, 'warning', { orderId: order.id, screen: 'OrderDetails' });
  }
}

// ============================================================
// Bulk notify helpers
// ============================================================
async function notifyAdmins(title, message, type = 'info', data = {}) {
  try {
    const admins = await prisma.user.findMany({
      where: { userType: 'admin', status: 'active' },
      select: { id: true },
    });
    // Fan out in parallel instead of awaiting sequentially (faster at scale).
    await Promise.all(admins.map((admin) => sendNotification(admin.id, title, message, type, data)));
  } catch (error) {
    console.error('Notify admins error:', error.message);
  }
}

async function notifyProviders(title, message, type = 'info', data = {}) {
  try {
    const providers = await prisma.user.findMany({
      where: { userType: 'provider', status: 'active' },
      select: { id: true },
    });
    await Promise.all(providers.map((provider) => sendNotification(provider.id, title, message, type, data)));
  } catch (error) {
    console.error('Notify providers error:', error.message);
  }
}

module.exports = {
  sendNotification,
  sendExpoPush,
  registerDeviceToken,
  removeDeviceToken,
  getUserTokens,
  notifyStatusChange,
  notifyAdmins,
  notifyProviders,
};
