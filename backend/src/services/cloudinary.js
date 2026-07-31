// ============================================================
// Cloudinary — signed direct uploads, no SDK.
//
// The phone uploads straight to Cloudinary using a short-lived signature minted
// here, so the API secret never leaves the server and multi-MB files never
// transit Railway. Compression, resizing and thumbnails are done by Cloudinary
// via URL transforms, so there is no server-side image processing at all.
//
// Signature algorithm (Cloudinary spec): take the params to be signed, sort them
// by key, join as `k=v&k=v`, append the API secret, then SHA-1 hex digest.
// `file`, `api_key`, `cloud_name` and `resource_type` are never signed.
// ============================================================
const crypto = require('crypto');
const config = require('../config');

const API_BASE = 'https://api.cloudinary.com/v1_1';
const CDN_BASE = 'https://res.cloudinary.com';

function isConfigured() {
  const c = config.cloudinary;
  return Boolean(c.cloudName && c.apiKey && c.apiSecret);
}

function sign(params) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + config.cloudinary.apiSecret).digest('hex');
}

/**
 * Credentials the client needs for one direct upload. The signature covers only
 * `folder` and `timestamp`, so the client must send exactly those two plus
 * `file`, `api_key` and `signature` — nothing more, or the signature fails.
 * Timestamps are Cloudinary-validated, so a leaked signature expires quickly.
 */
function buildUploadSignature() {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = config.cloudinary.folder;
  return {
    signature: sign({ folder, timestamp }),
    timestamp,
    folder,
    apiKey: config.cloudinary.apiKey,
    cloudName: config.cloudinary.cloudName,
    uploadUrl: `${API_BASE}/${config.cloudinary.cloudName}/image/upload`,
  };
}

// Permanently remove an asset. Best-effort: if Cloudinary is unreachable we
// still drop our row, otherwise a failed remote call would strand the image in
// the provider's gallery forever.
async function destroy(publicId) {
  if (!isConfigured() || !publicId) return { ok: false, reason: 'not-configured' };
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign({ public_id: publicId, timestamp });
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: config.cloudinary.apiKey,
      signature,
    });
    const resp = await fetch(`${API_BASE}/${config.cloudinary.cloudName}/image/destroy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await resp.json().catch(() => ({}));
    return { ok: data.result === 'ok' || data.result === 'not found', result: data.result };
  } catch (err) {
    console.error('[cloudinary] destroy failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

// ── Delivery URLs (transforms happen on Cloudinary's CDN, cached) ──
// q_auto = automatic compression, f_auto = best format (WebP/AVIF where supported).
function imageUrl(publicId) {
  if (!publicId) return null;
  return `${CDN_BASE}/${config.cloudinary.cloudName}/image/upload/q_auto,f_auto,w_1200,c_limit/${publicId}`;
}

function thumbnailUrl(publicId) {
  if (!publicId) return null;
  return `${CDN_BASE}/${config.cloudinary.cloudName}/image/upload/c_fill,g_auto,w_400,h_400,q_auto,f_auto/${publicId}`;
}

module.exports = { isConfigured, buildUploadSignature, destroy, imageUrl, thumbnailUrl };
