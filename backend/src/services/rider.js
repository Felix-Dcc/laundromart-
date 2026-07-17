// ============================================================
// Rider geo helper.
//
// The old auto-dispatch / RiderAssignment-status functions (assignOrderToRider,
// acceptPickupRequest, markPickupCompleted, markDeliveredToLaundry, …) were an
// abandoned parallel status system and have been removed. All order status
// changes now flow through services/orderService.js. Only the distance helper
// remains — it is used for sorting available pickups/deliveries.
// ============================================================

// Haversine distance between two coordinates, in kilometers.
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = { calculateDistance };
