const express = require('express');
const config = require('../config');
const { authenticate, requireProviderOrAdmin } = require('../middleware/auth');
const { transitionOrder, verifyWeight, TransitionError } = require('../services/orderService');
const sm = require('../services/orderStateMachine');
const { ORDER_INCLUDE, shapeOrder } = require('../lib/orderShape');
const { cacheDel, KEYS } = require('../lib/cache');
const cloudinary = require('../services/cloudinary');

const router = express.Router();
const prisma = require('../lib/prisma');

router.use(authenticate, requireProviderOrAdmin);

// ============================================================
// QUEUE BUCKETS — derived from the single OrderStatus.
//   pending    : order placed, still on its way to the laundromat
//   inprogress : from the moment the laundry arrives until it's delivered back
//   completed  : delivered to the customer / finished
//   cancelled  : cancelled / failed / refunded
// ============================================================
const QUEUE_PENDING     = ['created', 'awaiting_rider', 'rider_assigned', 'rider_on_the_way', 'rider_arrived', 'picked_up'];
const QUEUE_INPROGRESS  = [
  'at_laundromat', 'weight_verified', 'preparing', 'washing', 'drying', 'ironing',
  'ready_for_delivery', 'delivery_rider_assigned', 'rider_to_laundromat',
  'collected_from_laundromat', 'out_for_delivery', 'rider_arrived_at_customer',
];
const QUEUE_COMPLETED   = ['delivered', 'completed'];
const QUEUE_CANCELLED   = ['cancelled', 'failed', 'refunded'];

const BUCKETS = {
  pending: QUEUE_PENDING,
  inprogress: QUEUE_INPROGRESS,
  completed: QUEUE_COMPLETED,
  cancelled: QUEUE_CANCELLED,
};

// A provider only ever sees the orders routed to them. (Admins see all.)
function scopeToProvider(req, where = {}) {
  if (req.user.userType === 'provider') return { ...where, providerId: req.user.id };
  return where;
}

