import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SettingsProvider } from './context/SettingsContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import AppLayout from './components/AppLayout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import ProductDetail from './pages/ProductDetail.jsx';
import NewTransaction from './pages/NewTransaction.jsx';
import ManageLists from './pages/ManageLists.jsx';
import ManageServices from './pages/ManageServices.jsx';
import Settings from './pages/Settings.jsx';
import Users from './pages/Users.jsx';
import ActivityLog from './pages/ActivityLog.jsx';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <SettingsProvider>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inventory" element={<Inventory />} />
                    <Route path="/inventory/:id" element={<ProductDetail />} />
                    <Route path="/new-transaction" element={<NewTransaction />} />
                    <Route path="/services/manage" element={<ManageServices />} />
                    <Route path="/lists" element={<ManageLists />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route
                      path="/users"
                      element={
                        <ProtectedRoute adminOnly>
                          <Users />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="/activity-log" element={<ActivityLog />} />
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
