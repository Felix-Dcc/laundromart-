import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import { riderAPI } from '../api/client';
import { useAuth } from './AuthContext';
import { startRiderTracking, stopRiderTracking, updateTrackedOrders } from '../services/riderTracking';

const RiderContext = createContext();

export function RiderProvider({ children }) {
  const { user } = useAuth();
  const [activeTasks, setActiveTasks] = useState([]);   // all active pickup tasks
  const [maxActiveTasks, setMaxActiveTasks] = useState(3);
  const [riderStatus, setRiderStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const isMountedRef = useRef(true);
  const pollRef = useRef(null);

  // Derived single-task value kept for backward compatibility with older screens.
  const activeTask = activeTasks[0] || null;
  const activeTaskCount = activeTasks.length;
  const canAcceptMore = activeTaskCount < maxActiveTasks;

  const fetchTasks = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const res = await riderAPI.getTasks();
      if (!isMountedRef.current) return;
      setActiveTasks(res.data.tasks || []);
      if (res.data.maxActiveTasks) setMaxActiveTasks(res.data.maxActiveTasks);
    } catch (error) {
      // keep last-known tasks on transient errors
      if (error.response?.status === 401) return;
    }
  }, []);

  const fetchRiderStatus = useCallback(async () => {
    if (!isMountedRef.current) return null;
    try {
      const res = await riderAPI.getStatus();
      const status = res.data.rider?.riderStatus;
      setRiderStatus((prev) => (prev !== status ? status : prev));
      if (res.data.maxActiveTasks) setMaxActiveTasks(res.data.maxActiveTasks);
      return status;
    } catch (error) {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([fetchRiderStatus(), fetchTasks()]);
  }, [fetchRiderStatus, fetchTasks]);

  // Alias kept for existing callers.
  const forceFetchActiveTask = fetchTasks;

  // Initial load.
  useEffect(() => {
    isMountedRef.current = true;
    (async () => {
      setLoading(true);
      await refresh();
      if (isMountedRef.current) setLoading(false);
    })();
    return () => {
      isMountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Poll tasks + status while mounted (multi-task: always, light cadence).
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (isMountedRef.current) refresh();
    }, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [refresh]);

  // Drive live-location tracking from the active task set. The tracker
  // broadcasts to every active order's room. Survives screen changes (this
  // provider sits at the rider app root) until all tasks are delivered.
  useEffect(() => {
    if (activeTasks.length > 0 && user?.id) {
      startRiderTracking(activeTasks, user.id);
      updateTrackedOrders(activeTasks, user.id);
    } else {
      stopRiderTracking();
    }
  }, [activeTasks, user?.id]);

  useEffect(() => () => { stopRiderTracking(); }, []);

  const value = {
    activeTasks,
    activeTask,           // first task (compat)
    activeTaskCount,
    maxActiveTasks,
    canAcceptMore,
    riderStatus,
    loading,
    setActiveTasks,
    setRiderStatus,
    fetchTasks,
    fetchActiveTask: fetchTasks, // compat alias
    fetchRiderStatus,
    refresh,
    forceFetchActiveTask,
  };

  return <RiderContext.Provider value={value}>{children}</RiderContext.Provider>;
}

export function useRider() {
  const context = useContext(RiderContext);
  if (!context) {
    throw new Error('useRider must be used within RiderProvider');
  }
  return context;
}
