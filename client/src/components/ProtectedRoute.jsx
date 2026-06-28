import { Navigate } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { useAuth } from '../context/AuthContext.jsx';

export default function ProtectedRoute({ children, requiredCap = null }) {
  const { user, loading, can } = useAuth();
  if (loading) return <Center h="100vh"><Loader /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.force_password_change) return <Navigate to="/force-change-password" replace />;
  if (requiredCap) {
    const caps = Array.isArray(requiredCap) ? requiredCap : [requiredCap];
    if (!caps.some(can)) return <Navigate to="/" replace />;
  }
  return children;
}