// ============================================================
// GET /api/provider/dashboard — stats + recent per queue
// ============================================================
router.get('/dashboard', async (req, res) => {
  try {
    const base = scopeToProvider(req);
    const [pendingCount, inProgressCount, completedCount, cancelledCount, totalRequests, awaitingVerifyCount] = await Promise.all([
      prisma.laundryRequest.count({ where: { ...base, status: { in: QUEUE_PENDING } } }),
      prisma.laundryRequest.count({ where: { ...base, status: { in: QUEUE_INPROGRESS } } }),
      prisma.laundryRequest.count({ where: { ...base, status: { in: QUEUE_COMPLETED } } }),
      prisma.laundryRequest.count({ where: { ...base, status: { in: QUEUE_CANCELLED } } }),
      prisma.laundryRequest.count({ where: base }),
      // Orders that need the provider to verify weight right now.
      prisma.laundryRequest.count({ where: { ...base, status: 'at_laundromat' } }),
    ]);

    const [toVerify, inProgress, ready] = await Promise.all([
      // "Verify Laundry" section — orders that just arrived and need weighing.
      prisma.laundryRequest.findMany({ where: { ...base, status: 'at_laundromat' }, include: ORDER_INCLUDE, orderBy: { updatedAt: 'asc' }, take: 5 }),
      prisma.laundryRequest.findMany({ where: { ...base, status: { in: ['weight_verified', 'preparing', 'washing', 'drying', 'ironing'] } }, include: ORDER_INCLUDE, orderBy: { updatedAt: 'desc' }, take: 5 }),
      prisma.laundryRequest.findMany({ where: { ...base, status: { in: ['ready_for_delivery', 'delivery_rider_assigned', 'rider_to_laundromat', 'collected_from_laundromat', 'out_for_delivery', 'rider_arrived_at_customer'] } }, include: ORDER_INCLUDE, orderBy: { updatedAt: 'desc' }, take: 5 }),
    ]);

    const shape = (r) => shapeOrder(r, { role: req.user.userType });
    res.json({
      stats: { pendingCount, inProgressCount, completedCount, cancelledCount, totalRequests, awaitingVerifyCount,
               // aliases kept for backward compat with older mobile builds
               incomingCount: pendingCount },
      queues: { toVerify: toVerify.map(shape), inProgress: inProgress.map(shape), ready: ready.map(shape) },
    });
  } catch (error) {
    console.error('Provider dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
});

// ============================================================
// GET /api/provider/queue/:bucket — paginated queue list
// ============================================================
router.get('/queue/:bucket', async (req, res) => {
  try {
    const { bucket } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = config.app.recordsPerPage;
    const offset = (page - 1) * limit;

    // 'incoming' kept as an alias for 'pending' (older mobile builds).
    const key = bucket === 'incoming' ? 'pending' : bucket;
    const statuses = BUCKETS[key];
    if (!statuses) return res.status(400).json({ error: 'Invalid queue bucket. Use: pending, inprogress, completed, cancelled.' });
    const orderBy = key === 'pending' ? { createdAt: 'asc' } : { updatedAt: 'desc' };

    const where = scopeToProvider(req, { status: { in: statuses } });
    const { search } = req.query;
    if (search) {
      where.OR = [
        { requestNumber: { contains: search, mode: 'insensitive' } },
        { laundryType: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [requests, totalRecords] = await Promise.all([
      prisma.laundryRequest.findMany({ where, include: ORDER_INCLUDE, orderBy, take: limit, skip: offset }),
      prisma.laundryRequest.count({ where }),
    ]);

    res.json({
      bucket,
      requests: requests.map((r) => shapeOrder(r, { role: req.user.userType })),
      pagination: { page, limit, totalRecords, totalPages: Math.ceil(totalRecords / limit) },
    });
  } catch (error) {
    console.error('Queue fetch error:', error);
    res.status(500).json({ error: 'Failed to load queue.' });
  }
});

// ============================================================
// GET /api/provider/orders — generic filtered list (kept for compat)
// ============================================================
router.get('/orders', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = config.app.recordsPerPage;
    const offset = (page - 1) * limit;
    const { status, search } = req.query;

    const where = scopeToProvider(req);
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { requestNumber: { contains: search, mode: 'insensitive' } },
        { laundryType: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [requests, totalRecords] = await Promise.all([
      prisma.laundryRequest.findMany({ where, include: ORDER_INCLUDE, orderBy: { createdAt: 'desc' }, take: limit, skip: offset }),
      prisma.laundryRequest.count({ where }),
    ]);

    res.json({
      requests: requests.map((r) => shapeOrder(r, { role: req.user.userType })),
      pagination: { page, limit, totalRecords, totalPages: Math.ceil(totalRecords / limit) },
    });
  } catch (error) {
    console.error('Provider orders error:', error);
    res.status(500).json({ error: 'Failed to load orders.' });
  }
});

// ============================================================
// PUT /api/provider/orders/:id/verify-weight — enter the ACTUAL weight.
// Backend recomputes the final price and moves the order to weight_verified.
// Body: { actualWeightKg }
// ============================================================
router.put('/orders/:id/verify-weight', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    await assertProviderOwnsOrder(req, requestId);

    const shaped = await verifyWeight({
      orderId: requestId,
      actor: { id: req.user.id, role: req.user.userType, name: `${req.user.firstName} ${req.user.lastName}` },
      actualWeightKg: req.body.actualWeightKg,
      req,
    });
    res.json({ message: 'Weight verified. Awaiting customer payment.', order: shaped });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to verify weight.');
  }
});

// ============================================================
// PUT /api/provider/orders/:id/status — set an explicit provider status
// (preparing | washing | drying | ironing | ready_for_delivery)
// All validation/ownership/race-safety handled by the OrderService.
// (preparing is payment-gated: rejected with 402 until the customer pays.)
// ============================================================
router.put('/orders/:id/status', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { status, adminNotes } = req.body;
    if (!status) return res.status(400).json({ error: 'Target status is required.' });

    await assertProviderOwnsOrder(req, requestId);

    const shaped = await transitionOrder({
      orderId: requestId,
      to: status,
      actor: { id: req.user.id, role: req.user.userType, name: `${req.user.firstName} ${req.user.lastName}` },
      notes: adminNotes || null,
      req,
    });
    res.json({ message: `Order updated to "${sm.labelFor(status)}".`, order: shaped, eta: shaped.eta });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to update status.');
  }
});

