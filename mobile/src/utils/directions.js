import Constants from 'expo-constants';

const GOOGLE_MAPS_API_KEY =
  Constants.expoConfig?.extra?.googleMapsApiKey ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  '';

export async function fetchDirections(origin, destination) {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
    return getFallbackRoute(origin, destination);
  }

  try {
    const url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      `&mode=driving` +
      `&key=${GOOGLE_MAPS_API_KEY}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.routes.length) {
      return getFallbackRoute(origin, destination);
    }

    const route = data.routes[0];
    const leg = route.legs[0];

    return {
      coordinates: decodePolyline(route.overview_polyline.points),
      distance: leg.distance.text,
      distanceValue: leg.distance.value,
      duration: leg.duration.text,
      durationValue: leg.duration.value,
    };
  } catch (error) {
    console.error('Directions API error:', error);
    return getFallbackRoute(origin, destination);
  }
}

/**
 * Build one continuous route from the rider through an ORDERED list of stops.
 * Uses the Google Directions API (traffic-aware via departure_time=now) when a
 * key is configured; otherwise returns straight-line segments + an estimate.
 * Returns { coordinates, distanceText, durationText, distanceValue, durationValue, fallback }.
 */
export async function fetchRoute(origin, stops) {
  if (!origin || !Array.isArray(stops) || stops.length === 0) return null;

  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') {
    return straightLineRoute(origin, stops);
  }

  try {
    const destination = stops[stops.length - 1];
    const waypoints = stops.slice(0, -1);
    let url =
      `https://maps.googleapis.com/maps/api/directions/json` +
      `?origin=${origin.latitude},${origin.longitude}` +
      `&destination=${destination.latitude},${destination.longitude}` +
      `&mode=driving&departure_time=now&key=${GOOGLE_MAPS_API_KEY}`;
    if (waypoints.length) {
      url += `&waypoints=` + waypoints.map((w) => `${w.latitude},${w.longitude}`).join('|');
    }

    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.routes.length) return straightLineRoute(origin, stops);

    const route = data.routes[0];
    let distVal = 0;
    let durVal = 0;
    (route.legs || []).forEach((leg) => {
      distVal += leg.distance?.value || 0;
      durVal += (leg.duration_in_traffic?.value || leg.duration?.value || 0);
    });
    const km = distVal / 1000;
    const min = Math.round(durVal / 60);
    return {
      coordinates: decodePolyline(route.overview_polyline.points),
      distanceText: km < 1 ? `${Math.round(distVal)} m` : `${km.toFixed(1)} km`,
      distanceValue: distVal,
      durationText: `${min} min`,
      durationValue: durVal,
      fallback: false,
    };
  } catch (error) {
    return straightLineRoute(origin, stops);
  }
}

function straightLineRoute(origin, stops) {
  const coordinates = [origin, ...stops];
  let km = 0;
  let prev = origin;
  for (const s of stops) {
    const R = 6371;
    const dLat = toRad(s.latitude - prev.latitude);
    const dLon = toRad(s.longitude - prev.longitude);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(prev.latitude)) * Math.cos(toRad(s.latitude)) * Math.sin(dLon / 2) ** 2;
    km += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    prev = s;
  }
  const min = Math.max(5, Math.round(km * 3));
  return {
    coordinates,
    distanceText: km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`,
    distanceValue: Math.round(km * 1000),
    durationText: `~${min} min`,
    durationValue: min * 60,
    fallback: true,
  };
}

function getFallbackRoute(origin, destination) {
  const R = 6371;
  const dLat = toRad(destination.latitude - origin.latitude);
  const dLon = toRad(destination.longitude - origin.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(origin.latitude)) * Math.cos(toRad(destination.latitude)) *
    Math.sin(dLon / 2) ** 2;
  const straightLineKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const estimatedKm = straightLineKm * 1.3;
  const estimatedMinutes = Math.max(3, Math.round(estimatedKm * 2));

  return {
    coordinates: [origin, destination],
    distance: estimatedKm < 1 ? `${Math.round(estimatedKm * 1000)} m` : `${estimatedKm.toFixed(1)} km`,
    distanceValue: Math.round(estimatedKm * 1000),
    duration: `~${estimatedMinutes} min`,
    durationValue: estimatedMinutes * 60,
  };
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b, shift, result;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}
