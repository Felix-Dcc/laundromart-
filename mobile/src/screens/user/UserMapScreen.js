import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Linking, Platform, Animated, Dimensions,
} from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { nearbyAPI } from '../../api/client';
import StarRating from '../../components/StarRating';
import FavoriteHeart from '../../components/FavoriteHeart';
import { isOpenNow } from '../../components/MapMarkerCallout';
import { haversineKm, formatDistance } from '../../utils/location';
import { subscribeToLaundromatUpdates } from '../../services/realtime';
import { useFavorites } from '../../context/FavoritesContext';
import colors from '../../theme/colors';
import AvatarComp from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { SkeletonCard } from '../../components/Skeleton';
import { providerLogo } from '../../theme/images';

const { width } = Dimensions.get('window');
const NEARBY_RADIUS_KM = 10;
const RADIUS_OPTIONS = [5, 10, 20, 50];

const MemoizedMarker = React.memo(function LaundryMarker({ provider, isNearby, isSelected, isFav, onPress }) {
  // Selected marker = highlighted neon storefront pin (single, perf is fine).
  if (isSelected) {
    return (
      <Marker
        coordinate={{ latitude: provider.latitude, longitude: provider.longitude }}
        onPress={() => onPress(provider)}
        anchor={{ x: 0.5, y: 0.5 }}
        zIndex={999}
      >
        <View style={markerStyles.selectedOuter}>
          <View style={markerStyles.selectedInner}>
            <Ionicons name="storefront" size={16} color="#04150d" />
          </View>
        </View>
      </Marker>
    );
  }
  // Favorite marker = gold pin with a heart badge (kept above normal pins).
  if (isFav) {
    return (
      <Marker
        coordinate={{ latitude: provider.latitude, longitude: provider.longitude }}
        onPress={() => onPress(provider)}
        anchor={{ x: 0.5, y: 0.5 }}
        zIndex={500}
      >
        <View style={markerStyles.favOuter}>
          <View style={markerStyles.favInner}>
            <Ionicons name="star" size={15} color="#7c4a03" />
          </View>
          <View style={markerStyles.favBadge}>
            <Ionicons name="heart" size={9} color="#fff" />
          </View>
        </View>
      </Marker>
    );
  }
  // Non-selected, non-favorite = cheap native colored pin.
  return (
    <Marker
      coordinate={{ latitude: provider.latitude, longitude: provider.longitude }}
      pinColor={isNearby ? '#3b82f6' : '#9ca3af'}
      onPress={() => onPress(provider)}
      tracksViewChanges={false}
    />
  );
}, (prev, next) => {
  return (
    prev.provider.id === next.provider.id &&
    prev.provider.latitude === next.provider.latitude &&
    prev.provider.longitude === next.provider.longitude &&
    prev.provider.avgRating === next.provider.avgRating &&
    prev.provider.businessName === next.provider.businessName &&
    prev.isNearby === next.isNearby &&
    prev.isSelected === next.isSelected &&
    prev.isFav === next.isFav
  );
});

