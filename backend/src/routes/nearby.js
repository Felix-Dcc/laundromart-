const express = require('express');
const { authenticate } = require('../middleware/auth');
const { emitLaundromatUpdate } = require('../services/realtime');
const { cacheWrap, cacheDel, KEYS } = require('../lib/cache');
const { isOpenNow } = require('../services/providerAvailability');

const router = express.Router();
const prisma = require('../lib/prisma');

const PROVIDER_FIELDS = {
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
  isVerified: true,
  deliveryRadius: true,
  formattedAddress: true,
  placeId: true,
  avgRating: true,
  reviewCount: true,
  _count: { select: { favoritedBy: true } },
};

// Provider delivers to the customer when the customer sits inside the provider's
// delivery radius. null when we can't tell (no user location or no radius set).
function deliversTo(distanceKm, radius) {
  if (distanceKm == null || radius == null) return null;
  return distanceKm <= radius;
}

// Attach open/accepting/available flags so clients can gate the Select button.
function withAvailability(p, businessHours) {
  const open = isOpenNow(businessHours);        // true | false | null(unparseable)
  const isOpen = open !== false;
  const acceptingOrders = p.acceptingOrders !== false;
  return {
    acceptingOrders,
    isOpen,
    open,
    available: acceptingOrders && isOpen,        // provider is already active (query-filtered)
  };
}

// Active providers + services change rarely vs. how often the map is opened.
// Cached for 30s (bounded staleness) and invalidated on provider mutations
// (location update here, admin status toggle, see admin.js).
function loadActiveProviders() {
  return cacheWrap(KEYS.activeProviders, 30, () => prisma.user.findMany({
    where: { userType: 'provider', status: 'active', latitude: { not: null }, longitude: { not: null } },
    select: PROVIDER_FIELDS,
  }));
}

function loadActiveServices() {
  return cacheWrap(KEYS.activePricing, 300, async () => {
    const rows = await prisma.laundryPricing.findMany({
      where: { status: 'active' },
      orderBy: { serviceType: 'asc' },
    });
    return rows;
  });
}

// ============================================================
// Haversine formula — distance between two GPS points in km
// ============================================================
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

// Estimate pickup time: ~3 min per km, minimum 10 min
function estimatePickupMinutes(distanceKm) {
  return Math.max(10, Math.round(distanceKm * 3));
}

// ============================================================
// GET /api/nearby/all — Return ALL active providers (for map view)
// No radius filter; optional lat/lng to compute distance
// ============================================================
router.get('/all', authenticate, async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const hasUserLocation = !isNaN(userLat) && !isNaN(userLng);

    const [providers, activePricing] = await Promise.all([
      loadActiveProviders(),
      loadActiveServices(),
    ]);

    const services = activePricing.map((s) => s.serviceType);

    const result = providers.map((p) => {
      const distanceKm = hasUserLocation
        ? Math.round(haversineKm(userLat, userLng, p.latitude, p.longitude) * 100) / 100
        : null;
      const businessHours = p.businessHours || '9:00 AM – 6:00 PM';
      return {
        id: p.id,
        businessName: p.businessName || `${p.firstName}'s Laundry`,
        ownerName: `${p.firstName} ${p.lastName}`,
        email: p.email,
        phone: p.phone,
        address: p.formattedAddress || p.address,
        latitude: p.latitude,
        longitude: p.longitude,
        businessHours,
        isVerified: p.isVerified === true,
        deliveryRadius: p.deliveryRadius ?? null,
        deliveryAvailable: deliversTo(distanceKm, p.deliveryRadius),
        avgRating: p.avgRating || 0,
        reviewCount: p.reviewCount || 0,
        favoriteCount: p._count ? p._count.favoritedBy : 0,
        distanceKm,
        estimatedPickupMin: distanceKm != null ? estimatePickupMinutes(distanceKm) : null,
        services,
        ...withAvailability(p, businessHours),
      };
    });

    if (hasUserLocation) {
      result.sort((a, b) => a.distanceKm - b.distanceKm);
    }

    res.json({ count: result.length, providers: result });
  } catch (error) {
    console.error('All laundromats error:', error);
    res.status(500).json({ error: 'Failed to fetch laundromats.' });
  }
});

