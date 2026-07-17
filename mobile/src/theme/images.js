/**
 * Centralized placeholder imagery.
 *
 * These are royalty-free, deterministic placeholders (Picsum) so the app looks
 * "alive" out of the box. Swap any URL here for your real branded assets later —
 * nothing else needs to change.
 */

// A stable, deterministic photo for a given seed + size.
function pic(seed, w, h) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

export const IMAGES = {
  homeBanner: pic('laundromat-hero', 1200, 600),
  authHero: pic('laundry-fresh', 1000, 600),
  promo: pic('laundry-promo', 1000, 500),
};

// Per-provider cover photo + logo (consistent per laundromat id).
export function providerCover(id, w = 800, h = 360) {
  return pic(`laundromat-cover-${id}`, w, h);
}
export function providerLogo(id, size = 160) {
  return pic(`laundromat-logo-${id}`, size, size);
}

// Illustration accent for empty states (kept subtle).
export const EMPTY = {
  orders: pic('empty-orders', 600, 400),
  favorites: pic('empty-favorites', 600, 400),
  notifications: pic('empty-bell', 600, 400),
};