// ============================================================
// PUT /api/provider/orders/:id/advance — move to the next forward step
// ============================================================
router.put('/orders/:id/advance', async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { adminNotes } = req.body;

    await assertProviderOwnsOrder(req, requestId);

    const order = await prisma.laundryRequest.findUnique({ where: { id: requestId }, select: { status: true } });
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // The next forward step this provider is allowed to make.
    const actions = sm.allowedActionsFor(order.status, req.user.userType).filter((a) => a.to !== 'cancelled');
    if (actions.length === 0) {
      return res.status(409).json({ error: `No further provider step from "${sm.labelFor(order.status)}".` });
    }
    const next = actions[0].to; // first forward action (drying preferred over ready when applicable)

    const shaped = await transitionOrder({
      orderId: requestId, to: next,
      actor: { id: req.user.id, role: req.user.userType, name: `${req.user.firstName} ${req.user.lastName}` },
      notes: adminNotes || null, req,
    });
    res.json({ message: `Order advanced to "${sm.labelFor(next)}".`, order: shaped, newStatus: next, eta: shaped.eta });
  } catch (error) {
    return sendTransitionError(res, error, 'Failed to advance order.');
  }
});

// ============================================================
// GET/PUT /api/provider/accepting-orders — pause/resume new orders
// ============================================================
router.get('/accepting-orders', async (req, res) => {
  try {
    const id = req.user.userType === 'provider' ? req.user.id : parseInt(req.query.providerId);
    if (!id) return res.status(400).json({ error: 'providerId is required.' });
    const p = await prisma.user.findUnique({ where: { id }, select: { acceptingOrders: true } });
    res.json({ acceptingOrders: p?.acceptingOrders !== false });
  } catch (error) {
    console.error('Get accepting-orders error:', error);
    res.status(500).json({ error: 'Failed to load setting.' });
  }
});

router.put('/accepting-orders', async (req, res) => {
  try {
    if (req.user.userType !== 'provider') return res.status(403).json({ error: 'Only a provider can change this.' });
    const acceptingOrders = req.body.acceptingOrders !== false;
    await prisma.user.update({ where: { id: req.user.id }, data: { acceptingOrders } });
    res.json({ message: acceptingOrders ? 'You are now accepting new orders.' : 'New orders paused.', acceptingOrders });
  } catch (error) {
    console.error('Set accepting-orders error:', error);
    res.status(500).json({ error: 'Failed to update setting.' });
  }
});

// ============================================================
// SERVICES — a provider owns, prices and publishes their own.
// Every query is scoped to req.user.id, so a provider can only ever read or
// mutate their own rows. Soft-deleted rows are excluded everywhere.
// ============================================================
const SERVICE_CATEGORIES = [
  'Wash & Fold', 'Dry Cleaning', 'Ironing', 'Express Wash', 'Blanket Cleaning',
  'Curtain Cleaning', 'Carpet Cleaning', 'Shoe Cleaning', 'Bag Cleaning',
  'Wedding Dress Cleaning', 'Corporate Laundry', 'Custom Service',
];
const PRICING_TYPES = ['per_kg', 'fixed', 'per_item'];
const SERVICE_STATUSES = ['available', 'unavailable', 'temporarily_closed', 'out_of_service'];

const dec = (v) => (v == null ? null : Number(v));

