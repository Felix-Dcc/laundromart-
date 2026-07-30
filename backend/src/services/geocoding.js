// ============================================================
// Google Geocoding — turn a saved business address into coordinates.
//
// Used ONCE per provider (at create time, or via the admin backfill). We store
// the returned placeId so we can tell a provider has already been geocoded and
// never bill Google for the same address twice. If no key is configured, every
// function degrades to null and callers simply keep whatever coordinates they
// already have — the map keeps working, addresses just aren't auto-located.
// ============================================================
const config = require('../config');

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

/**
 * @param {string} address  A human address (e.g. "12 Ring Rd, Accra").
 * @returns {Promise<{latitude:number, longitude:number, placeId:string|null, formattedAddress:string|null}|null>}
 */
async function geocodeAddress(address) {
  const key = config.maps.googleKey;
  if (!key) {
    console.warn('[geocoding] GOOGLE_MAPS_API_KEY not set — skipping geocode.');
    return null;
  }
  if (!address || !String(address).trim()) return null;

  try {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(String(address).trim())}&key=${key}`;
    const resp = await fetch(url); // Node 18+ global fetch
    const data = await resp.json();

    if (data.status !== 'OK' || !Array.isArray(data.results) || data.results.length === 0) {
      // ZERO_RESULTS, REQUEST_DENIED (key/API not enabled), OVER_QUERY_LIMIT, etc.
      console.warn(`[geocoding] "${address}" → ${data.status}${data.error_message ? ': ' + data.error_message : ''}`);
      return null;
    }

    const top = data.results[0];
    const loc = top.geometry && top.geometry.location;
    if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return null;

    return {
      latitude: loc.lat,
      longitude: loc.lng,
      placeId: top.place_id || null,
      formattedAddress: top.formatted_address || null,
    };
  } catch (err) {
    console.error('[geocoding] request failed:', err.message);
    return null;
  }
}

module.exports = { geocodeAddress };