const markerStyles = StyleSheet.create({
  selectedOuter: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(16,185,129,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  selectedInner: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#10b981',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#fff',
    shadowColor: '#10b981', shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  favOuter: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(251,191,36,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  favInner: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#fbbf24',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#f59e0b', shadowOpacity: 0.6, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  favBadge: {
    position: 'absolute', top: -2, right: -2,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
});

export default function UserMapScreen({ navigation }) {
  const [viewMode, setViewMode] = useState('map');
  const [location, setLocation] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [permDenied, setPermDenied] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [radius, setRadius] = useState(20);
  const mapRef = useRef(null);
  const { isFavorite, getCount, toggleFavorite, favoriteIds } = useFavorites();

  useEffect(() => { requestLocation(); }, []);
  useEffect(() => { if (location) fetchLaundromats(); }, [location, radius]);

  // Real-time laundromat updates
  useEffect(() => {
    const unsub = subscribeToLaundromatUpdates((data) => {
      const { action, provider: updated } = data;
      if (!updated) return;

      setProviders((prev) => {
        if (action === 'deleted') {
          return prev.filter((p) => p.id !== updated.id);
        }
        if (action === 'added') {
          const exists = prev.find((p) => p.id === updated.id);
          if (exists) return prev;
          const enriched = enrichProvider(updated, location);
          return [...prev, enriched];
        }
        if (action === 'updated') {
          return prev.map((p) => {
            if (p.id !== updated.id) return p;
            return { ...p, ...enrichProvider(updated, location) };
          });
        }
        return prev;
      });
    });

    return () => unsub();
  }, [location]);

  function enrichProvider(p, userLoc) {
    const distanceKm = userLoc
      ? Math.round(haversineKm(userLoc.latitude, userLoc.longitude, p.latitude, p.longitude) * 100) / 100
      : null;
    return {
      ...p,
      businessName: p.businessName || `Provider #${p.id}`,
      businessHours: p.businessHours || '9:00 AM – 6:00 PM',
      avgRating: p.avgRating || 0,
      reviewCount: p.reviewCount || 0,
      distanceKm,
      estimatedPickupMin: distanceKm != null ? Math.max(10, Math.round(distanceKm * 3)) : null,
    };
  }

  async function requestLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermDenied(true);
        setLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
    } catch (error) {
      console.error('Location error:', error);
      setPermDenied(true);
      setLoading(false);
    }
  }

  async function fetchLaundromats() {
    setLoading(true);
    try {
      const res = await nearbyAPI.getAllLaundromats(
        location.latitude,
        location.longitude,
      );
      setProviders(res.data.providers || []);
    } catch (error) {
      console.error('Fetch laundromats error:', error);
      Alert.alert('Error', 'Failed to load laundromats.');
    } finally {
      setLoading(false);
    }
  }

  const filteredProviders = useMemo(
    () => providers.filter((p) => p.distanceKm == null || p.distanceKm <= radius),
    [providers, radius],
  );

  // Ordering: favorites first, then nearby, then everyone else (each by distance).
  const orderedProviders = useMemo(() => {
    const rank = (p) => {
      if (favoriteIds.has(p.id)) return 0;
      if (p.distanceKm != null && p.distanceKm <= NEARBY_RADIUS_KM) return 1;
      return 2;
    };
    return [...filteredProviders].sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9);
    });
  }, [filteredProviders, favoriteIds]);

  const nearbyProviders = useMemo(
    () => providers.filter((p) => p.distanceKm != null && p.distanceKm <= NEARBY_RADIUS_KM),
    [providers],
  );

  const handleMarkerPress = useCallback((provider) => {
    setSelectedProvider(provider);
    // Slightly zoom to the tapped laundromat while keeping neighbors visible.
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: provider.latitude,
        longitude: provider.longitude,
        latitudeDelta: 0.025,
        longitudeDelta: 0.025,
      }, 450);
    }
  }, []);

  const focusOnProvider = useCallback((provider) => {
    setSelectedProvider(provider);
    if (viewMode === 'map' && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: provider.latitude,
        longitude: provider.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 500);
    }
  }, [viewMode]);

  const fitAllMarkers = useCallback(() => {
    if (!mapRef.current || !filteredProviders.length) return;
    const coords = filteredProviders.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
    }));
    if (location) coords.push(location);
    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 80, right: 60, bottom: 120, left: 60 },
      animated: true,
    });
  }, [filteredProviders, location]);

  const centerOnUser = useCallback(() => {
    if (!mapRef.current || !location) return;
    mapRef.current.animateToRegion({
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 500);
  }, [location]);

  if (permDenied) {
    return (
      <View style={styles.centerContainer}>
        <View style={styles.permCard}>
          <View style={styles.permIconWrap}>
            <Ionicons name="location-outline" size={48} color="#ef4444" />
          </View>
          <Text style={styles.permTitle}>Location Required</Text>
          <Text style={styles.permDesc}>
            We need your location to find laundromats near you and show them on the map.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={() => Linking.openSettings()}>
            <Ionicons name="settings-outline" size={18} color="#fff" />
            <Text style={styles.permBtnText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => { setPermDenied(false); setLoading(true); requestLocation(); }}
          >
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Toggle bar */}
      <View style={styles.toggleBar}>
        <View style={styles.toggleGroup}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
            onPress={() => setViewMode('map')}
          >
            <Ionicons name="map" size={16} color={viewMode === 'map' ? '#fff' : '#6b7280'} />
            <Text style={[styles.toggleText, viewMode === 'map' && styles.toggleTextActive]}>Map</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
            onPress={() => setViewMode('list')}
          >
            <Ionicons name="list" size={16} color={viewMode === 'list' ? '#fff' : '#6b7280'} />
            <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>List</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={fetchLaundromats} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Radius selector */}
      <View style={styles.radiusRow}>
        <Text style={styles.radiusLabel}>Radius:</Text>
        {RADIUS_OPTIONS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.radiusChip, radius === r && styles.radiusChipActive]}
            onPress={() => setRadius(r)}
          >
            <Text style={[styles.radiusChipText, radius === r && styles.radiusChipTextActive]}>
              {r} km
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <Text style={styles.statsText}>
          {filteredProviders.length} laundromat{filteredProviders.length !== 1 ? 's' : ''}
          {nearbyProviders.length > 0 && ` · ${nearbyProviders.length} nearby`}
        </Text>
        {viewMode === 'map' && (
          <TouchableOpacity onPress={fitAllMarkers} style={styles.fitBtn}>
            <Ionicons name="expand-outline" size={16} color="#3b82f6" />
            <Text style={styles.fitBtnText}>Fit All</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={{ flex: 1, paddingTop: 8 }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : viewMode === 'map' ? (
        <View style={styles.mapContainer}>
          {location && (
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              initialRegion={{
                latitude: location.latitude,
                longitude: location.longitude,
                latitudeDelta: 0.08,
                longitudeDelta: 0.08,
              }}
              showsUserLocation
              showsMyLocationButton={false}
              showsCompass
              showsScale
              zoomEnabled
              zoomControlEnabled={Platform.OS === 'android'}
              rotateEnabled
              onMapReady={fitAllMarkers}
            >
              {/* Nearby radius circle */}
              <Circle
                center={location}
                radius={NEARBY_RADIUS_KM * 1000}
                strokeColor="rgba(59, 130, 246, 0.3)"
                fillColor="rgba(59, 130, 246, 0.05)"
                strokeWidth={1}
              />

              {orderedProviders.map((provider) => {
                const isNearby = provider.distanceKm != null && provider.distanceKm <= NEARBY_RADIUS_KM;
                return (
                  <MemoizedMarker
                    key={provider.id}
                    provider={provider}
                    isNearby={isNearby}
                    isSelected={selectedProvider?.id === provider.id}
                    isFav={favoriteIds.has(provider.id)}
                    onPress={handleMarkerPress}
                  />
                );
              })}
            </MapView>
          )}

          {/* My location button */}
          <TouchableOpacity style={styles.myLocationBtn} onPress={centerOnUser}>
            <Ionicons name="locate" size={22} color="#3b82f6" />
          </TouchableOpacity>

          {/* Bottom card for selected provider */}
          {selectedProvider && (
            <SelectedProviderCard
              provider={selectedProvider}
              isFavorite={isFavorite(selectedProvider.id)}
              favoriteCount={getCount(selectedProvider)}
              onToggleFavorite={() => toggleFavorite(selectedProvider)}
              onClose={() => setSelectedProvider(null)}
              onViewLaundry={() => {
                navigation.navigate('NearbyList', { providerId: selectedProvider.id });
              }}
              onNewRequest={() => {
                // Cross-tab nav to the order form, carrying the full laundromat.
                navigation.navigate('Orders', {
                  screen: 'NewRequest',
                  params: { provider: selectedProvider },
                });
              }}
            />
          )}
        </View>
      ) : (
        /* List view */
        <FlatList
          data={orderedProviders}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item, index }) => (
            <ProviderListCard
              item={item}
              index={index}
              isNearby={item.distanceKm != null && item.distanceKm <= NEARBY_RADIUS_KM}
              isFav={favoriteIds.has(item.id)}
              onToggleFavorite={() => toggleFavorite(item)}
              onPress={() => {
                setSelectedProvider(item);
                setViewMode('map');
                setTimeout(() => focusOnProvider(item), 300);
              }}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="storefront-outline"
              title="No laundromats found"
              subtitle="Try increasing the search radius to find more laundromats."
              tint="#3b82f6"
            />
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

function SelectedProviderCard({ provider, isFavorite, favoriteCount, onToggleFavorite, onClose, onViewLaundry, onNewRequest }) {
  const openStatus = isOpenNow(provider.businessHours);
  const initial = (provider.businessName || '?').trim().charAt(0).toUpperCase();

  // Subtle slide-up entrance for the sheet.
  const slide = useRef(new Animated.Value(60)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, tension: 90, friction: 12 }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.sheetWrap, { opacity: fade, transform: [{ translateY: slide }] }]}>
      <BlurView intensity={45} tint="dark" style={styles.sheet}>
        <LinearGradient
          colors={['rgba(21,21,32,0.90)', 'rgba(10,10,15,0.95)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Favorite heart (top-left of close) + close */}
        <View style={styles.sheetTopRight}>
          <FavoriteHeart active={isFavorite} onToggle={onToggleFavorite} size={22} />
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={20} color={colors.text.tertiary} />
          </TouchableOpacity>
        </View>

        {/* Header: logo/avatar + name + open/closed */}
        <View style={styles.sheetHeader}>
          <AvatarComp name={provider.businessName} uri={providerLogo(provider.id)} size={48} style={{ borderRadius: 16 }} />

          <View style={{ flex: 1, paddingRight: 56 }}>
            <View style={styles.nameVerifiedRow}>
              <Text style={[styles.sheetName, { flexShrink: 1 }]} numberOfLines={1}>{provider.businessName}</Text>
              {provider.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={13} color="#38bdf8" />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              )}
            </View>
            <StarRating rating={provider.avgRating || 0} size={13} showLabel count={provider.reviewCount} />
            {favoriteCount > 0 && (
              <View style={styles.favCountRow}>
                <Ionicons name="heart" size={11} color="#ef4444" />
                <Text style={styles.favCountText}>
                  {favoriteCount} {favoriteCount === 1 ? 'user' : 'users'} favorited this
                </Text>
              </View>
            )}
          </View>

          {openStatus !== null && (
            <View style={[styles.openBadge, { backgroundColor: openStatus ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)' }]}>
              <View style={[styles.openDot, { backgroundColor: openStatus ? '#34d399' : '#f87171' }]} />
              <Text style={[styles.openText, { color: openStatus ? '#6ee7b7' : '#fca5a5' }]}>
                {openStatus ? 'Open' : 'Closed'}
              </Text>
            </View>
          )}
        </View>

        {/* Info chips: distance · pickup ETA · hours */}
        <View style={styles.sheetInfo}>
          {provider.distanceKm != null && (
            <View style={styles.sheetChip}>
              <Ionicons name="location-sharp" size={13} color="#7cc8ff" />
              <Text style={styles.sheetChipText}>{formatDistance(provider.distanceKm)}</Text>
            </View>
          )}
          {provider.estimatedPickupMin != null && (
            <View style={styles.sheetChip}>
              <Ionicons name="bicycle-outline" size={13} color="#c4b5fd" />
              <Text style={styles.sheetChipText}>~{provider.estimatedPickupMin} min</Text>
            </View>
          )}
          <View style={styles.sheetChip}>
            <Ionicons name="time-outline" size={13} color={colors.text.tertiary} />
            <Text style={styles.sheetChipText}>{provider.businessHours}</Text>
          </View>
          {provider.deliveryAvailable === true && (
            <View style={styles.sheetChip}>
              <Ionicons name="cube-outline" size={13} color="#34d399" />
              <Text style={[styles.sheetChipText, { color: '#6ee7b7' }]}>Delivers to you</Text>
            </View>
          )}
        </View>

        {/* Services */}
        {provider.services && provider.services.length > 0 && (
          <View style={styles.servicesSection}>
            <Text style={styles.servicesLabel}>Available Services</Text>
            <View style={styles.servicesChipRow}>
              {provider.services.map((svc) => (
                <View key={svc} style={styles.serviceChip}>
                  <Text style={styles.serviceChipText}>{svc}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Address */}
        <View style={styles.addressRow}>
          <Ionicons name="navigate-circle-outline" size={15} color={colors.text.muted} />
          <Text style={styles.sheetAddress} numberOfLines={2}>{provider.address}</Text>
        </View>

        {/* Secondary actions */}
        <View style={styles.secondaryActions}>
          <TouchableOpacity style={styles.secBtn} onPress={() => Linking.openURL(`tel:${provider.phone}`)} activeOpacity={0.8}>
            <Ionicons name="call" size={17} color="#34d399" />
            <Text style={styles.secText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secBtn}
            activeOpacity={0.8}
            onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${provider.latitude},${provider.longitude}`)}
          >
            <Ionicons name="navigate" size={17} color="#7cc8ff" />
            <Text style={styles.secText}>Directions</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secBtn} onPress={onViewLaundry} activeOpacity={0.8}>
            <Ionicons name="storefront-outline" size={17} color="#c4b5fd" />
            <Text style={styles.secText}>View</Text>
          </TouchableOpacity>
        </View>

        {/* Primary CTA: New Request */}
        <NewRequestButton onPress={onNewRequest} />
      </BlurView>
    </Animated.View>
  );
}

// Primary call-to-action with a subtle press-scale animation.
function NewRequestButton({ onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, tension: 300, friction: 18 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 300, friction: 18 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], marginTop: 12 }}>
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} onPressIn={pressIn} onPressOut={pressOut}>
        <LinearGradient
          colors={['#34d399', '#10b981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.newReqBtn}
        >
          <View style={styles.newReqIconWrap}>
            <Ionicons name="basket" size={16} color="#04150d" />
            <Ionicons name="add" size={12} color="#04150d" style={styles.newReqPlus} />
          </View>
          <Text style={styles.newReqText}>New Request</Text>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

function ProviderListCard({ item, index, isNearby, isFav, onToggleFavorite, onPress }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const openStatus = isOpenNow(item.businessHours);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      delay: index * 60,
      useNativeDriver: true,
    }).start();
  }, []);

  const rankColors = ['#f59e0b', '#6b7280', '#b45309'];
  const rankColor = index < 3 ? rankColors[index] : '#d1d5db';

  return (
    <Animated.View style={{
      opacity: fadeAnim,
      transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
    }}>
      <TouchableOpacity style={[styles.listCard, isFav && styles.listCardFav]} onPress={onPress} activeOpacity={0.7}>
        <View style={styles.listCardTop}>
          <View style={styles.listCardLeft}>
            <AvatarComp name={item.businessName} uri={providerLogo(item.id)} size={44} />
            <View style={{ flex: 1 }}>
              <View style={styles.nameRow}>
                <Text style={styles.businessName} numberOfLines={1}>{item.businessName}</Text>
                {item.isVerified && (
                  <Ionicons name="checkmark-circle" size={14} color="#0ea5e9" />
                )}
                {isNearby && (
                  <View style={styles.nearbyBadge}>
                    <Text style={styles.nearbyBadgeText}>Nearby</Text>
                  </View>
                )}
                {openStatus !== null && (
                  <View style={[styles.listOpenBadge, openStatus ? styles.openBadgeGreen : styles.openBadgeRed]}>
                    <Text style={[styles.listOpenText, { color: openStatus ? '#065f46' : '#991b1b' }]}>
                      {openStatus ? 'Open' : 'Closed'}
                    </Text>
                  </View>
                )}
              </View>
              <StarRating rating={item.avgRating || 0} size={13} showLabel count={item.reviewCount} />
            </View>
          </View>
          <View style={styles.listCardRight}>
            <FavoriteHeart active={isFav} onToggle={onToggleFavorite} size={20} />
            {item.distanceKm != null && (
              <View style={styles.distancePill}>
                <Ionicons name="location-sharp" size={12} color="#3b82f6" />
                <Text style={styles.distanceText}>{item.distanceKm} km</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.chipRow}>
          {item.estimatedPickupMin != null && (
            <View style={styles.infoChip}>
              <Ionicons name="bicycle-outline" size={14} color="#8b5cf6" />
              <Text style={styles.chipText}>~{item.estimatedPickupMin} min pickup</Text>
            </View>
          )}
          <View style={styles.infoChip}>
            <Ionicons name="time-outline" size={14} color="#10b981" />
            <Text style={styles.chipText}>{item.businessHours}</Text>
          </View>
          {item.deliveryAvailable === true && (
            <View style={styles.infoChip}>
              <Ionicons name="cube-outline" size={14} color="#059669" />
              <Text style={[styles.chipText, { color: '#047857', fontWeight: '600' }]}>Delivers to you</Text>
            </View>
          )}
        </View>
        {item.services && item.services.length > 0 && (
          <View style={styles.chipRow}>
            {item.services.slice(0, 3).map((svc) => (
              <View key={svc} style={styles.serviceChipSmall}>
                <Text style={styles.serviceChipSmallText}>{svc}</Text>
              </View>
            ))}
            {item.services.length > 3 && (
              <Text style={styles.moreServices}>+{item.services.length - 3} more</Text>
            )}
          </View>
        )}
        <View style={styles.listCardFooter}>
          <Ionicons name="location-outline" size={14} color="#9ca3af" />
          <Text style={styles.addressText} numberOfLines={1}>{item.address}</Text>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  centerContainer: { flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', padding: 24 },

  permCard: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center', width: '100%', elevation: 3, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  permIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  permTitle: { fontSize: 20, fontWeight: '800', color: '#1f2937', marginBottom: 8 },
  permDesc: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  permBtn: { flexDirection: 'row', backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', gap: 8 },
  permBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  retryBtn: { marginTop: 12, paddingVertical: 10 },
  retryBtnText: { color: '#3b82f6', fontSize: 14, fontWeight: '600' },

  // Toggle
  toggleBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  toggleGroup: { flexDirection: 'row', backgroundColor: '#e5e7eb', borderRadius: 10, padding: 3 },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 16, borderRadius: 8, gap: 5 },
  toggleBtnActive: { backgroundColor: '#3b82f6' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  toggleTextActive: { color: '#fff' },
  refreshBtn: { padding: 6 },

  // Radius
  radiusRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6, gap: 8 },
  radiusLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  radiusChip: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 20, paddingVertical: 4, paddingHorizontal: 12, backgroundColor: '#fff' },
  radiusChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  radiusChipText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  radiusChipTextActive: { color: '#fff' },

  // Stats
  statsBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 },
  statsText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  fitBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fitBtnText: { fontSize: 12, fontWeight: '600', color: '#3b82f6' },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#6b7280' },

  // Map
  mapContainer: { flex: 1 },
  map: { flex: 1 },

  // My location button
  myLocationBtn: {
    position: 'absolute', bottom: 16, right: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 5, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },

  // ── Glassmorphism bottom sheet ──
  sheetWrap: { position: 'absolute', bottom: 16, left: 12, right: 12 },
  sheet: {
    borderRadius: 24, overflow: 'hidden', padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 18,
  },
  sheetClose: { position: 'absolute', top: 12, right: 12, zIndex: 2, padding: 4 },
  sheetTopRight: { position: 'absolute', top: 12, right: 12, zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 14 },
  favCountRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  favCountText: { fontSize: 11, color: '#fca5a5', fontWeight: '600' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarInitialWrap: {
    position: 'absolute', bottom: -3, right: -3,
    backgroundColor: '#0a0a0f', borderRadius: 9, width: 18, height: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(120,200,255,0.5)',
  },
  avatarInitial: { color: '#7cc8ff', fontSize: 10, fontWeight: '800' },
  sheetName: { fontSize: 18, fontWeight: '800', color: colors.text.primary, marginBottom: 2 },
  nameVerifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(56,189,248,0.14)', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  verifiedText: { fontSize: 10, fontWeight: '700', color: '#7dd3fc' },

  sheetInfo: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14 },
  sheetChip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sheetChipText: { fontSize: 13, fontWeight: '600', color: colors.text.secondary },

  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12 },
  sheetAddress: { flex: 1, fontSize: 13, color: colors.text.tertiary, lineHeight: 18 },

  // Open/Closed badges
  openBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8, gap: 4 },
  openBadgeGreen: { backgroundColor: '#d1fae5' },   // light — list view
  openBadgeRed: { backgroundColor: '#fee2e2' },     // light — list view
  openDot: { width: 6, height: 6, borderRadius: 3 },
  openText: { fontSize: 11, fontWeight: '700' },

  // Services
  servicesSection: { marginTop: 14 },
  servicesLabel: { fontSize: 12, fontWeight: '700', color: colors.text.tertiary, marginBottom: 6, letterSpacing: 0.3 },
  servicesChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  serviceChip: { backgroundColor: 'rgba(120,200,255,0.12)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 9, borderWidth: 1, borderColor: 'rgba(120,200,255,0.25)' },
  serviceChipText: { fontSize: 11, color: '#bcdcff', fontWeight: '600' },

  // Secondary actions row
  secondaryActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  secBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  secText: { color: colors.text.secondary, fontSize: 13, fontWeight: '600' },

  // Primary CTA: New Request
  newReqBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 15,
    shadowColor: '#10b981', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  newReqIconWrap: { flexDirection: 'row', alignItems: 'flex-start' },
  newReqPlus: { marginLeft: -3, marginTop: -2 },
  newReqText: { color: '#04150d', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },

  // List
  emptyContainer: { alignItems: 'center', marginTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#9ca3af' },
  emptyDesc: { fontSize: 14, color: '#d1d5db' },

  listCard: {
    backgroundColor: '#fff', marginHorizontal: 16, marginTop: 10, borderRadius: 14, padding: 14,
    elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    borderWidth: 1.5, borderColor: 'transparent',
  },
  // Favorited cards subtly elevate with a warm border + stronger shadow.
  listCardFav: {
    borderColor: '#fde68a', backgroundColor: '#fffdf7',
    elevation: 5, shadowOpacity: 0.12, shadowRadius: 12,
  },
  listCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  listCardRight: { alignItems: 'flex-end', gap: 8 },
  listCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  nearbyBadge: { backgroundColor: '#dbeafe', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  nearbyBadgeText: { fontSize: 10, fontWeight: '700', color: '#3b82f6' },
  listOpenBadge: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  listOpenText: { fontSize: 9, fontWeight: '700' },
  rankBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  businessName: { fontSize: 15, fontWeight: '700', color: '#1f2937', flexShrink: 1 },
  distancePill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10, gap: 4 },
  distanceText: { fontSize: 13, fontWeight: '700', color: '#3b82f6' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, gap: 8 },
  infoChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, gap: 4 },
  chipText: { fontSize: 12, color: '#4b5563', fontWeight: '500' },
  serviceChipSmall: { backgroundColor: '#f0f9ff', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 6 },
  serviceChipSmallText: { fontSize: 10, color: '#1d4ed8', fontWeight: '500' },
  moreServices: { fontSize: 10, color: '#9ca3af', alignSelf: 'center' },
  listCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  addressText: { fontSize: 12, color: '#6b7280', flex: 1 },
});