function shapeService(s) {
  const price = s.pricingType === 'per_kg' ? dec(s.pricePerKg)
    : s.pricingType === 'fixed' ? dec(s.fixedPrice)
      : dec(s.pricePerItem);
  const unit = s.pricingType === 'per_kg' ? '/kg' : s.pricingType === 'per_item' ? ' each' : '';
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
    pricingType: s.pricingType,
    pricePerKg: dec(s.pricePerKg),
    fixedPrice: dec(s.fixedPrice),
    pricePerItem: dec(s.pricePerItem),
    price,                       // the one that applies, for easy display
    priceUnit: unit,
    estimatedCompletionHours: s.estimatedCompletionHours,
    status: s.status,
    // Surfaced read-only: the provider can see a takedown and its reason, but
    // cannot clear it by toggling their own availability.
    hiddenByAdmin: s.hiddenByAdmin === true,
    hiddenReason: s.hiddenReason || null,
    isAvailable: s.status === 'available' && s.hiddenByAdmin !== true,
    coverImage: s.coverImage,
    images: Array.isArray(s.images)
      ? s.images.map((i) => ({ id: i.id, url: i.imageUrl, thumbnailUrl: i.thumbnailUrl, displayOrder: i.displayOrder, isCover: i.isCover }))
      : [],
    imageCount: Array.isArray(s.images) ? s.images.length : 0,
    orderCount: 0, // overwritten by the list endpoint, which counts per name
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// Validate + normalise a create/update payload. Returns { data } or { error }.
function buildServiceData(body, { partial = false } = {}) {
  const data = {};

  if (body.name !== undefined || !partial) {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'Service name is required.' };
    if (name.length > 120) return { error: 'Service name is too long (max 120).' };
    data.name = name;
  }
  if (body.description !== undefined) {
    data.description = body.description ? String(body.description).trim() : null;
  }
  if (body.category !== undefined || !partial) {
    const cat = String(body.category || 'Custom Service').trim();
    data.category = SERVICE_CATEGORIES.includes(cat) ? cat : 'Custom Service';
  }
  if (body.status !== undefined) {
    if (!SERVICE_STATUSES.includes(body.status)) return { error: 'Invalid status.' };
    data.status = body.status;
  }
  if (body.estimatedCompletionHours !== undefined) {
    if (body.estimatedCompletionHours === null || body.estimatedCompletionHours === '') {
      data.estimatedCompletionHours = null;
    } else {
      const h = parseInt(body.estimatedCompletionHours, 10);
      if (isNaN(h) || h < 1 || h > 720) return { error: 'Processing time must be between 1 and 720 hours.' };
      data.estimatedCompletionHours = h;
    }
  }

  // Pricing: exactly one column is populated, the others cleared, so a service
  // can never carry a stale price from a previous pricing type.
  const typeGiven = body.pricingType !== undefined;
  if (typeGiven || !partial) {
    const t = String(body.pricingType || 'per_kg');
    if (!PRICING_TYPES.includes(t)) return { error: 'Invalid pricing type.' };
    data.pricingType = t;
  }
  const effectiveType = data.pricingType;
  const priceRaw = body.price !== undefined ? body.price
    : effectiveType === 'per_kg' ? body.pricePerKg
      : effectiveType === 'fixed' ? body.fixedPrice
        : body.pricePerItem;

  if (effectiveType && (priceRaw !== undefined || !partial)) {
    const p = parseFloat(priceRaw);
    if (isNaN(p) || p <= 0) return { error: 'Price must be greater than 0.' };
    if (p > 100000) return { error: 'Price is unrealistically high.' };
    data.pricePerKg = effectiveType === 'per_kg' ? p : null;
    data.fixedPrice = effectiveType === 'fixed' ? p : null;
    data.pricePerItem = effectiveType === 'per_item' ? p : null;
  }

  return { data };
}

router.get('/service-categories', (req, res) => {
  res.json({ categories: SERVICE_CATEGORIES, pricingTypes: PRICING_TYPES, statuses: SERVICE_STATUSES });
});

// List the caller's own services.
router.get('/services', async (req, res) => {
  try {
    const rows = await prisma.laundryService.findMany({
      where: { providerId: req.user.id, deletedAt: null },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { images: { orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] } },
    });
    // Orders reference a service by NAME (LaundryRequest.laundryType is a plain
    // string with no FK), so count this provider's orders grouped by that name.
    const grouped = await prisma.laundryRequest.groupBy({
      by: ['laundryType'],
      where: { providerId: req.user.id },
      _count: { _all: true },
    });
    const counts = new Map(grouped.map((g) => [g.laundryType, g._count._all]));
    res.json({
      count: rows.length,
      services: rows.map((s) => ({ ...shapeService(s), orderCount: counts.get(s.name) || 0 })),
    });
  } catch (error) {
    console.error('List services error:', error);
    res.status(500).json({ error: 'Failed to load services.' });
  }
});

router.post('/services', async (req, res) => {
  try {
    const { data, error } = buildServiceData(req.body);
    if (error) return res.status(400).json({ error });

    const created = await prisma.laundryService.create({
      data: { ...data, providerId: req.user.id },
    });
    await cacheDel(KEYS.activeProviders).catch(() => {});
    res.status(201).json({ message: 'Service created.', service: shapeService(created) });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ error: 'Failed to create service.' });
  }
});

