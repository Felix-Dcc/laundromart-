const express = require('express');
const { authenticate } = require('../middleware/auth');
const { isOpenNow } = require('../services/providerAvailability');

const router = express.Router();
const prisma = require('../lib/prisma');

// ── Distance helpers (mirrors nearby.js) ──
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function toRad(deg) { return deg * (Math.PI / 180); }
function estimatePickupMinutes(distanceKm) { return Math.max(10, Math.round(distanceKm * 3)); }

const PROVIDER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  address: true,
  latitude: true,
  longitude: true,
  businessName: true,
  businessHours: true,
  acceptingOrders: true,
  avgRating: true,
  reviewCount: true,
  status: true,
  _count: { select: { favoritedBy: true } },
};

function shapeProvider(p, services, distanceKm) {
  const businessHours = p.businessHours || '9:00 AM – 6:00 PM';
  const open = isOpenNow(businessHours);
  const isOpen = open !== false;
  const acceptingOrders = p.acceptingOrders !== false;
  return {
    id: p.id,
    businessName: p.businessName || `${p.firstName}'s Laundry`,
    ownerName: `${p.firstName} ${p.lastName}`,
    email: p.email,
    phone: p.phone,
    address: p.address,
    latitude: p.latitude,
    longitude: p.longitude,
    businessHours,
    avgRating: p.avgRating || 0,
    reviewCount: p.reviewCount || 0,
    favoriteCount: p._count ? p._count.favoritedBy : 0,
    distanceKm,
    estimatedPickupMin: distanceKm != null ? estimatePickupMinutes(distanceKm) : null,
    services,
    isFavorite: true,
    acceptingOrders,
    isOpen,
    open,
    available: p.status === 'active' && acceptingOrders && isOpen,
  };
}

// ============================================================
// GET /api/favorites — all favorite laundromats for the user
// Optional ?lat&lng to compute distance, newest-favorited first
// ============================================================
router.get('/', authenticate, async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const hasLoc = !isNaN(userLat) && !isNaN(userLng);

    const [favorites, activePricing] = await Promise.all([
      prisma.favorite.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        include: { provider: { select: PROVIDER_SELECT } },
      }),
      prisma.laundryPricing.findMany({
        where: { status: 'active' },
        select: { serviceType: true },
        orderBy: { serviceType: 'asc' },
      }),
    ]);

    const services = activePricing.map((s) => s.serviceType);

    const result = favorites
      .filter((f) => f.provider && f.provider.status === 'active')
      .map((f) => {
        const p = f.provider;
        const distanceKm =
          hasLoc && p.latitude != null && p.longitude != null
            ? Math.round(haversineKm(userLat, userLng, p.latitude, p.longitude) * 100) / 100
            : null;
        return { ...shapeProvider(p, services, distanceKm), favoritedAt: f.createdAt };
      });

    // Distance first when we know the user's location; otherwise newest-favorited.
    if (hasLoc) result.sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));

    res.json({ count: result.length, favorites: result });
  } catch (error) {
    console.error('List favorites error:', error);
    res.status(500).json({ error: 'Failed to load favorites.' });
  }
});

// ============================================================
// POST /api/favorites — add a laundromat to favorites (idempotent)
// ============================================================
router.post('/', authenticate, async (req, res) => {
  try {
    const providerId = parseInt(req.body.providerId);
    if (!providerId) {
      return res.status(400).json({ error: 'providerId is required.' });
    }

    const provider = await prisma.user.findFirst({
      where: { id: providerId, userType: 'provider' },
      select: { id: true },
    });
    if (!provider) {
      return res.status(404).json({ error: 'Laundromat not found.' });
    }

    try {
      await prisma.favorite.create({
        data: { userId: req.user.id, providerId },
      });
    } catch (e) {
      // P2002 = unique constraint → already favorited, treat as success.
      if (e.code !== 'P2002') throw e;
    }

    const favoriteCount = await prisma.favorite.count({ where: { providerId } });
    res.status(201).json({ message: 'Added to favorites.', providerId, favoriteCount });
  } catch (error) {
    console.error('Add favorite error:', error);
    res.status(500).json({ error: 'Failed to add favorite.' });
  }
});

// ============================================================
// DELETE /api/favorites/:providerId — remove a favorite
// ============================================================
router.delete('/:providerId', authenticate, async (req, res) => {
  try {
    const providerId = parseInt(req.params.providerId);
    if (!providerId) {
      return res.status(400).json({ error: 'Invalid providerId.' });
    }

    await prisma.favorite.deleteMany({
      where: { userId: req.user.id, providerId },
    });

    const favoriteCount = await prisma.favorite.count({ where: { providerId } });
    res.json({ message: 'Removed from favorites.', providerId, favoriteCount });
  } catch (error) {
    console.error('Remove favorite error:', error);
    res.status(500).json({ error: 'Failed to remove favorite.' });
  }
});

module.exports = router;
