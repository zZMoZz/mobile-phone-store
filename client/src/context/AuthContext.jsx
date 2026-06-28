import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { loginApi, logoutApi, getMeApi, forceChangePasswordApi, changePasswordApi } from '../api/auth.js';
import { updateUser } from '../api/users.js';

const TOKEN_KEY = 'store.auth-token';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  // Keep axios Authorization header in sync with token
  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete api.defaults.headers.common['Authorization'];
    }
  }, [token]);

  // Validate token on mount; redirect if force_password_change is set
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    getMeApi()
      .then((u) => setUser(u))
      .catch(() => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 401 interceptor — auto-logout on expired token mid-session
  useEffect(() => {
    const id = api.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 && user) handleLogout();
        return Promise.reject(err);
      },
    );
    return () => api.interceptors.response.eject(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Fire a logout beacon if the user closes the tab or browser without clicking logout
  useEffect(() => {
    if (!token) return;
    const handleUnload = () => {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      });
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [token]);

  const applySession = useCallback((newToken, newUser) => {
    sessionStorage.setItem(TOKEN_KEY, newToken);
    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
    setToken(newToken);
    setUser(newUser);
  }, []);

  const handleLogout = useCallback(async () => {
    await logoutApi();
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const login = useCallback(async (username, password) => {
    const { token: t, user: u } = await loginApi(username, password);
    applySession(t, u);
  }, [applySession]);

  const forceChangePassword = useCallback(async (new_password) => {
    const { token: t, user: u, recovery_code } = await forceChangePasswordApi(new_password);
    applySession(t, u);
    return recovery_code; // may be null for staff
  }, [applySession]);

  const changePassword = useCallback(async (current_password, new_password) => {
    const { token: t, user: u, recovery_code } = await changePasswordApi(current_password, new_password);
    applySession(t, u);
    return recovery_code ?? null;
  }, [applySession]);

  const updateUserInContext = useCallback(async (id, patch) => {
    const updated = await updateUser(id, patch);
    if (user && updated.id === user.id) {
      setUser((prev) => ({ ...prev, ...updated }));
    }
    return updated;
  }, [user]);

  const isOwner = useMemo(() => user?.role === 'owner', [user]);

  // Capability check: the owner implicitly holds every capability; everyone else
  // is gated by their explicit permissions array.
  const can = useCallback(
    (cap) => user?.role === 'owner' || (user?.permissions ?? []).includes(cap),
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, isOwner, can, login, logout: handleLogout, forceChangePassword, changePassword, updateUserInContext }),
    [user, loading, isOwner, can, login, handleLogout, forceChangePassword, changePassword, updateUserInContext],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