router.patch('/services/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.laundryService.findFirst({
      where: { id, providerId: req.user.id, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Service not found.' });

    // Merge the stored pricing type so a price-only edit stays consistent.
    const body = { ...req.body };
    if (body.pricingType === undefined && (body.price !== undefined)) body.pricingType = existing.pricingType;

    const { data, error } = buildServiceData(body, { partial: true });
    if (error) return res.status(400).json({ error });
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No valid fields to update.' });

    const updated = await prisma.laundryService.update({ where: { id }, data });
    await cacheDel(KEYS.activeProviders).catch(() => {});
    res.json({ message: 'Service updated.', service: shapeService(updated) });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ error: 'Failed to update service.' });
  }
});

// Soft delete — stops future bookings, never touches order history.
router.delete('/services/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = await prisma.laundryService.findFirst({
      where: { id, providerId: req.user.id, deletedAt: null },
    });
    if (!existing) return res.status(404).json({ error: 'Service not found.' });

    await prisma.laundryService.update({ where: { id }, data: { deletedAt: new Date() } });
    await cacheDel(KEYS.activeProviders).catch(() => {});
    res.json({ message: 'Service removed. Existing orders are unaffected.' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ error: 'Failed to delete service.' });
  }
});

// ============================================================
// SERVICE IMAGES — up to MAX_IMAGES per service, stored on Cloudinary.
// ============================================================
const MAX_IMAGES = 10;

// Confirms the service belongs to the caller. Returns null when it doesn't, so
// a provider can never touch another provider's images.
async function findOwnedService(req, serviceId) {
  const id = parseInt(serviceId, 10);
  if (isNaN(id)) return null;
  return prisma.laundryService.findFirst({
    where: { id, providerId: req.user.id, deletedAt: null },
  });
}

function shapeImage(img) {
  return {
    id: img.id,
    url: img.imageUrl,
    thumbnailUrl: img.thumbnailUrl,
    displayOrder: img.displayOrder,
    isCover: img.isCover,
    createdAt: img.createdAt,
  };
}

// Keep the parent service's coverImage in step with whichever image is flagged.
async function syncCover(serviceId) {
  const images = await prisma.laundryServiceImage.findMany({
    where: { serviceId },
    orderBy: [{ isCover: 'desc' }, { displayOrder: 'asc' }],
  });
  const cover = images.find((i) => i.isCover) || images[0] || null;
  await prisma.laundryService.update({
    where: { id: serviceId },
    data: { coverImage: cover ? cover.imageUrl : null },
  });
  return cover;
}

