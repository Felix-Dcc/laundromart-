import React, {
  createContext, useContext, useState, useEffect, useCallback,
} from 'react';
import { favoritesAPI } from '../api/client';
import { useAuth } from './AuthContext';

/**
 * Global favorites cache — single source of truth across the app.
 * Optimistic updates so every heart/card/marker reflects changes instantly
 * (no refresh, no restart). Only the affected item re-renders because
 * consumers read isFavorite(id) and components are memoized on it.
 */
const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const { user, isLoggedIn } = useAuth();
  const [favorites, setFavorites] = useState([]);            // full provider objects
  const [favoriteIds, setFavoriteIds] = useState(new Set()); // Set<providerId>
  const [counts, setCounts] = useState({});                  // providerId → favoriteCount
  const [loading, setLoading] = useState(false);

  const isCustomer = isLoggedIn && user?.userType === 'user';

  const refresh = useCallback(async () => {
    if (!isCustomer) {
      setFavorites([]);
      setFavoriteIds(new Set());
      return;
    }
    setLoading(true);
    try {
      const res = await favoritesAPI.list();
      const list = res.data.favorites || [];
      setFavorites(list);
      setFavoriteIds(new Set(list.map((f) => f.id)));
      setCounts((prev) => {
        const next = { ...prev };
        list.forEach((f) => { next[f.id] = f.favoriteCount ?? next[f.id] ?? 0; });
        return next;
      });
    } catch (e) {
      // keep whatever we had cached
    } finally {
      setLoading(false);
    }
  }, [isCustomer]);

  // Load (and reset on logout / role change).
  useEffect(() => { refresh(); }, [refresh]);

  const isFavorite = useCallback((providerId) => favoriteIds.has(providerId), [favoriteIds]);

  // Live count for a provider: prefer the optimistic cache, fall back to the
  // count carried on the provider object.
  const getCount = useCallback(
    (provider) => counts[provider?.id] ?? provider?.favoriteCount ?? 0,
    [counts],
  );

  const toggleFavorite = useCallback(async (provider) => {
    if (!provider?.id) return;
    const id = provider.id;
    const wasFav = favoriteIds.has(id);

    // ── optimistic update ──
    setFavoriteIds((prev) => {
      const n = new Set(prev);
      if (wasFav) n.delete(id); else n.add(id);
      return n;
    });
    setFavorites((prev) => (
      wasFav
        ? prev.filter((p) => p.id !== id)
        : [{ ...provider, isFavorite: true }, ...prev.filter((p) => p.id !== id)]
    ));
    setCounts((prev) => ({
      ...prev,
      [id]: Math.max(0, (prev[id] ?? provider.favoriteCount ?? 0) + (wasFav ? -1 : 1)),
    }));

    // ── persist ──
    try {
      const res = wasFav ? await favoritesAPI.remove(id) : await favoritesAPI.add(id);
      if (res?.data?.favoriteCount != null) {
        setCounts((prev) => ({ ...prev, [id]: res.data.favoriteCount }));
      }
    } catch (e) {
      // rollback on failure
      setFavoriteIds((prev) => {
        const n = new Set(prev);
        if (wasFav) n.add(id); else n.delete(id);
        return n;
      });
      refresh();
    }
  }, [favoriteIds, refresh]);

  const value = {
    favorites,
    favoriteIds,
    loading,
    isFavorite,
    getCount,
    toggleFavorite,
    refresh,
  };

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within a FavoritesProvider');
  return ctx;
}

export default FavoritesContext;
