import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Placeholder from './pages/Placeholder';
import { Loading } from './components/ui';

// Lazy-load pages for fast first paint.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Orders = lazy(() => import('./pages/Orders'));
const Users = lazy(() => import('./pages/Users'));
const Providers = lazy(() => import('./pages/Providers'));
const Services = lazy(() => import('./pages/Services'));
const Riders = lazy(() => import('./pages/Riders'));
const LiveOps = lazy(() => import('./pages/LiveOps'));
const Payments = lazy(() => import('./pages/Payments'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Reviews = lazy(() => import('./pages/Reviews'));
const Admins = lazy(() => import('./pages/Admins'));
const Settings = lazy(() => import('./pages/Settings'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const SystemHealth = lazy(() => import('./pages/SystemHealth'));
const Promotions = lazy(() => import('./pages/Promotions'));
const Security = lazy(() => import('./pages/Security'));
const Profile = lazy(() => import('./pages/Profile'));
const Reports = lazy(() => import('./pages/Reports'));
const Support = lazy(() => import('./pages/Support'));

function Protected({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="center-screen"><span className="spinner" /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<div className="center-screen"><span className="spinner" /></div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="live-ops" element={<LiveOps />} />
          <Route path="orders" element={<Orders />} />
          <Route path="users" element={<Users />} />
          <Route path="providers" element={<Providers />} />
          <Route path="services" element={<Services />} />
          <Route path="riders" element={<Riders />} />
          <Route path="admins" element={<Admins />} />
          <Route path="payments" element={<Payments />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="reports" element={<Reports />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="promotions" element={<Promotions />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="support" element={<Support />} />
          <Route path="settings" element={<Settings />} />
          <Route path="audit" element={<AuditLogs />} />
          <Route path="security" element={<Security />} />
          <Route path="health" element={<SystemHealth />} />
          <Route path="profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
