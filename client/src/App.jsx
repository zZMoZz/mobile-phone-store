import { Routes, Route, Navigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { AuthProvider } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import { useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';
import Login from './pages/Login.jsx';
import ForceChangePassword from './pages/ForceChangePassword.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import NewTransaction from './pages/NewTransaction.jsx';
import Transactions from './pages/Transactions.jsx';
import ManageLists from './pages/ManageLists.jsx';
import ManageServices from './pages/ManageServices.jsx';
import Settings from './pages/Settings.jsx';
import ActivityLog from './pages/ActivityLog.jsx';

// Guarded route for /force-change-password:
// - Requires a valid token (redirects to /login if not authenticated)
// - Requires force_password_change=true (redirects to / if already completed)
function ForceChangeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Center h="100vh"><Loader /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.force_password_change) return <Navigate to="/" replace />;
  return <ForceChangePassword />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/force-change-password" element={<ForceChangeRoute />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <SettingsProvider>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inventory" element={<ProtectedRoute requiredCap="inventory.view"><Inventory /></ProtectedRoute>} />
                    <Route path="/inventory/:id" element={<ProtectedRoute requiredCap="inventory.view"><ProductDetail /></ProtectedRoute>} />
                    <Route path="/new-transaction" element={<NewTransaction />} />
                    <Route path="/transactions" element={<Transactions />} />
                    <Route path="/services/manage" element={<ProtectedRoute requiredCap="services.manage"><ManageServices /></ProtectedRoute>} />
                    <Route path="/lists" element={<ProtectedRoute requiredCap="lists.manage"><ManageLists /></ProtectedRoute>} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/activity-log" element={<ProtectedRoute requiredCap="see.activity_log"><ActivityLog /></ProtectedRoute>} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </AppLayout>
              </SettingsProvider>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
