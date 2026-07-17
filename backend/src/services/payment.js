/**
 * Payment gateway service — Paystack (Ghana MoMo + cards), with a STUB mode
 * for development so the whole flow is testable without live credentials.
 *
 * Live mode kicks in automatically once PAYSTACK_SECRET_KEY is set.
 * Amounts are handled in the smallest currency unit (pesewas for GHS = amount*100).
 */
const crypto = require('crypto');
const config = require('../config');

const PAYSTACK_BASE = 'https://api.paystack.co';

function isLive() {
  return !!config.payments.paystackSecret;
}

function toSubunit(amount) {
  return Math.round(Number(amount) * 100);
}

// Map our MoMo channel → Paystack mobile_money provider code.
const MOMO_PROVIDER = { mtn: 'mtn', vodafone: 'vod', airteltigo: 'atl' };

async function paystackFetch(path, options = {}) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.payments.paystackSecret}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!data.status) {
    const err = new Error(data.message || 'Paystack request failed');
    err.gateway = data;
    throw err;
  }
  return data.data;
}

/**
 * Initialize a charge. Returns { authorization_url, reference, access_code }.
 * In stub mode, returns a fake authorization URL the client can treat as "approved".
 */
async function initializeCharge({ email, amount, reference, method, channel, metadata, callbackUrl }) {
  if (!isLive()) {
    return {
      authorization_url: `stub://paystack/checkout/${reference}`,
      access_code: 'stub_access_code',
      reference,
      stub: true,
    };
  }

  const body = {
    email,
    amount: toSubunit(amount),
    reference,
    currency: config.payments.currency,
    metadata,
    channels: method === 'card' ? ['card'] : ['mobile_money'],
  };
  // The mobile WebView watches for this URL to know payment finished.
  if (callbackUrl) body.callback_url = callbackUrl;
  if (method === 'momo' && MOMO_PROVIDER[channel]) {
    body.mobile_money = { provider: MOMO_PROVIDER[channel] };
  }
  return paystackFetch('/transaction/initialize', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * Verify a transaction by reference.
 * Returns { status: 'success'|'failed'|'pending', amount, channel, currency, ... }.
 * Stub mode simulates an immediate success.
 */
async function verifyCharge(reference) {
  if (!isLive()) {
    return { status: 'success', amount: null, channel: 'mobile_money', currency: config.payments.currency, reference, stub: true };
  }
  const data = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
  // Paystack returns gateway status 'success' | 'failed' | 'abandoned' | ...
  return data;
}

/**
 * Issue a refund. amount is in major units; omit for a full refund.
 */
async function refundCharge(gatewayReference, amount) {
  if (!isLive()) {
    return { status: 'processed', reference: gatewayReference, stub: true };
  }
  const body = { transaction: gatewayReference };
  if (amount != null) body.amount = toSubunit(amount);
  return paystackFetch('/refund', { method: 'POST', body: JSON.stringify(body) });
}

/**
 * Verify a Paystack webhook signature (HMAC-SHA512 of the RAW body).
 * In stub mode (no live key) we accept so local webhook testing works.
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!isLive()) return true;
  if (!rawBody || !signature) return false;
  const hash = crypto.createHmac('sha512', config.payments.paystackSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch (e) {
    return false;
  }
}

function generateReference(orderId) {
  return `LMSPAY-${Date.now()}-${orderId}-${crypto.randomBytes(4).toString('hex')}`;
}

module.exports = {
  isLive,
  toSubunit,
  initializeCharge,
  verifyCharge,
  refundCharge,
  verifyWebhookSignature,
  generateReference,
};