// ============================================================
// GET /api/nearby?lat=...&lng=...&radius=...
// Find providers within radius (default 20 km), sorted by distance
// ============================================================
router.get('/', authenticate, async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;

    // Validate coordinates
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);

    if (isNaN(userLat) || isNaN(userLng)) {
      return res.status(400).json({ error: 'Valid lat and lng query parameters are required.' });
    }

    if (userLat < -90 || userLat > 90 || userLng < -180 || userLng > 180) {
      return res.status(400).json({ error: 'Coordinates out of valid range.' });
    }

    const maxRadius = parseFloat(radius) || 20; // default 20 km

    // Fetch all active providers that have coordinates (cached).
    const providers = await loadActiveProviders();

    // Calculate distance for each, filter by radius, sort
    const nearby = providers
      .map((p) => {
        const distanceKm = haversineKm(userLat, userLng, p.latitude, p.longitude);
        const businessHours = p.businessHours || '9:00 AM – 6:00 PM';
        return {
          id: p.id,
          businessName: p.businessName || `${p.firstName}'s Laundry`,
          ownerName: `${p.firstName} ${p.lastName}`,
          email: p.email,
          phone: p.phone,
          address: p.formattedAddress || p.address,
          latitude: p.latitude,
          longitude: p.longitude,
          businessHours,
          isVerified: p.isVerified === true,
          deliveryRadius: p.deliveryRadius ?? null,
          deliveryAvailable: deliversTo(Math.round(distanceKm * 100) / 100, p.deliveryRadius),
          avgRating: p.avgRating || 0,
          reviewCount: p.reviewCount || 0,
          favoriteCount: p._count ? p._count.favoritedBy : 0,
          distanceKm: Math.round(distanceKm * 100) / 100,
          estimatedPickupMin: estimatePickupMinutes(distanceKm),
          ...withAvailability(p, businessHours),
        };
      })
      .filter((p) => p.distanceKm <= maxRadius)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({
      count: nearby.length,
      radiusKm: maxRadius,
      userLocation: { lat: userLat, lng: userLng },
      providers: nearby,
    });
  } catch (error) {
    console.error('Nearby providers error:', error);
    res.status(500).json({ error: 'Failed to find nearby providers.' });
  }
});

// ============================================================
// GET /api/nearby/providers/:id/services
// The services a specific laundromat offers, for customers. Only bookable rows:
// available, not soft-deleted. Returns [] when the provider hasn't defined any,
// and the client then falls back to the platform-wide service list — so the
// existing booking flow is unchanged for providers who haven't set theirs up.
// ============================================================
router.get('/providers/:id/services', authenticate, async (req, res) => {
  try {
    const providerId = parseInt(req.params.id, 10);
    if (isNaN(providerId)) return res.status(400).json({ error: 'Invalid provider id.' });

    const rows = await prisma.laundryService.findMany({
      // hiddenByAdmin excludes moderated content from customers entirely.
      where: { providerId, status: 'available', deletedAt: null, hiddenByAdmin: false },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        images: { where: { hiddenByAdmin: false }, orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    const services = rows.map((s) => {
      const price = s.pricingType === 'per_kg' ? Number(s.pricePerKg)
        : s.pricingType === 'fixed' ? Number(s.fixedPrice)
          : Number(s.pricePerItem);
      return {
        id: s.id,
        // `serviceType` mirrors the global pricing shape so the client can render
        // both lists with one component, and orders keep carrying a name.
        serviceType: s.name,
        name: s.name,
        description: s.description,
        category: s.category,
        pricingType: s.pricingType,
        price,
        // per-kg rate under the field the existing UI already reads
        pricePerKg: s.pricingType === 'per_kg' ? Number(s.pricePerKg) : null,
        priceUnit: s.pricingType === 'per_kg' ? '/kg' : s.pricingType === 'per_item' ? ' each' : '',
        estimatedCompletionHours: s.estimatedCompletionHours,
        // per_item can't be priced without a quantity on the order, so it is
        // shown but not bookable yet.
        bookable: s.pricingType === 'per_kg' || s.pricingType === 'fixed',
        // Derive the cover from VISIBLE images — the stored coverImage URL may
        // point at one an admin has since hidden.
        coverImage: (s.images.find((i) => i.isCover) || s.images[0])?.imageUrl || null,
        images: s.images.map((i) => ({ id: i.id, url: i.imageUrl, thumbnailUrl: i.thumbnailUrl, isCover: i.isCover })),
      };
    });

    res.json({ count: services.length, providerId, services });
  } catch (error) {
    console.error('Provider services error:', error);
    res.status(500).json({ error: 'Failed to load services for this laundromat.' });
  }
});

// ============================================================
// PUT /api/nearby/update-location — Provider updates own coordinates
// ============================================================
router.put('/update-location', authenticate, async (req, res) => {
  try {
    if (req.user.userType !== 'provider' && req.user.userType !== 'admin') {
      return res.status(403).json({ error: 'Only providers can update location.' });
    }

    const { latitude, longitude, businessName, businessHours } = req.body;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }

    const data = { latitude: lat, longitude: lng };
    if (businessName) data.businessName = businessName.trim();
    if (businessHours) data.businessHours = businessHours.trim();

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        address: true,
        latitude: true,
        longitude: true,
        businessName: true,
        businessHours: true,
        avgRating: true,
        reviewCount: true,
        status: true,
      },
    });

    await cacheDel(KEYS.activeProviders); // provider data changed → drop cache

    emitLaundromatUpdate('updated', {
      id: updated.id,
      businessName: updated.businessName || `${updated.firstName}'s Laundry`,
      address: updated.address,
      latitude: updated.latitude,
      longitude: updated.longitude,
      businessHours: updated.businessHours,
      avgRating: updated.avgRating,
      reviewCount: updated.reviewCount,
    });

    res.json({ message: 'Location updated successfully.' });
  } catch (error) {
    console.error('Update location error:', error);
    res.status(500).json({ error: 'Failed to update location.' });
  }
});

module.exports = router;