// Short-lived credentials so the phone can upload straight to Cloudinary.
router.post('/services/:id/images/signature', async (req, res) => {
  try {
    // Ownership first: a caller who doesn't own the service should never learn
    // anything about server configuration.
    const service = await findOwnedService(req, req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found.' });
    if (!cloudinary.isConfigured()) {
      return res.status(503).json({ error: 'Image uploads are not configured yet.' });
    }

    const count = await prisma.laundryServiceImage.count({ where: { serviceId: service.id } });
    if (count >= MAX_IMAGES) {
      return res.status(400).json({ error: `A service can have at most ${MAX_IMAGES} images.` });
    }
    res.json({ ...cloudinary.buildUploadSignature(), remaining: MAX_IMAGES - count });
  } catch (error) {
    console.error('Image signature error:', error);
    res.status(500).json({ error: 'Failed to prepare upload.' });
  }
});

// Record an image the client just uploaded to Cloudinary.
router.post('/services/:id/images', async (req, res) => {
  try {
    const service = await findOwnedService(req, req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found.' });

    const publicId = String(req.body.publicId || '').trim();
    if (!publicId) return res.status(400).json({ error: 'publicId is required.' });

    const count = await prisma.laundryServiceImage.count({ where: { serviceId: service.id } });
    if (count >= MAX_IMAGES) {
      return res.status(400).json({ error: `A service can have at most ${MAX_IMAGES} images.` });
    }

    const created = await prisma.laundryServiceImage.create({
      data: {
        serviceId: service.id,
        providerId: req.user.id,
        publicId,
        imageUrl: cloudinary.imageUrl(publicId),
        thumbnailUrl: cloudinary.thumbnailUrl(publicId),
        displayOrder: count,
        isCover: count === 0, // first image becomes the cover
      },
    });
    await syncCover(service.id);
    await cacheDel(KEYS.activeProviders).catch(() => {});
    res.status(201).json({ message: 'Image added.', image: shapeImage(created) });
  } catch (error) {
    console.error('Add image error:', error);
    res.status(500).json({ error: 'Failed to save image.' });
  }
});

router.get('/services/:id/images', async (req, res) => {
  try {
    const service = await findOwnedService(req, req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found.' });
    const images = await prisma.laundryServiceImage.findMany({
      where: { serviceId: service.id },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
    res.json({ count: images.length, max: MAX_IMAGES, images: images.map(shapeImage) });
  } catch (error) {
    console.error('List images error:', error);
    res.status(500).json({ error: 'Failed to load images.' });
  }
});

// Set the cover, or reorder the gallery.
router.patch('/services/:id/images', async (req, res) => {
  try {
    const service = await findOwnedService(req, req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found.' });

    const { coverImageId, order } = req.body;

    if (coverImageId != null) {
      const target = await prisma.laundryServiceImage.findFirst({
        where: { id: parseInt(coverImageId, 10), serviceId: service.id },
      });
      if (!target) return res.status(404).json({ error: 'Image not found.' });
      await prisma.laundryServiceImage.updateMany({ where: { serviceId: service.id }, data: { isCover: false } });
      await prisma.laundryServiceImage.update({ where: { id: target.id }, data: { isCover: true } });
    }

    if (Array.isArray(order) && order.length) {
      // Only reorder ids that actually belong to this service.
      const owned = await prisma.laundryServiceImage.findMany({
        where: { serviceId: service.id }, select: { id: true },
      });
      const ownedIds = new Set(owned.map((o) => o.id));
      await Promise.all(
        order
          .map((id, idx) => ({ id: parseInt(id, 10), idx }))
          .filter(({ id }) => ownedIds.has(id))
          .map(({ id, idx }) => prisma.laundryServiceImage.update({ where: { id }, data: { displayOrder: idx } })),
      );
    }

    await syncCover(service.id);
    const images = await prisma.laundryServiceImage.findMany({
      where: { serviceId: service.id },
      orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
    });
    await cacheDel(KEYS.activeProviders).catch(() => {});
    res.json({ images: images.map(shapeImage) });
  } catch (error) {
    console.error('Update images error:', error);
    res.status(500).json({ error: 'Failed to update images.' });
  }
});

router.delete('/services/:id/images/:imageId', async (req, res) => {
  try {
    const service = await findOwnedService(req, req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found.' });

    const img = await prisma.laundryServiceImage.findFirst({
      where: { id: parseInt(req.params.imageId, 10), serviceId: service.id },
    });
    if (!img) return res.status(404).json({ error: 'Image not found.' });

    // Best-effort: the row is removed either way, otherwise a Cloudinary outage
    // would strand the image in the provider's gallery forever. Log failures so
    // an orphaned asset is at least diagnosable.
    const destroyed = await cloudinary.destroy(img.publicId);
    if (!destroyed.ok) {
      console.warn(`[images] Cloudinary destroy failed for ${img.publicId}:`, destroyed.result || destroyed.reason);
    }
    await prisma.laundryServiceImage.delete({ where: { id: img.id } });
    await syncCover(service.id);
    await cacheDel(KEYS.activeProviders).catch(() => {});
    res.json({ message: 'Image removed.' });
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ error: 'Failed to delete image.' });
  }
});

// Provider may only act on orders routed to them (admins bypass).
async function assertProviderOwnsOrder(req, orderId) {
  if (req.user.userType !== 'provider') return;
  const o = await prisma.laundryRequest.findUnique({ where: { id: orderId }, select: { providerId: true } });
  if (!o) throw new TransitionError('NOT_FOUND', 'Order not found.', 404);
  if (o.providerId !== req.user.id) throw new TransitionError('FORBIDDEN', 'This order is not assigned to your laundromat.', 403);
}

function sendTransitionError(res, error, fallback) {
  if (error instanceof TransitionError) return res.status(error.status).json({ error: error.message, code: error.code });
  console.error(fallback, error);
  return res.status(500).json({ error: fallback });
}

module.exports = router;
