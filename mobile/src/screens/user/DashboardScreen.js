import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, FlatList, ImageBackground,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import { useFavorites } from '../../context/FavoritesContext';
import { userAPI } from '../../api/client';
import { formatCurrency, formatDate, formatStatus, getStatusColor } from '../../utils/helpers';
import { haversineKm, formatDistance } from '../../utils/location';
import { isOpenNow } from '../../components/MapMarkerCallout';
import FavoriteHeart from '../../components/FavoriteHeart';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { Skeleton, SkeletonCard } from '../../components/Skeleton';
import { IMAGES } from '../../theme/images';

const SERVICES = [
  { key: 'wash', label: 'Wash & Fold', icon: 'shirt-outline', colors: ['#60a5fa', '#2563eb'] },
  { key: 'dry', label: 'Dry Clean', icon: 'sparkles-outline', colors: ['#a78bfa', '#7c3aed'] },
  { key: 'express', label: 'Express', icon: 'flash-outline', colors: ['#fbbf24', '#f59e0b'] },
  { key: 'iron', label: 'Ironing', icon: 'thermometer-outline', colors: ['#34d399', '#10b981'] },
];

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { favorites, toggleFavorite } = useFavorites();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [coords, setCoords] = useState(null);

  // Soft location lookup (only if already granted) so favorite cards can
  // show distance without prompting on the home screen.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch (e) { /* ignore */ }
    })();
  }, []);

  async function loadDashboard() {
    try {
      const res = await userAPI.getDashboard();
      setData(res.data);
    } catch (error) {
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(useCallback(() => { loadDashboard(); }, []));

  function onRefresh() {
    setRefreshing(true);
    loadDashboard();
  }

  if (loading && !data) {
    return (
      <View style={styles.container}>
        <View style={styles.heroSkeleton} />
        <View style={styles.statsRow}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} width="22%" height={64} radius={12} />)}
        </View>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  const stats = data?.stats || {};

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {/* Hero banner */}
      <ImageBackground source={{ uri: IMAGES.homeBanner }} style={styles.hero} imageStyle={styles.heroImg}>
        <LinearGradient colors={['rgba(13,110,253,0.78)', 'rgba(13,110,253,0.95)']} style={StyleSheet.absoluteFill} />
        <View style={styles.heroTop}>
          <View style={styles.heroUser}>
            <Avatar name={`${user?.firstName} ${user?.lastName}`} size={44} ring />
            <View>
              <Text style={styles.heroHi}>Hello, {user?.firstName} 👋</Text>
              <Text style={styles.heroSub}>Fresh laundry, on demand</Text>
            </View>
          </View>
          <View style={styles.heroIcons}>
            <TouchableOpacity onPress={() => navigation.navigate('Notifications')} style={styles.heroIconBtn}>
              <Ionicons name="notifications-outline" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={logout} style={styles.heroIconBtn}>
              <Ionicons name="log-out-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity style={styles.heroCta} activeOpacity={0.9} onPress={() => navigation.navigate('Orders', { screen: 'ChooseLaundromat' })}>
          <View style={styles.heroCtaLeft}>
            <Ionicons name="add-circle" size={22} color="#1B7BF7" />
            <View>
              <Text style={styles.heroCtaTitle}>Schedule a pickup</Text>
              <Text style={styles.heroCtaSub}>We'll wash, dry & deliver</Text>
            </View>
          </View>
          <Ionicons name="arrow-forward" size={20} color="#1B7BF7" />
        </TouchableOpacity>
      </ImageBackground>

      {/* Stats */}
      <View style={styles.statsRow}>
        <StatCard num={stats.totalRequests || 0} label="Total" color="#1B7BF7" icon="receipt-outline" />
        <StatCard num={stats.pendingRequests || 0} label="Pending" color="#f59e0b" icon="time-outline" />
        <StatCard num={stats.inProcessRequests || 0} label="Active" color="#06b6d4" icon="sync-outline" />
        <StatCard num={formatCurrency(stats.totalSpent || 0)} label="Spent" color="#10b981" icon="wallet-outline" small />
      </View>

      {/* Services */}
      <Text style={styles.sectionTitle}>Our Services</Text>
      <View style={styles.servicesRow}>
        {SERVICES.map((s) => (
          <TouchableOpacity key={s.key} style={styles.serviceTile} activeOpacity={0.85} onPress={() => navigation.navigate('Orders', { screen: 'ChooseLaundromat' })}>
            <LinearGradient colors={s.colors} style={styles.serviceIcon}>
              <Ionicons name={s.icon} size={24} color="#fff" />
            </LinearGradient>
            <Text style={styles.serviceLabel}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Your Favorites */}
      <View style={styles.favHeaderRow}>
        <Text style={styles.sectionTitle}>⭐ Your Favorites</Text>
        {favorites.length > 0 && (
          <TouchableOpacity onPress={() => navigation.navigate('Favorites')}>
            <Text style={styles.seeAll}>See all</Text>
          </TouchableOpacity>
        )}
      </View>
      {favorites.length > 0 ? (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id.toString()}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 4 }}
          renderItem={({ item }) => (
            <FavoriteMiniCard
              item={item}
              coords={coords}
              onToggleFavorite={() => toggleFavorite(item)}
              onNewRequest={() => navigation.navigate('Orders', { screen: 'NewRequest', params: { provider: item } })}
            />
          )}
        />
      ) : (
        <View style={styles.favEmpty}>
          <Ionicons name="heart-outline" size={32} color="#cbd5e1" />
          <Text style={styles.favEmptyText}>You haven't added any favorite laundromats yet.</Text>
          <TouchableOpacity style={styles.favEmptyBtn} onPress={() => navigation.navigate('Nearby', { screen: 'FindNearby' })}>
            <Ionicons name="search" size={15} color="#1B7BF7" />
            <Text style={styles.favEmptyBtnText}>Find laundromats</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Orders', { screen: 'ChooseLaundromat' })}>
          <Ionicons name="add-circle-outline" size={28} color="#1B7BF7" />
          <Text style={styles.actionText}>New Request</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Orders', { screen: 'MyRequests' })}>
          <Ionicons name="list-outline" size={28} color="#1B7BF7" />
          <Text style={styles.actionText}>My Requests</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('Notifications')}>
          <Ionicons name="notifications-outline" size={28} color="#1B7BF7" />
          <Text style={styles.actionText}>Notifications</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Requests */}
      <Text style={styles.sectionTitle}>Recent Requests</Text>
      {data?.recentRequests?.length > 0 ? (
        data.recentRequests.map((req) => (
          <TouchableOpacity key={req.id} style={styles.requestCard} onPress={() => navigation.navigate('Orders', { screen: 'RequestDetails', params: { id: req.id } })}>
            <View style={styles.requestHeader}>
              <Text style={styles.requestNum}>{req.requestNumber}</Text>
              <View style={[styles.badge, { backgroundColor: getStatusColor(req.status) }]}>
                <Text style={styles.badgeText}>{formatStatus(req.status)}</Text>
              </View>
            </View>
            <Text style={styles.requestInfo}>{req.laundryType} • {formatCurrency(req.totalAmount)}</Text>
            <Text style={styles.requestDate}>{formatDate(req.createdAt)}</Text>
          </TouchableOpacity>
        ))
      ) : (
        <EmptyState
          icon="cube-outline"
          title="No orders yet"
          subtitle="Schedule your first laundry pickup and we'll take care of the rest."
          actionLabel="Create a Request"
          onAction={() => navigation.navigate('Orders', { screen: 'ChooseLaundromat' })}
        />
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function StatCard({ num, label, color, icon, small }) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.statNum, small && { fontSize: 14 }]} numberOfLines={1}>{num}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// Horizontal favorite card for the Home screen.
function FavoriteMiniCard({ item, coords, onToggleFavorite, onNewRequest }) {
  const openStatus = isOpenNow(item.businessHours);
  const initial = (item.businessName || '?').trim().charAt(0).toUpperCase();
  const distanceKm = coords && item.latitude != null && item.longitude != null
    ? haversineKm(coords.latitude, coords.longitude, item.latitude, item.longitude)
    : item.distanceKm ?? null;

  return (
    <View style={styles.favCard}>
      <View style={styles.favCardTop}>
        <View style={styles.favLogo}>
          <Ionicons name="storefront" size={18} color="#fff" />
          <View style={styles.favLogoBadge}><Text style={styles.favLogoBadgeText}>{initial}</Text></View>
        </View>
        <FavoriteHeart active onToggle={onToggleFavorite} size={20} />
      </View>

      <Text style={styles.favName} numberOfLines={1}>{item.businessName}</Text>

      <View style={styles.favMetaRow}>
        <Ionicons name="star" size={12} color="#f59e0b" />
        <Text style={styles.favMetaText}>
          {item.avgRating > 0 ? item.avgRating.toFixed(1) : 'New'}
        </Text>
        {distanceKm != null && (
          <>
            <Text style={styles.favDot}>·</Text>
            <Ionicons name="location-sharp" size={11} color="#3b82f6" />
            <Text style={styles.favMetaText}>{formatDistance(distanceKm)}</Text>
          </>
        )}
      </View>

      {openStatus !== null && (
        <View style={[styles.favOpenBadge, { backgroundColor: openStatus ? '#d1fae5' : '#fee2e2' }]}>
          <View style={[styles.favOpenDot, { backgroundColor: openStatus ? '#10b981' : '#ef4444' }]} />
          <Text style={[styles.favOpenText, { color: openStatus ? '#065f46' : '#991b1b' }]}>
            {openStatus ? 'Open' : 'Closed'}
          </Text>
        </View>
      )}

      <TouchableOpacity style={styles.favNewReqBtn} onPress={onNewRequest} activeOpacity={0.85}>
        <Ionicons name="basket" size={14} color="#fff" />
        <Text style={styles.favNewReqText}>New Request</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },

  // Favorites section
  favHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginTop: 20, marginBottom: 10 },
  seeAll: { fontSize: 13, fontWeight: '700', color: '#1B7BF7' },
  favEmpty: { backgroundColor: '#fff', marginHorizontal: 16, borderRadius: 12, padding: 24, alignItems: 'center', gap: 8, elevation: 1 },
  favEmptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
  favEmptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#eff6ff' },
  favEmptyBtnText: { fontSize: 13, fontWeight: '700', color: '#1B7BF7' },
  favCard: { width: 220, backgroundColor: '#fff', borderRadius: 14, padding: 14, marginRight: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, borderWidth: 1.5, borderColor: '#fde68a' },
  favCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  favLogo: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' },
  favLogoBadge: { position: 'absolute', bottom: -3, right: -3, backgroundColor: '#fff', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#3b82f6' },
  favLogoBadgeText: { fontSize: 9, fontWeight: '800', color: '#3b82f6' },
  favName: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginTop: 10 },
  favMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  favMetaText: { fontSize: 12, color: '#4b5563', fontWeight: '600' },
  favDot: { fontSize: 12, color: '#cbd5e1', marginHorizontal: 2 },
  favOpenBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 7, marginTop: 8 },
  favOpenDot: { width: 6, height: 6, borderRadius: 3 },
  favOpenText: { fontSize: 10, fontWeight: '700' },
  favNewReqBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#10b981', borderRadius: 10, paddingVertical: 9, marginTop: 12 },
  favNewReqText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Hero banner
  hero: { paddingTop: 50, paddingBottom: 18, paddingHorizontal: 18, overflow: 'hidden' },
  heroImg: { resizeMode: 'cover' },
  heroSkeleton: { height: 170, backgroundColor: '#dbe6f5' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroUser: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroHi: { color: '#fff', fontSize: 17, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 1 },
  heroIcons: { flexDirection: 'row', gap: 8 },
  heroIconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  heroCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginTop: 18, elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  heroCtaLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroCtaTitle: { fontSize: 15, fontWeight: '800', color: '#1f2937' },
  heroCtaSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },

  // Stats
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, gap: 8, paddingTop: 16 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, alignItems: 'center', gap: 3, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  statNum: { fontSize: 18, fontWeight: '800', color: '#1f2937' },
  statLabel: { fontSize: 11, color: '#94a3b8' },

  // Services
  servicesRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, gap: 10 },
  serviceTile: { flex: 1, alignItems: 'center', gap: 7 },
  serviceIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  serviceLabel: { fontSize: 11.5, color: '#475569', fontWeight: '600' },

  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1f2937', marginHorizontal: 16, marginTop: 22, marginBottom: 12 },
  actionsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 12 },
  actionBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, alignItems: 'center', gap: 8, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  actionIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12, color: '#334155', marginTop: 2, fontWeight: '700', textAlign: 'center' },
  requestCard: { backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8, borderRadius: 8, padding: 14, elevation: 1 },
  requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  requestNum: { fontSize: 15, fontWeight: '700', color: '#1B7BF7' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  requestInfo: { fontSize: 13, color: '#495057', marginTop: 4 },
  requestDate: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  emptyCard: { backgroundColor: '#fff', margin: 16, borderRadius: 8, padding: 30, alignItems: 'center', elevation: 1 },
  emptyText: { color: '#6c757d', marginTop: 8, fontSize: 14 },
  createBtn: { backgroundColor: '#1B7BF7', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10, marginTop: 12 },
  createBtnText: { color: '#fff', fontWeight: '600' },
});
